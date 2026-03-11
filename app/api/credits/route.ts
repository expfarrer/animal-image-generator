// app/api/credits/route.ts
// Returns the current credit balance for the guest session in this browser.
// Called by the generator on mount to initialise the credit counter.
//
// Response shape:
//   { credits: number }   — guest session found, returns current balance (may be 0)
//   { credits: null }     — no guest session cookie; session cap governs instead

import { NextResponse } from "next/server";
import { readGuestId } from "../../lib/guestSession";
import { getGuestCredits } from "../../features/credits/lib/guestCredits";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const guestId = readGuestId(request);
  if (!guestId) {
    // No purchase recorded in this browser — return null so the generator
    // falls back to the session cap rather than showing "0 credits left".
    return NextResponse.json({ credits: null });
  }
  const credits = await getGuestCredits(guestId);
  return NextResponse.json({ credits });
}
