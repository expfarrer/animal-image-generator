// app/lib/contacts.ts
// KV-backed contact store — lightweight email capture for growth tracking.
//
// Design:
//   - Keyed by normalized email (dedup built-in)
//   - No TTL — permanent records
//   - Separate from analytics events and ledger
//   - Writes are best-effort and never throw
//
// KV key schema:
//   contact:{email}  → JSON Contact record (permanent, no TTL)
//   contact:all      → sorted set of emails by createdAt (score = unix ms)

import { kv } from "../features/credits/lib/kv";

export interface Contact {
  email: string;                           // normalized lowercase + trimmed
  guestId: string | null;                  // guest session at capture time
  source: "image_send" | "stripe";         // first capture source
  stripeCustomerId: string | null;
  createdAt: number;                       // unix ms — first seen
  lastSeenAt: number;                      // unix ms — most recent upsert
}

const CONTACT_ALL_KEY = "contact:all";

function contactKey(email: string): string {
  return `contact:${email}`;
}

/**
 * Upsert a contact by email. Creates on first capture, updates lastSeenAt on repeat.
 * Never throws — best-effort write.
 */
export async function upsertContact(
  email: string,
  guestId: string | null,
  source: "image_send" | "stripe",
  stripeCustomerId?: string | null,
): Promise<void> {
  const key = contactKey(email);
  const now = Date.now();

  try {
    // @vercel/kv auto-deserializes JSON on read
    const existing = await kv.get<Contact>(key);

    const record: Contact = existing
      ? {
          ...existing,
          // Prefer first guestId — don't overwrite with null on repeat captures
          guestId: existing.guestId ?? guestId,
          stripeCustomerId: stripeCustomerId ?? existing.stripeCustomerId ?? null,
          lastSeenAt: now,
        }
      : {
          email,
          guestId,
          source,
          stripeCustomerId: stripeCustomerId ?? null,
          createdAt: now,
          lastSeenAt: now,
        };

    const p = kv.pipeline();
    p.set(key, JSON.stringify(record)); // no TTL — permanent contact record
    if (!existing) {
      // Only add to sorted index on first creation (dedup by email)
      p.zadd(CONTACT_ALL_KEY, { score: now, member: email });
    }
    await p.exec();
  } catch (err) {
    console.error("[contacts] upsert failed (non-fatal):", err);
  }
}

/** Total number of unique captured emails. */
export async function getContactCount(): Promise<number> {
  try {
    return (await kv.zcard(CONTACT_ALL_KEY)) ?? 0;
  } catch {
    return 0;
  }
}
