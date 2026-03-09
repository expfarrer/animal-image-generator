// app/api/webhook/route.ts
// Stripe webhook handler — App Router style.
//
// IMPORTANT: uses request.text() for the raw body so Stripe signature
// verification works correctly. Never switch to req.json() here.
// Do NOT add export const config = { api: { bodyParser: false } } —
// that is Pages Router only and has no effect in App Router.

import { NextResponse } from "next/server";
import { stripe, priceIdToCredits } from "../../lib/stripe";
import { incrementCredits } from "../../features/credits";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err: any) {
    console.error("[webhook] signature verification failed:", err.message);
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const email =
      session.customer_details?.email ?? session.customer_email ?? null;

    if (!email) {
      console.error("[webhook] no email on session:", session.id);
      // Return 200 so Stripe doesn't retry — nothing we can do without an email
      return NextResponse.json({ received: true });
    }

    // Retrieve line items to get the price ID
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 1,
    });
    const priceId = lineItems.data[0]?.price?.id ?? null;

    if (!priceId) {
      console.error("[webhook] no price ID on session:", session.id);
      return NextResponse.json({ received: true });
    }

    const credits = priceIdToCredits(priceId);
    if (credits === null) {
      console.error("[webhook] unknown price ID:", priceId);
      return NextResponse.json({ received: true });
    }

    await incrementCredits(email, credits);
    console.log(`[webhook] +${credits} credits → ${email} (session ${session.id})`);
  }

  return NextResponse.json({ received: true });
}
