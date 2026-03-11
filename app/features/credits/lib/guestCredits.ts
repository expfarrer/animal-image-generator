// app/features/credits/lib/guestCredits.ts
// Server-side credit operations scoped to guest session IDs.
// Keys: credits:guest:<guestId>  — separate from legacy email-based keys.
// Idempotency keys: stripe:applied:<sessionId> — 90-day TTL.

import { kv } from "./kv";

function guestCreditKey(guestId: string): string {
  return `credits:guest:${guestId}`;
}

function stripeAppliedKey(sessionId: string): string {
  return `stripe:applied:${sessionId}`;
}

export async function getGuestCredits(guestId: string): Promise<number> {
  const value = await kv.get<number>(guestCreditKey(guestId));
  return value ?? 0;
}

export async function incrementGuestCredits(guestId: string, n: number): Promise<void> {
  await kv.incrby(guestCreditKey(guestId), n);
}

/**
 * Atomically deducts 1 credit via Lua script.
 * Returns true if deducted, false if balance was already 0.
 */
export async function deductGuestCredit(guestId: string): Promise<boolean> {
  const script = `
    local current = tonumber(redis.call('GET', KEYS[1])) or 0
    if current <= 0 then return 0 end
    redis.call('DECRBY', KEYS[1], 1)
    return 1
  `;
  const result = await kv.eval(script, [guestCreditKey(guestId)], []);
  return result === 1;
}

/** Returns true if this Stripe session has already been applied to any guest. */
export async function isStripeSessionApplied(sessionId: string): Promise<boolean> {
  return (await kv.get(stripeAppliedKey(sessionId))) !== null;
}

/**
 * Mark this Stripe session as applied (idempotency guard).
 * Stores the guestId that claimed it. Expires after 90 days.
 */
export async function markStripeSessionApplied(
  sessionId: string,
  guestId: string,
): Promise<void> {
  await kv.set(stripeAppliedKey(sessionId), guestId, { ex: 60 * 60 * 24 * 90 });
}
