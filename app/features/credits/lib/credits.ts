// app/features/credits/lib/credits.ts
// All credit read/write operations. Nothing else in the codebase touches KV directly.

import { kv, creditKey } from "./kv";

/**
 * Returns the current credit balance for a user.
 * Returns 0 if the key does not exist yet.
 */
export async function getCredits(email: string): Promise<number> {
  const value = await kv.get<number>(creditKey(email));
  return value ?? 0;
}

/**
 * Sets the credit balance for a user to an absolute value.
 */
export async function setCredits(email: string, n: number): Promise<void> {
  await kv.set(creditKey(email), Math.max(0, n));
}

/**
 * Adds n credits to the current balance.
 */
export async function incrementCredits(
  email: string,
  n: number,
): Promise<void> {
  await kv.incrby(creditKey(email), n);
}

/**
 * Atomically deducts 1 credit.
 * Returns true if the deduction succeeded, false if the balance was already 0.
 *
 * Uses a Lua script to keep the check-and-decrement atomic, preventing
 * race conditions when concurrent requests arrive for the same user.
 */
export async function deductCredit(email: string): Promise<boolean> {
  const script = `
    local current = tonumber(redis.call('GET', KEYS[1])) or 0
    if current <= 0 then
      return 0
    end
    redis.call('DECRBY', KEYS[1], 1)
    return 1
  `;
  const result = await kv.eval(script, [creditKey(email)], []);
  return result === 1;
}
