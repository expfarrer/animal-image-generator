// app/api/generate-image/route.ts
import { NextResponse } from "next/server";
import { deflateSync } from "zlib";

/**
 * Generates a fully transparent RGBA PNG of the given dimensions.
 * Used as the mask for DALL-E 2 /images/edits so it regenerates the whole image.
 */
function createTransparentPng(width: number, height: number): Buffer {
  const crcTable = (() => {
    const t: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++)
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type: string, data: Buffer): Buffer {
    const typeBytes = Buffer.from(type, "ascii");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const payload = Buffer.concat([typeBytes, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(payload), 0);
    return Buffer.concat([lenBuf, payload, crcBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const row = Buffer.alloc(1 + width * 4, 0); // filter byte + RGBA zeros = fully transparent
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const runtime = "nodejs";

/**
 * Image generation route for DALL·E-style accounts with robust behavior:
 * - Maps size hints to allowed 256/512/1024 sizes
 * - Calls images/edits and returns provider result (url or b64_json)
 * - Detects when provider returns the exact same bytes as the uploaded input (identical output)
 *   and returns `identical: true` in that case so the client can retry a text-only generation.
 * - Accepts an optional "no_image" form field (value "1") to force text-only generation (no uploaded image).
 *
 * Notes:
 * - Uses DEFAULT_MODEL = "dall-e-2". If your account uses a different model name for generations,
 *   tell me the model name and I will swap it in.
 * - If you want the server to automatically retry text-only generation when identical output is detected,
 *   I can enable that behavior; by default the client controls whether to retry (safer).
 */

// Used for the image-editing path (gpt-image-1 /images/edits):
// references "the uploaded animal" because the model can see the photo.
const promptTemplates: Record<string, string> = {
  celebration:
    "A joyful, colorful celebration scene centered around the uploaded animal. Add confetti, warm sunlight, and a festive banner that reads '{{caption}}'. Photorealistic, bright, high detail.",
  memorial:
    "A respectful, soft-toned portrait of the uploaded animal with gentle light and a subtle floral arrangement. Soft vignette, cinematic film look, calm and reverent.",
  retirement:
    "A playful retirement-themed scene with the uploaded animal wearing a party hat and holding a small cake, warm tones, whimsical photorealism.",
  fantasy:
    "Transform the uploaded animal into a fantasy creature with glowing wings and soft magical light. Painterly, highly detailed.",
  // Keywords-only: no theme template — the user's keywords ARE the full prompt.
  keywords: "{{caption}}",
};

// Used for text-only generation (/images/generations — no photo supplied).
// Uses {{animal}} (filled from classifierLabel or "pet") instead of "the uploaded animal".
// Caption handling is identical to promptTemplates above.
const promptTemplatesTextOnly: Record<string, string> = {
  celebration:
    "A joyful, colorful celebration scene featuring a {{animal}} as the star. Add confetti, warm sunlight, and a festive banner that reads '{{caption}}'. Photorealistic, vibrant, high detail.",
  memorial:
    "A respectful, soft-toned portrait of a {{animal}} with gentle golden light and a subtle arrangement of flowers. Soft vignette, cinematic film look, calm and reverent.",
  retirement:
    "A whimsical retirement-themed scene with a {{animal}} wearing a party hat and holding a small cake, warm tones, playful photorealism.",
  fantasy:
    "A {{animal}} transformed into a majestic fantasy creature with glowing wings and ethereal soft light. Painterly, highly detailed, magical.",
  // Keywords-only: no theme template — the user's keywords ARE the full prompt.
  keywords: "{{caption}}",
};

// gpt-image-1 pricing estimates (token-based; these are rough per-image approximations)
const COST_TABLE: Record<string, number> = {
  low: 0.02,
  medium: 0.07,
  high: 0.19,
};

const DEFAULT_MODEL = "gpt-image-1";
// gpt-image-1 supports: 1024x1024 | 1024x1536 | 1536x1024
// Fallback when client sends no size or an invalid value.
const DEFAULT_SIZE = "1024x1024";

async function fileToBuffer(file: File) {
  const ab = await file.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Runs OpenAI's moderation API on an image buffer and a text string.
 * Returns the flagged categories if content is rejected, or null if clean.
 */
async function moderateContent(
  imageB64: string | null,
  text: string | null,
): Promise<string[] | null> {
  const input: any[] = [];
  if (text) input.push({ type: "text", text });
  if (imageB64) {
    input.push({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${imageB64}` },
    });
  }
  if (input.length === 0) return null;

  const res = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "omni-moderation-latest", input }),
  });

  if (!res.ok) {
    console.warn("[moderation] API error, skipping check:", await res.text());
    return null; // fail open — don't block on moderation outage
  }

  const json = await res.json();
  const result = json?.results?.[0];
  if (!result?.flagged) return null;

  return Object.entries(result.categories as Record<string, boolean>)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

const ALLOWED_TOPICS = new Set(Object.keys(promptTemplates));
const ALLOWED_QUALITIES = new Set(["low", "medium", "high"]);
const ALLOWED_SIZES = new Set(["1024x1024", "1024x1536", "1536x1024"]);
// classifierLabel is a free-form ImageNet label — strip to safe chars, cap length
function sanitizeClassifierLabel(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 80);
  return cleaned || null;
}

import { checkRateLimit } from "../../lib/rateLimit";

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: `Too many requests. Please wait ${rl.retryAfterSec} seconds before trying again.` }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rl.retryAfterSec),
        },
      },
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("image") as File | null;
    const topicRaw = (form.get("topic") as string) || "celebration";
    const topic = ALLOWED_TOPICS.has(topicRaw) ? topicRaw : "celebration";
    const caption = (form.get("caption") as string) || "";
    const qualityRaw = (form.get("quality") as string) || "low";
    const quality = ALLOWED_QUALITIES.has(qualityRaw) ? qualityRaw : "low";
    const sizeRaw = (form.get("size") as string) || DEFAULT_SIZE;
    const size = ALLOWED_SIZES.has(sizeRaw) ? sizeRaw : DEFAULT_SIZE;
    const noImageFlag = (form.get("no_image") as string) === "1";
    const classifierLabel = sanitizeClassifierLabel(form.get("classifier_label") as string | null);

    if (!file && !noImageFlag) {
      return new Response(JSON.stringify({ error: "No image uploaded" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // if we have a file, guard size
    let inputBuffer: Buffer | null = null;
    let inputB64: string | null = null;
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        return new Response(
          JSON.stringify({ error: "Image too large (max 5MB)" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      inputBuffer = await fileToBuffer(file);
      inputB64 = inputBuffer.toString("base64");
    }

    // Moderate image and caption before doing anything expensive
    const flaggedCategories = await moderateContent(inputB64, caption || null);
    if (flaggedCategories) {
      console.warn("[moderation] content flagged:", flaggedCategories);
      return new Response(
        JSON.stringify({
          error: "Content policy violation",
          detail: "The uploaded image or text was flagged as inappropriate and cannot be processed.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // build prompt
    // Templates that embed {{caption}} mid-sentence get it replaced directly.
    // Templates without a slot get the caption appended at the end if provided.
    const template = promptTemplates[topic] ?? promptTemplates["celebration"];
    const promptBase = template.includes("{{caption}}")
      ? template.replace("{{caption}}", caption)
      : caption
        ? `${template} ${caption}`
        : template;

    console.log("[generate-image] topic:", topic, "| caption:", caption);
    console.log("[generate-image] prompt:", promptBase);

    const sizeUsed = size;
    const costEstimate = COST_TABLE[quality] ?? COST_TABLE["medium"];

    // prepare form and call provider
    // If noImageFlag is set, generate from prompt only (text-only generation)
    // Otherwise call edits endpoint with provided image and prompt
    if (noImageFlag || !file) {
      // Text-only generation — build a dedicated prompt that never references "the uploaded animal"
      const animalSlot = classifierLabel ?? "pet";
      const textOnlyTemplate =
        (promptTemplatesTextOnly[topic] ?? promptTemplatesTextOnly["celebration"])
          .replace("{{animal}}", animalSlot);
      const genPrompt = textOnlyTemplate.includes("{{caption}}")
        ? textOnlyTemplate.replace("{{caption}}", caption)
        : caption
          ? `${textOnlyTemplate} ${caption}`
          : textOnlyTemplate;

      console.log("[generate-image] text-only prompt:", genPrompt);

      const body = JSON.stringify({
        model: DEFAULT_MODEL,
        prompt: genPrompt,
        quality,
        size: sizeUsed,
      });

      const t0 = Date.now();
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body,
      });
      const t1 = Date.now();
      const latencyMs = t1 - t0;
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        console.error("[generate-image] provider error (generation):", json ?? text);
        return new Response(
          JSON.stringify({ error: "Image generation failed. Please try again." }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        );
      }

      // result could be url or b64_json depending on provider
      if (json?.data?.[0]?.url) {
        return NextResponse.json({
          url: json.data[0].url,
          text_only: true,
          latency_ms: latencyMs,
          cost_usd: costEstimate,
          model_used: DEFAULT_MODEL,
          size_used: sizeUsed,
        });
      }
      if (json?.data?.[0]?.b64_json) {
        const b64 = json.data[0].b64_json;
        const dataUrl = `data:image/png;base64,${b64}`;
        return NextResponse.json({
          url: dataUrl,
          text_only: true,
          latency_ms: latencyMs,
          cost_usd: costEstimate,
          model_used: DEFAULT_MODEL,
          size_used: sizeUsed,
        });
      }

      // unexpected
      console.error("[generate-image] unexpected provider response (generation):", json);
      return new Response(
        JSON.stringify({ error: "Image generation failed. Please try again." }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    // Image editing path — gpt-image-1 understands the reference image natively;
    // no mask needed for full-image style transformation.
    const imgW = (inputBuffer as Buffer).readUInt32BE(16);
    const imgH = (inputBuffer as Buffer).readUInt32BE(20);
    const fd = new FormData();
    fd.append("model", DEFAULT_MODEL);
    const blob = new Blob([inputBuffer as Buffer], {
      type: (file as any).type || "image/png",
    });
    fd.append("image", blob, "input.png");
    fd.append("prompt", promptBase);
    fd.append("quality", quality);
    fd.append("size", sizeUsed);

    const t0 = Date.now();
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: fd as any,
    });
    const t1 = Date.now();
    const latencyMs = t1 - t0;
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!response.ok) {
      console.error("[generate-image] provider error (edits):", json ?? text);
      return new Response(
        JSON.stringify({ error: "Image generation failed. Please try again." }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    // extract provider image
    let outB64: string | null = null;
    if (json?.data?.[0]?.b64_json) {
      outB64 = json.data[0].b64_json;
    } else if (json?.data?.[0]?.url) {
      // provider returned a url — server could fetch it and compare bytes but that's extra bandwidth.
      // We'll return the url directly; client will display. We still try to detect identical when b64 is provided.
      return NextResponse.json({
        url: json.data[0].url,
        latency_ms: latencyMs,
        cost_usd: costEstimate,
        model_used: DEFAULT_MODEL,
        size_used: sizeUsed,
        prompt_used: promptBase,
        image_dimensions: `${imgW}x${imgH}`,
      });
    } else {
      // unexpected
      console.error("[generate-image] unexpected provider response (edits):", json);
      return new Response(
        JSON.stringify({ error: "Image generation failed. Please try again." }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    // If we have b64 output, detect if identical to input (same bytes)
    if (outB64 && inputB64) {
      // simplest detection: compare base64 strings
      if (outB64 === inputB64) {
        // provider returned exactly the same image bytes — signal to client
        return NextResponse.json({
          identical: true,
          message: "Provider returned identical image bytes",
          model_used: DEFAULT_MODEL,
          size_used: sizeUsed,

          latency_ms: latencyMs,
          cost_usd: costEstimate,
          prompt_used: promptBase,
          image_dimensions: `${imgW}x${imgH}`,
        });
      } else {
        const dataUrl = `data:image/png;base64,${outB64}`;
        return NextResponse.json({
          url: dataUrl,
          latency_ms: latencyMs,
          cost_usd: costEstimate,
          model_used: DEFAULT_MODEL,
          size_used: sizeUsed,

          prompt_used: promptBase,
          image_dimensions: `${imgW}x${imgH}`,
        });
      }
    }

    // fallback
    console.error("[generate-image] no usable image in provider response:", json);
    return new Response(
      JSON.stringify({ error: "Image generation failed. Please try again." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("Server error in generate-image route:", err);
    return new Response(
      JSON.stringify({ error: "Server error. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
