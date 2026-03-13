// app/lib/guestRateLimit.ts
// KV-backed fixed-window rate limiter keyed by guest session ID.
// Used by /api/generate-image to prevent a single guest from burning OpenAI credits.
//
// Key:  rate:guest:<guestId>:<window>
// Window: 60-second fixed window (floor of epoch-seconds / 60)
// Limit: 5 requests per window
// TTL:  90 seconds (slightly above one window so expiry is always clean)

import { kv } from "../features/credits/lib/kv";

const WINDOW_SEC = 60;
const MAX_PER_WINDOW = 5;
const TTL_SEC = 90;

function windowKey(guestId: string): string {
  const window = Math.floor(Date.now() / (WINDOW_SEC * 1000));
  return `rate:guest:${guestId}:${window}`;
}

/**
 * Increments the guest's request count for the current window.
 * Returns { allowed: true } if under the limit, { allowed: false } if exceeded.
 */
export async function checkGuestRateLimit(
  guestId: string,
): Promise<{ allowed: boolean }> {
  const key = windowKey(guestId);
  const count = await kv.incr(key);
  if (count === 1) {
    // First request in this window — set TTL so the key auto-expires
    await kv.expire(key, TTL_SEC);
  }
  return { allowed: count <= MAX_PER_WINDOW };
}
