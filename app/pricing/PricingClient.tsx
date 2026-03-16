"use client";
// app/pricing/PricingClient.tsx
// Receives the tiers config (with resolved priceIds) from the server component.
// Handles checkout button clicks and redirects to Stripe.

import { useState } from "react";

export interface Tier {
  name: string;
  description: string;
  price: string;
  credits: number;
  priceId: string;
  badge?: string;
}

export default function PricingClient({ tiers }: { tiers: Tier[] }) {
  const defaultId = tiers.find((t) => t.badge)?.priceId ?? tiers[0]?.priceId ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(defaultId);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(priceId: string) {
    setLoadingId(priceId);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Failed to start checkout");
      }
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
      setLoadingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="px-4 pt-12 pb-2 text-center">
        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-1">Animal Image Generator</p>
        <h1 className="text-2xl font-bold text-slate-900">Choose Your Image Pack</h1>
        <p className="text-sm text-slate-500 mt-1">Pick how many images you want to create.</p>
      </header>

      <div className="flex-1 flex flex-col items-center gap-4 p-4 pb-12">
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
          {tiers.map((tier) => (
            <div
              key={tier.priceId}
              onClick={() => setSelectedId(tier.priceId)}
              className={`relative flex-1 bg-white rounded-2xl shadow-sm p-6 flex flex-col gap-3 cursor-pointer transition-shadow ${
                selectedId === tier.priceId
                  ? "ring-2 ring-indigo-500"
                  : "hover:ring-2 hover:ring-indigo-500/20"
              }`}
            >
              {tier.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  {tier.badge}
                </span>
              )}

              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                  {tier.name}
                </p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{tier.price}</p>
              </div>

              <p className="text-2xl font-semibold text-indigo-600">
                {tier.credits} Images
              </p>

              <p className="text-sm text-slate-500 flex-1">{tier.description}</p>
            </div>
          ))}
        </div>

        <button
          onClick={() => selectedId && handleCheckout(selectedId)}
          disabled={loadingId !== null || !selectedId}
          className="w-full max-w-md py-4 rounded-2xl bg-indigo-600 text-white text-base font-semibold hover:opacity-80 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-opacity"
        >
          {loadingId ? "Redirecting…" : "Get Started"}
        </button>

        {error && (
          <p className="text-sm text-red-600 text-center max-w-sm">{error}</p>
        )}

        <p className="text-xs text-slate-400 text-center mt-2">
          Payments processed securely by Stripe ·{" "}
          <a href="/generator" className="underline underline-offset-2">
            Back to generator
          </a>
        </p>
      </div>
    </div>
  );
}
