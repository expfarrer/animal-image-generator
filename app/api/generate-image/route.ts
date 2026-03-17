// app/api/generate-image/route.ts
import { NextResponse } from "next/server";
import { deflateSync } from "zlib";
import { requireCredits } from "../../features/credits";

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

// A-level base prompts — photo editing path (gpt-image-1 /images/edits).
// These are intentionally generic: mood, composition, atmosphere only.
// B-level details and user-entered details are appended on top at assembly time.
const promptTemplates: Record<string, string> = {
  celebration:
    "A joyful celebratory portrait centered on the uploaded animal. Bright natural lighting, uplifting mood, warm colors, and a festive atmosphere. The animal is the clear focal point in a lively celebration scene. Photorealistic, high detail, balanced composition.",
  memorial:
    "A calm and respectful portrait centered on the uploaded animal. Soft gentle lighting, peaceful atmosphere, and warm emotional tone. The scene feels quiet, reflective, and dignified with the animal as the focal point. Photorealistic, cinematic depth of field, high detail.",
  love:
    "A warm affectionate portrait centered on the uploaded animal. Soft glowing light, gentle colors, and a loving emotional atmosphere. The animal is the focus in a sweet and heartfelt scene. Photorealistic, high detail, soft depth of field.",
  patriotic:
    "A proud and uplifting portrait centered on the uploaded animal. Strong lighting, confident composition, and a celebratory atmosphere. The animal appears heroic and dignified in a bold scene. Photorealistic, vibrant colors, high detail.",
  royal:
    "A majestic formal portrait centered on the uploaded animal. Elegant lighting, refined atmosphere, and noble composition. The animal appears proud and dignified as the central subject. Highly detailed, classic portrait style, dramatic lighting.",
  fantasy:
    "A magical fantasy portrait centered on the uploaded animal. Soft mystical lighting, dreamlike atmosphere, and imaginative scenery. The animal appears transformed in a whimsical fantasy setting. Painterly style, high detail, cinematic composition.",
  hero:
    "Transform the uploaded animal into a heroic character. Dramatic lighting, cinematic atmosphere, powerful stance, epic composition as if the animal is a legendary hero.",
  cartoon:
    "Transform the uploaded animal into a cute cartoon character. Bright colors, playful expression, soft outlines, and a cheerful animated style. The animal is the clear focal point in a fun cartoon scene. High detail, polished illustration style, expressive composition.",
  custom:
    "Create an imaginative portrait centered on the uploaded animal. The scene reflects the user's description and visual ideas. The animal is the clear focal point in a creative setting. Photorealistic, high detail, balanced composition.",
};

// A-level base prompts — text-only path (/images/generations, no photo supplied).
// Uses {{animal}} filled from classifierLabel or "pet".
const promptTemplatesTextOnly: Record<string, string> = {
  celebration:
    "A joyful celebratory portrait of a {{animal}}. Bright natural lighting, uplifting mood, warm colors, and a festive atmosphere. The animal is the clear focal point in a lively celebration scene. Photorealistic, high detail, balanced composition.",
  memorial:
    "A calm and respectful portrait of a {{animal}}. Soft gentle lighting, peaceful atmosphere, and warm emotional tone. The scene feels quiet, reflective, and dignified with the animal as the focal point. Photorealistic, cinematic depth of field, high detail.",
  love:
    "A warm affectionate portrait of a {{animal}}. Soft glowing light, gentle colors, and a loving emotional atmosphere. The animal is the focus in a sweet and heartfelt scene. Photorealistic, high detail, soft depth of field.",
  patriotic:
    "A proud and uplifting portrait of a {{animal}}. Strong lighting, confident composition, and a celebratory atmosphere. The animal appears heroic and dignified in a bold scene. Photorealistic, vibrant colors, high detail.",
  royal:
    "A majestic formal portrait of a {{animal}}. Elegant lighting, refined atmosphere, and noble composition. The animal appears proud and dignified as the central subject. Highly detailed, classic portrait style, dramatic lighting.",
  fantasy:
    "A magical fantasy portrait of a {{animal}}. Soft mystical lighting, dreamlike atmosphere, and imaginative scenery. The animal appears transformed in a whimsical fantasy setting. Painterly style, high detail, cinematic composition.",
  hero:
    "A {{animal}} portrayed as a heroic character. Dramatic cinematic lighting, epic atmosphere, powerful stance, heroic composition.",
  cartoon:
    "A {{animal}} illustrated as a cute cartoon character. Bright colors, playful expression, soft outlines, and a cheerful animated style. The animal is the clear focal point in a fun cartoon scene. High detail, polished illustration style, expressive composition.",
  custom:
    "Create an imaginative portrait of a {{animal}} based on the user's description. The animal is the clear focal point in a creative setting. Photorealistic, high detail, balanced composition.",
};

// Appended to every final prompt after A-level base + user details.
// Enforces consistent composition and subject clarity across all themes.
const UNIVERSAL_PROMPT_ENDING =
  "centered composition, subject facing camera, clear subject focus, natural anatomy, realistic proportions, clean details, sharp focus, professional photography";

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
import { checkGuestRateLimit } from "../../lib/guestRateLimit";
import { readGuestId } from "../../lib/guestSession";

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

  // Guest session rate limit — KV-backed, 5 requests per 60 seconds per guest.
  // Fires before any OpenAI work. Falls through silently if no guest cookie
  // (requireCredits below will return 401 in that case anyway).
  const guestId = readGuestId(req);
  if (guestId) {
    const grl = await checkGuestRateLimit(guestId);
    if (!grl.allowed) {
      return new Response(
        JSON.stringify({ error: "rate_limited" }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // Credit guard — enforces guest session credits (cookie-based, no login required).
  // BYPASS_CREDITS=true in .env.local lets requests through during local dev.
  return requireCredits(req, async () => {
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
    // B-level beans: strip to safe chars, cap per-bean length to prevent injection.
    // Custom theme never uses beans — it is a pure manual-details path.
    const beansRaw = topic === "custom" ? "" : (form.get("beans") as string) || "";
    const beans = beansRaw.replace(/[^a-zA-Z0-9 ,_-]/g, "").trim().slice(0, 200);

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

    // build prompt: A-level base + B-level beans (if any) + user details (if any) + universal ending
    const template = promptTemplates[topic] ?? promptTemplates["celebration"];
    const parts = [template];
    if (beans) parts.push(beans);
    if (caption) parts.push(caption);
    parts.push(UNIVERSAL_PROMPT_ENDING);
    const promptBase = parts.join(" ");

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
      const textParts = [textOnlyTemplate];
      if (beans) textParts.push(beans);
      if (caption) textParts.push(caption);
      textParts.push(UNIVERSAL_PROMPT_ENDING);
      const genPrompt = textParts.join(" ");

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
    const blob = new Blob([new Uint8Array(inputBuffer as Buffer)], {
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
  }); // end requireCredits
}
