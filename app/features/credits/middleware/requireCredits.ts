// app/features/credits/middleware/requireCredits.ts
// Server-side credit guard. Import and apply in /api/generate-image/route.ts only.
//
// Usage:
//   return requireCredits(req, userEmail, () => handler(req));
//
// BYPASS_CREDITS=true in .env.local skips all checks during local development.
// This flag MUST be removed before v4.0 is committed.

import { getCredits, deductCredit } from "../lib/credits";

export async function requireCredits(
  _req: Request,
  userEmail: string | null,
  handler: () => Promise<Response>,
): Promise<Response> {
  // Dev bypass — lets the core generate flow run without a real KV connection.
  // MUST NOT be enabled in production — fail loudly if it is.
  if (process.env.BYPASS_CREDITS === "true") {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[requireCredits] BYPASS_CREDITS=true is set in production. " +
        "This is a critical misconfiguration — all credit enforcement is disabled. " +
        "Remove BYPASS_CREDITS from your production environment variables immediately.",
      );
      // Hard-disable bypass in production rather than silently serving free generations.
      // Fall through to normal credit enforcement below.
    } else {
      return handler();
    }
  }

  // Auth not yet wired — once auth lands, userEmail will always be populated.
  if (!userEmail) {
    return new Response(
      JSON.stringify({ error: "unauthenticated" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const balance = await getCredits(userEmail);
  if (balance <= 0) {
    return new Response(
      JSON.stringify({ error: "insufficient_credits" }),
      { status: 402, headers: { "Content-Type": "application/json" } },
    );
  }

  const deducted = await deductCredit(userEmail);
  if (!deducted) {
    // Balance hit 0 between the check and deduct (race condition caught by Lua)
    return new Response(
      JSON.stringify({ error: "insufficient_credits" }),
      { status: 402, headers: { "Content-Type": "application/json" } },
    );
  }

  return handler();
}
