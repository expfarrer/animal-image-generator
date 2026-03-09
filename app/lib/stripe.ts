// app/lib/stripe.ts
// Shared Stripe client — server-side only. Never import this in client components.

import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});

// Price ID → credit quantity map.
// Add new tiers here — the webhook and success page both read from this map.
export function priceIdToCredits(priceId: string): number | null {
  const map: Record<string, number> = {
    [process.env.STRIPE_PRICE_ID_STARTER!]: 5,
    [process.env.STRIPE_PRICE_ID_MOST_POPULAR!]: 12,
  };
  return map[priceId] ?? null;
}
