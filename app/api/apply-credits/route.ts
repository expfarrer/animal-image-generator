// app/api/apply-credits/route.ts
// Called by SuccessCreditApplier (client component on /success) after Stripe redirects back.
//
// Responsibilities:
//   1. Verify the Stripe checkout session and resolve the credit amount.
//   2. Get or create a guest session ID from the cookie.
//   3. Idempotently apply the purchased credits in KV (once per Stripe session_id).
//   4. Set the guest session cookie on the response.
//   5. Return the current credit balance.
//
// Idempotency: if the same session_id arrives twice (refresh, double-click, etc.)
// the KV write is skipped and the current balance is returned unchanged.

import { NextResponse } from "next/server";
import { stripe, priceIdToCredits } from "../../lib/stripe";
import {
  getGuestCredits,
  incrementGuestCredits,
  isStripeSessionApplied,
  markStripeSessionApplied,
} from "../../features/credits/lib/guestCredits";
import {
  readGuestId,
  generateGuestId,
  buildGuestCookieHeader,
} from "../../lib/guestSession";
import { recordTransaction } from "../../lib/ledger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { sessionId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { sessionId } = body;
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  // Verify with Stripe and resolve credit amount
  let purchasedCredits: number;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });
    const priceId = session.line_items?.data[0]?.price?.id ?? null;
    const resolved = priceId ? priceIdToCredits(priceId) : null;
    if (!resolved) {
      return NextResponse.json({ error: "Could not resolve credit amount for this session" }, { status: 400 });
    }
    purchasedCredits = resolved;
  } catch (err) {
    console.error("[apply-credits] Stripe session retrieval failed:", err);
    return NextResponse.json({ error: "Failed to verify payment session" }, { status: 500 });
  }

  // Get existing guest ID from cookie, or create a new one
  const existingGuestId = readGuestId(request);
  const guestId = existingGuestId ?? generateGuestId();

  // Idempotent credit application — skip if this Stripe session was already applied
  const alreadyApplied = await isStripeSessionApplied(sessionId);
  if (!alreadyApplied) {
    await incrementGuestCredits(guestId, purchasedCredits);
    await markStripeSessionApplied(sessionId, guestId);
    console.log(`[apply-credits] +${purchasedCredits} credits → guest ${guestId} (session ${sessionId})`);
  } else {
    console.log(`[apply-credits] session ${sessionId} already applied — returning current balance`);
  }

  const credits = await getGuestCredits(guestId);

  // Log to ledger after balance is known so balanceAfter is accurate
  if (!alreadyApplied) {
    recordTransaction({
      guestId,
      amount: purchasedCredits,
      type: "purchase",
      source: "stripe_checkout",
      reason: `Stripe checkout: ${purchasedCredits} credit${purchasedCredits === 1 ? "" : "s"} purchased`,
      referenceId: sessionId,
      balanceAfter: credits,
    }).catch((err) => console.error("[ledger] purchase log failed:", err));
  }

  // Always refresh the cookie on the response (creates it if new, extends TTL if existing)
  const res = NextResponse.json({ credits, applied: !alreadyApplied });
  res.headers.set("Set-Cookie", buildGuestCookieHeader(guestId));
  return res;
}
