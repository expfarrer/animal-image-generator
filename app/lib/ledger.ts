// app/lib/ledger.ts
// KV-backed credit transaction ledger.
//
// Writes are best-effort: a ledger failure NEVER blocks or rolls back a credit operation.
// The KV credit balance is the source of truth; the ledger is the audit trail.
//
// KV key schema:
//   ledger:tx:{id}             → JSON transaction record (90-day TTL)
//   ledger:all                 → sorted set of txIds by timestamp (score = unix ms)
//   ledger:guest:{guestId}     → sorted set of txIds per guest

import { kv } from "../features/credits/lib/kv";

export interface CreditTransaction {
  id: string;
  guestId: string;
  amount: number;        // +N for purchase, -1 for usage
  type: "purchase" | "usage";
  source: "stripe_checkout" | "image_generate";
  reason: string;        // Human-readable description
  referenceId: string;   // Stripe sessionId or a per-generation UUID
  balanceAfter: number;  // Balance after this transaction
  createdAt: number;     // Unix ms timestamp
}

const TX_TTL_SEC = 60 * 60 * 24 * 90; // 90 days
const LEDGER_ALL_KEY = "ledger:all";

function txKey(id: string) { return `ledger:tx:${id}`; }
function guestLedgerKey(guestId: string) { return `ledger:guest:${guestId}`; }

/**
 * Record a credit transaction. Best-effort — errors are logged but never thrown.
 * Call with .catch() if firing without await.
 */
export async function recordTransaction(
  tx: Omit<CreditTransaction, "id" | "createdAt">,
): Promise<void> {
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const full: CreditTransaction = { id, createdAt, ...tx };

  try {
    const p = kv.pipeline();
    p.set(txKey(id), JSON.stringify(full), { ex: TX_TTL_SEC });
    p.zadd(LEDGER_ALL_KEY, { score: createdAt, member: id });
    p.zadd(guestLedgerKey(tx.guestId), { score: createdAt, member: id });
    await p.exec();
  } catch (err) {
    console.error("[ledger] write failed (non-fatal):", err);
  }
}

/** Fetch recent transactions, newest first. */
export async function getRecentTransactions(
  limit = 50,
  offset = 0,
): Promise<CreditTransaction[]> {
  try {
    const ids = await kv.zrange<string[]>(LEDGER_ALL_KEY, offset, offset + limit - 1, { rev: true });
    return fetchTxByIds(ids ?? []);
  } catch (err) {
    console.error("[ledger] getRecentTransactions failed:", err);
    return [];
  }
}

/** Fetch transactions for one guest, newest first. */
export async function getTransactionsByGuest(
  guestId: string,
  limit = 50,
): Promise<CreditTransaction[]> {
  try {
    const ids = await kv.zrange<string[]>(guestLedgerKey(guestId), 0, limit - 1, { rev: true });
    return fetchTxByIds(ids ?? []);
  } catch (err) {
    console.error("[ledger] getTransactionsByGuest failed:", err);
    return [];
  }
}

/** Total number of entries in the global ledger index. */
export async function getLedgerTotal(): Promise<number> {
  try {
    return (await kv.zcard(LEDGER_ALL_KEY)) ?? 0;
  } catch {
    return 0;
  }
}

async function fetchTxByIds(ids: string[]): Promise<CreditTransaction[]> {
  if (ids.length === 0) return [];
  const keys = ids.map(txKey);
  // @vercel/kv auto-deserializes JSON on read, so raw values are already objects.
  const raws = await kv.mget<(CreditTransaction | null)[]>(...keys);
  return (raws ?? []).filter(Boolean) as CreditTransaction[];
}
