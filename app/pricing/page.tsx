// app/pricing/page.tsx
// Server component — reads price IDs from env vars and passes them to the
// client component. Adding or editing a tier only requires changing TIERS below.

import PricingClient, { type Tier } from "./PricingClient";

// ─── Tier config ────────────────────────────────────────────────────────────
// To add a tier: add an entry here and add the corresponding env var.
// To remove a tier: delete its entry. No JSX changes needed.
const TIERS: Tier[] = [
  {
    name: "Starter Pack",
    description: "Perfect if you just want to try it out.",
    price: "$4.99",
    credits: 5,
    priceId: process.env.STRIPE_PRICE_ID_STARTER!,
  },
  {
    name: "Most Popular",
    description: "Compare and pick your favorites.",
    price: "$9.99",
    credits: 12,
    priceId: process.env.STRIPE_PRICE_ID_MOST_POPULAR!,
    badge: "Most Popular",
  },
];
// ────────────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  return <PricingClient tiers={TIERS} />;
}
