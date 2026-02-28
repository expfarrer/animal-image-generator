// app/lib/rateLimit.ts
// Shared in-memory rate limiter — module-level singleton, Node.js runtime only.
// Imported by both the generate-image route and the stats route.

export const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX ?? "10", 10);
export const RATE_LIMIT_WINDOW_MS =
  parseInt(process.env.RATE_LIMIT_WINDOW_SEC ?? "60", 10) * 1000;

export interface RateEntry {
  count: number;
  windowStart: number;
}

export const rateStore = new Map<string, RateEntry>();

export function checkRateLimit(
  ip: string,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = rateStore.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateStore.set(ip, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfterSec = Math.ceil(
      (RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)) / 1000,
    );
    return { allowed: false, retryAfterSec };
  }
  entry.count++;
  return { allowed: true, retryAfterSec: 0 };
}
