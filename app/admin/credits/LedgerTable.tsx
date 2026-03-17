"use client";
// app/admin/credits/LedgerTable.tsx
// Read-only table for the credit ledger admin view.

import type { CreditTransaction } from "../../lib/ledger";

function formatDate(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function truncate(str: string, n = 14) {
  return str.length <= n ? str : `${str.slice(0, n)}…`;
}

export default function LedgerTable({ transactions }: { transactions: CreditTransaction[] }) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 text-sm bg-white rounded-2xl border border-slate-200">
        No transactions found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <th className="px-4 py-3 whitespace-nowrap">Timestamp</th>
            <th className="px-4 py-3 whitespace-nowrap">Guest ID</th>
            <th className="px-4 py-3 whitespace-nowrap">Change</th>
            <th className="px-4 py-3 whitespace-nowrap">Type</th>
            <th className="px-4 py-3 whitespace-nowrap">Source</th>
            <th className="px-4 py-3 whitespace-nowrap">Reason</th>
            <th className="px-4 py-3 whitespace-nowrap">Reference ID</th>
            <th className="px-4 py-3 whitespace-nowrap">Balance After</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx, i) => {
            const isPositive = tx.amount > 0;
            return (
              <tr
                key={tx.id}
                className={`border-b border-slate-50 last:border-0 ${
                  i % 2 === 1 ? "bg-slate-50/60" : "bg-white"
                }`}
              >
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap font-mono text-xs">
                  {formatDate(tx.createdAt)}
                </td>

                <td className="px-4 py-3">
                  <a
                    href={`/admin/credits?guest=${encodeURIComponent(tx.guestId)}`}
                    className="font-mono text-xs text-indigo-600 underline underline-offset-2 hover:text-indigo-800"
                    title={tx.guestId}
                  >
                    {truncate(tx.guestId)}
                  </a>
                </td>

                <td className="px-4 py-3 font-semibold font-mono">
                  <span className={isPositive ? "text-green-600" : "text-red-500"}>
                    {isPositive ? "+" : ""}
                    {tx.amount}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      tx.type === "purchase"
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {tx.type}
                  </span>
                </td>

                <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                  {tx.source}
                </td>

                <td className="px-4 py-3 text-slate-600 text-xs max-w-[200px] truncate" title={tx.reason}>
                  {tx.reason}
                </td>

                <td
                  className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap"
                  title={tx.referenceId}
                >
                  {truncate(tx.referenceId, 18)}
                </td>

                <td className="px-4 py-3 font-mono font-bold text-slate-700">
                  {tx.balanceAfter}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
