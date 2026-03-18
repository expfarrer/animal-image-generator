// app/admin/credits/page.tsx
// Internal admin page: analytics summary + credit ledger.
// Access is controlled by middleware.ts (HTTP Basic Auth + ENABLE_CREDIT_LEDGER flag).
//
// URL: /admin/credits
// Query params:
//   ?range=7d|30d|all   — analytics date range (default: 7d)
//   ?guest=<guestId>    — filter ledger to one guest's history
//   ?page=<n>           — ledger pagination (ignored when filtering by guest)

import { notFound } from "next/navigation";
import {
  getRecentTransactions,
  getTransactionsByGuest,
  getLedgerTotal,
} from "../../lib/ledger";
import { getAnalyticsSummary } from "../../lib/analytics";
import LedgerTable from "./LedgerTable";
import AnalyticsDashboard from "./AnalyticsDashboard";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const RANGE_MS: Record<string, number | undefined> = {
  "7d":  7  * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "all": undefined,
};

interface Props {
  searchParams: Promise<{ guest?: string; page?: string; range?: string }>;
}

export default async function AdminCreditsPage({ searchParams }: Props) {
  if (process.env.ENABLE_CREDIT_LEDGER !== "true") {
    notFound();
  }

  const { guest, page, range: rangeParam } = await searchParams;
  const range = (rangeParam && rangeParam in RANGE_MS) ? rangeParam : "7d";
  const rangeMs = RANGE_MS[range];
  const sinceMs = rangeMs !== undefined ? Date.now() - rangeMs : undefined;

  const pageNum = Math.max(1, parseInt(page ?? "1", 10));
  const offset = (pageNum - 1) * PAGE_SIZE;

  const [transactions, total, summary] = await Promise.all([
    guest
      ? getTransactionsByGuest(decodeURIComponent(guest), PAGE_SIZE)
      : getRecentTransactions(PAGE_SIZE, offset),
    getLedgerTotal(),
    getAnalyticsSummary(sinceMs),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Page header */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-indigo-500 uppercase tracking-widest mb-1">
            Animal Image Generator — Internal Admin
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Credits & Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Internal dashboard. For QA and debugging only.
          </p>
        </div>

        {/* Analytics section */}
        <AnalyticsDashboard summary={summary} range={range} />

        {/* Ledger section */}
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900 mb-0.5">Credit Ledger</h2>
          <p className="text-xs text-slate-400">
            {total} total entr{total === 1 ? "y" : "ies"} · newest first · read-only audit trail
          </p>
        </div>

        {/* Guest filter form */}
        <form method="GET" className="mb-4 flex gap-2 items-center flex-wrap">
          <input
            type="hidden" name="range" value={range}
          />
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
              href={`/admin/credits?range=${range}`}
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
                href={`?range=${range}&page=${pageNum - 1}`}
                className="text-indigo-600 underline underline-offset-2"
              >
                ← Newer
              </a>
            )}
            {pageNum < totalPages && (
              <a
                href={`?range=${range}&page=${pageNum + 1}`}
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
