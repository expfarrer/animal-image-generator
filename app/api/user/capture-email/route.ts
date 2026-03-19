// app/api/user/capture-email/route.ts
// POST: capture a user's email address for growth tracking.
// Called client-side after a successful generation.
// Always returns 200 — never surfaces errors to the user.

import { upsertContact } from "../../../lib/contacts";
import { readGuestId } from "../../../lib/guestSession";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const raw: string = (typeof body?.email === "string" ? body.email : "")
      .trim()
      .toLowerCase();

    // Basic sanity check — not exhaustive, just prevents obviously bad data
    if (!raw || !raw.includes("@") || raw.length > 200) {
      return ok();
    }

    const guestId = readGuestId(req);
    await upsertContact(raw, guestId, "image_send");
  } catch (err) {
    console.error("[capture-email] unexpected error:", err);
  }

  return ok();
}

function ok() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
