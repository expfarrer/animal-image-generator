// app/api/analytics/ingest/route.ts
// Analytics event ingestion endpoint.
//
// Public POST — called from the client. No admin auth required here because:
//   - Events carry no sensitive data
//   - Guest ID is read server-side from the httpOnly session cookie
//   - Event names and data fields are strictly validated and sanitized
//
// Returns 200 even on internal error — analytics must never surface as a user-facing failure.

import { EVENT_NAMES, recordAnalyticsEvent } from "../../../lib/analytics";
import type { EventName } from "../../../lib/analytics";
import { readGuestId } from "../../../lib/guestSession";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return ok(); // return 200 even for malformed requests
    }

    const { eventName, data, pathname } = body as Record<string, unknown>;

    // Validate event name against known list
    if (!EVENT_NAMES.includes(eventName as EventName)) {
      return ok();
    }

    const guestId = readGuestId(req);
    const sanitizedData = sanitizeData(eventName as EventName, data ?? {});
    const safePath = typeof pathname === "string"
      ? pathname.replace(/[^\w\-\/]/g, "").slice(0, 100)
      : null;

    // Best-effort — errors are caught inside recordAnalyticsEvent
    await recordAnalyticsEvent({
      eventName: eventName as EventName,
      guestId,
      pathname: safePath,
      data: sanitizedData,
    });
  } catch (err) {
    console.error("[analytics/ingest] unexpected error:", err);
    // Fall through — always return 200
  }

  return ok();
}

function ok() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Allowlist of fields per event. Only these pass through — all else is dropped.
const NUMERIC_FIELDS: Record<EventName, string[]> = {
  upload_completed:  [],
  image_optimized:   ["original_size_bytes", "optimized_size_bytes", "size_saved_bytes", "reduction_percent"],
  generate_clicked:  [],
  generate_success:  ["duration_ms", "estimated_cost_usd"],
  generate_failed:   ["duration_ms", "estimated_cost_usd"],
  download_clicked:  [],
};
const STRING_FIELDS: Record<EventName, string[]> = {
  upload_completed:  ["upload_id"],
  image_optimized:   ["output_format"],
  generate_clicked:  ["upload_id"],
  generate_success:  ["upload_id", "model"],
  generate_failed:   ["upload_id", "model", "failure_stage", "failure_reason"],
  download_clicked:  [],
};
const BOOL_FIELDS: Record<EventName, string[]> = {
  upload_completed:  [],
  image_optimized:   ["had_transparency"],
  generate_clicked:  [],
  generate_success:  [],
  generate_failed:   [],
  download_clicked:  [],
};

function sanitizeData(
  eventName: EventName,
  raw: unknown,
): Record<string, unknown> {
  const data = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const field of NUMERIC_FIELDS[eventName] ?? []) {
    const v = data[field];
    if (typeof v === "number" && isFinite(v)) out[field] = v;
  }
  for (const field of STRING_FIELDS[eventName] ?? []) {
    const v = data[field];
    if (typeof v === "string") out[field] = v.slice(0, 50);
  }
  for (const field of BOOL_FIELDS[eventName] ?? []) {
    const v = data[field];
    if (typeof v === "boolean") out[field] = v;
  }

  return out;
}
