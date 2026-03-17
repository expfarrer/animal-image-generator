// app/features/credits/middleware/requireCredits.ts
// Server-side credit guard. Applied in /api/generate-image/route.ts.
//
// Uses the guest session cookie (set by /api/apply-credits) as the server-trusted
// identity. No email or user account required.
//
// Usage:
//   return requireCredits(req, () => handler(req));
//
// BYPASS_CREDITS=true in .env.local skips all checks during local development.
// This flag MUST NOT be set in production — the guard below enforces this.

import { getGuestCredits, deductGuestCredit } from "../lib/guestCredits";
import { readGuestId } from "../../../lib/guestSession";
import { recordTransaction } from "../../../lib/ledger";

export async function requireCredits(
  req: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  // Dev bypass — allows local development without a real KV connection.
  // Hard-blocked in production: logs loudly and falls through to enforcement.
  if (process.env.BYPASS_CREDITS === "true") {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[requireCredits] BYPASS_CREDITS=true is set in production. " +
        "This is a critical misconfiguration — enforcing credits anyway. " +
        "Remove BYPASS_CREDITS from your production environment variables immediately.",
      );
      // Fall through to normal enforcement below.
    } else {
      return handler();
    }
  }

  const guestId = readGuestId(req);
  if (!guestId) {
    return new Response(
      JSON.stringify({ error: "No guest session found. Please complete a purchase first." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const balance = await getGuestCredits(guestId);
  if (balance <= 0) {
    return new Response(
      JSON.stringify({ error: "insufficient_credits" }),
      { status: 402, headers: { "Content-Type": "application/json" } },
    );
  }

  // Atomic deduct via Lua — prevents race conditions on concurrent requests
  const deducted = await deductGuestCredit(guestId);
  if (!deducted) {
    return new Response(
      JSON.stringify({ error: "insufficient_credits" }),
      { status: 402, headers: { "Content-Type": "application/json" } },
    );
  }

  // Log to ledger (best-effort — never blocks generation)
  // balanceAfter = balance - 1; balance was read before atomic deduct above
  recordTransaction({
    guestId,
    amount: -1,
    type: "usage",
    source: "image_generate",
    reason: "Image generation",
    referenceId: crypto.randomUUID(),
    balanceAfter: balance - 1,
  }).catch((err) => console.error("[ledger] usage log failed:", err));

  return handler();
}
