"use client";
// Runs once on the success page to accumulate purchased credits into localStorage.
// The generator reads from the same key to show the counter.
// Replaced by real session/auth in Prompt 3 — remove this file then.

import { useEffect } from "react";

const LS_KEY = "aig_credits";

export default function CreditInitializer({ credits, sessionId }: { credits: number; sessionId: string }) {
  useEffect(() => {
    // Guard against double-application on refresh or back navigation.
    // sessionStorage is tab-scoped and clears on tab close, ensuring each
    // Stripe session only adds credits once per browser session.
    const guardKey = `aig_credited_${sessionId}`;
    if (sessionStorage.getItem(guardKey)) return;
    sessionStorage.setItem(guardKey, "1");

    const existing = parseInt(localStorage.getItem(LS_KEY) ?? "0", 10) || 0;
    localStorage.setItem(LS_KEY, String(existing + credits));
  }, [credits, sessionId]);
  return null;
}
