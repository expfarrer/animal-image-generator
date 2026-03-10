// app/features/credits/lib/kv.ts
// Single initialisation point for the Vercel KV (Upstash Redis) client.
// All credit operations must go through features/credits/lib/credits.ts —
// nothing else in the codebase should import from here directly.
//
// Note: @vercel/kv is deprecated in favour of @upstash/redis accessed via the
// Vercel marketplace integration. The API is identical; env vars are the same.
// Replace the import with @upstash/redis if you migrate away from the Vercel wrapper.

import { kv } from "@vercel/kv";

export { kv };

// Key schema — centralised here so nothing else hardcodes key strings.
export const creditKey = (email: string) =>
  `credits:user:${email.toLowerCase().trim()}`;
