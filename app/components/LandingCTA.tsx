"use client";
// app/components/LandingCTA.tsx
// Smart CTA for the landing page.
// Checks GET /api/credits on mount:
//   - credits > 0  → routes to /generator ("Continue Creating")
//   - credits === 0 or null → routes to /pricing ("Start Creating")
// Shows a small credit reminder when the user has remaining credits.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LandingCTA() {
  const router = useRouter();
  const [credits, setCredits] = useState<number | null | "loading">("loading");

  useEffect(() => {
    fetch("/api/credits")
      .then((r) => r.json())
      .then((data) => {
        setCredits(typeof data.credits === "number" ? data.credits : null);
      })
      .catch(() => setCredits(null));
  }, []);

  const loading = credits === "loading";
  const hasCredits = typeof credits === "number" && credits > 0;

  function handleClick() {
    if (loading) return;
    router.push(hasCredits ? "/generator" : "/pricing");
  }

  return (
    <div className="flex flex-col gap-2 items-center w-full">
      {hasCredits && (
        <p className="text-sm text-indigo-600 font-medium">
          You have {credits} credit{credits === 1 ? "" : "s"} remaining
        </p>
      )}
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full py-4 bg-indigo-600 text-white text-base font-semibold rounded-2xl text-center hover:opacity-80 active:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-opacity"
      >
        {loading ? "..." : hasCredits ? "Continue Creating" : "Start Creating"}
      </button>
    </div>
  );
}
