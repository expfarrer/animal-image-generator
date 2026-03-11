"use client";
// app/success/SuccessCreditApplier.tsx
// Fires once on the success page to call /api/apply-credits.
// The API route verifies the Stripe session, creates or reuses the guest session
// cookie, and atomically applies purchased credits in KV.
//
// This component has no visible output — it is a side-effect-only trigger.
// The credit amount shown on the page comes from the server component (Stripe retrieval).
// Replaces CreditInitializer, which used localStorage as the source of truth.

import { useEffect } from "react";

export default function SuccessCreditApplier({ sessionId }: { sessionId: string }) {
  useEffect(() => {
    fetch("/api/apply-credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }).catch((err) => {
      console.error("[SuccessCreditApplier] failed to apply credits:", err);
    });
  }, [sessionId]); // sessionId is stable — runs exactly once per page load

  return null;
}
