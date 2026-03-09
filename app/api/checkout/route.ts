// app/api/checkout/route.ts
// Creates a Stripe Checkout session and returns the session URL.
// Client calls POST /api/checkout with { priceId } and redirects to the returned URL.

import { NextResponse } from "next/server";
import { stripe } from "../../lib/stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { priceId } = await req.json();

    if (!priceId || typeof priceId !== "string") {
      return NextResponse.json({ error: "priceId is required" }, { status: 400 });
    }

    const allowedPriceIds = [
      process.env.STRIPE_PRICE_ID_STARTER,
      process.env.STRIPE_PRICE_ID_MOST_POPULAR,
    ];
    if (!allowedPriceIds.includes(priceId)) {
      return NextResponse.json({ error: "invalid priceId" }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: undefined, // collected by Stripe Checkout form
      billing_address_collection: "auto",
      customer_creation: "always",
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[checkout] error:", err);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
