// app/admin/credits/page.tsx
// Internal read-only credit ledger page.
// Access is controlled by middleware.ts (HTTP Basic Auth + ENABLE_CREDIT_LEDGER flag).
//
// URL: /admin/credits
// Query params:
//   ?guest=<guestId>   — filter to one guest's history
//   ?page=<n>          — pagination (ignored when filtering by guest)

import { notFound } from "next/navigation";
import {
  getRecentTransactions,
  getTransactionsByGuest,
  getLedgerTotal,
} from "../../lib/ledger";
import LedgerTable from "./LedgerTable";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface Props {
  searchParams: Promise<{ guest?: string; page?: string }>;
}

export default async function AdminCreditsPage({ searchParams }: Props) {
  // Secondary flag check — middleware is the primary gate, this is defence-in-depth
  if (process.env.ENABLE_CREDIT_LEDGER !== "true") {
    notFound();
  }

  const { guest, page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? "1", 10));
  const offset = (pageNum - 1) * PAGE_SIZE;

  const [transactions, total] = await Promise.all([
    guest
      ? getTransactionsByGuest(decodeURIComponent(guest), PAGE_SIZE)
      : getRecentTransactions(PAGE_SIZE, offset),
    getLedgerTotal(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Page header */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-1">
            Animal Image Generator — Internal Admin
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Credit Ledger</h1>
          <p className="text-sm text-slate-500 mt-1">
            Read-only audit trail of all credit transactions. For internal QA and debugging only.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {total} total entr{total === 1 ? "y" : "ies"} · newest first
          </p>
        </div>

        {/* Guest filter form */}
        <form method="GET" className="mb-4 flex gap-2 items-center flex-wrap">
          <input
            type="text"
            name="guest"
            defaultValue={guest ? decodeURIComponent(guest) : ""}
            placeholder="Filter by guest ID (UUID)…"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 w-80 focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:opacity-80 cursor-pointer"
          >
            Filter
          </button>
          {guest && (
            <a
              href="/admin/credits"
              className="text-sm text-slate-500 underline underline-offset-2"
            >
              Clear filter
            </a>
          )}
        </form>

        {guest && (
          <div className="mb-4 text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2 inline-block font-mono">
            Guest: {decodeURIComponent(guest)}
          </div>
        )}

        <LedgerTable transactions={transactions} />

        {/* Pagination (only when not filtering by guest) */}
        {!guest && totalPages > 1 && (
          <div className="mt-6 flex gap-6 text-sm items-center text-slate-500">
            <span>Page {pageNum} of {totalPages}</span>
            {pageNum > 1 && (
              <a
                href={`?page=${pageNum - 1}`}
                className="text-indigo-600 underline underline-offset-2"
              >
                ← Newer
              </a>
            )}
            {pageNum < totalPages && (
              <a
                href={`?page=${pageNum + 1}`}
                className="text-indigo-600 underline underline-offset-2"
              >
                Older →
              </a>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
