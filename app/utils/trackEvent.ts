// app/utils/trackEvent.ts
// Client-side analytics helper — fire-and-forget, never throws.
//
// Usage:
//   trackEvent("upload_completed");
//   trackEvent("image_optimized", { original_size_bytes: 204800, ... });
//
// The server ingest route reads the guest ID from the session cookie server-side,
// so callers never need to pass identity — just the event name and optional data.

// Intentionally duplicated from app/lib/analytics.ts EVENT_NAMES:
// analytics.ts imports KV (server-only), so this client utility defines its own type.
// Keep in sync if new event names are added.
export type EventName =
  | "upload_completed"
  | "image_optimized"
  | "generate_clicked"
  | "generate_success"
  | "download_clicked";

export function trackEvent(
  eventName: EventName,
  data?: Record<string, unknown>,
): void {
  // Fire-and-forget: returns void, swallows all errors.
  // Never awaited by callers — analytics must never block user flows.
  fetch("/api/analytics/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName,
      data: data ?? {},
      pathname: typeof window !== "undefined" ? window.location.pathname : null,
    }),
  }).catch(() => {});
}
