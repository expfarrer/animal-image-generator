"use client";
// Runs once on the success page to accumulate purchased credits into localStorage.
// The generator reads from the same key to show the counter.
// Replaced by real session/auth in Prompt 3 — remove this file then.

import { useEffect } from "react";

const LS_KEY = "aig_credits";

export default function CreditInitializer({ credits }: { credits: number }) {
  useEffect(() => {
    const existing = parseInt(localStorage.getItem(LS_KEY) ?? "0", 10) || 0;
    localStorage.setItem(LS_KEY, String(existing + credits));
  }, [credits]);
  return null;
}
