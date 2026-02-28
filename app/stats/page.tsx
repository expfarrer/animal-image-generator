// app/stats/page.tsx
"use client";
import { useEffect, useState, useCallback } from "react";

interface StatsEntry {
  ip: string;
  count: number;
  windowRemainingSec: number;
  blocked: boolean;
}

interface Stats {
  rateLimitMax: number;
  rateLimitWindowSec: number;
  activeIps: number;
  totalRequestsInWindow: number;
  blockedIps: number;
  entries: StatsEntry[];
  serverTimeIso: string;
}

const REFRESH_INTERVAL_SEC = 10;

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_SEC);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Stats = await res.json();
      setStats(data);
      setError(null);
      setLastFetched(new Date());
      setCountdown(REFRESH_INTERVAL_SEC);
    } catch (e: any) {
      setError(e.message ?? "Failed to load stats");
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(fetchStats, REFRESH_INTERVAL_SEC * 1000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Countdown ticker
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL_SEC : c - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-slate-100 px-4 pt-12 pb-2 text-center">
        <h1 className="text-xl font-bold text-slate-900">Server Stats</h1>
        <p className="text-sm text-slate-500 mt-0.5">Rate limiter · live · refreshes every {REFRESH_INTERVAL_SEC}s</p>
      </header>

      <div className="flex-1 flex flex-col gap-3 p-4 pb-10 max-w-lg mx-auto w-full">

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Summary cards */}
        {stats && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Active IPs" value={stats.activeIps} />
              <StatCard label="Requests (window)" value={stats.totalRequestsInWindow} />
              <StatCard label="Blocked IPs" value={stats.blockedIps} accent={stats.blockedIps > 0} />
              <StatCard
                label="Window"
                value={`${stats.rateLimitWindowSec}s / ${stats.rateLimitMax} req`}
                small
              />
            </div>

            {/* Per-IP table */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Active IPs
                </span>
              </div>
              {stats.entries.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">No activity yet</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 uppercase border-b border-slate-100">
                      <th className="px-4 py-2 text-left font-medium">IP</th>
                      <th className="px-4 py-2 text-right font-medium">Reqs</th>
                      <th className="px-4 py-2 text-right font-medium">Resets in</th>
                      <th className="px-4 py-2 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.entries
                      .slice()
                      .sort((a, b) => b.count - a.count)
                      .map((e, i) => (
                        <tr
                          key={i}
                          className={`border-b border-slate-50 last:border-0 ${e.blocked ? "bg-red-50" : ""}`}
                        >
                          <td className="px-4 py-2.5 font-mono text-slate-700">{e.ip}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                            {e.count}/{stats.rateLimitMax}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                            {e.windowRemainingSec}s
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {e.blocked ? (
                              <span className="text-xs font-semibold text-red-600">blocked</span>
                            ) : (
                              <span className="text-xs text-green-600">ok</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-slate-400 space-y-0.5">
              {lastFetched && (
                <p>Last updated {lastFetched.toLocaleTimeString()}</p>
              )}
              <p>
                Auto-refreshing in {countdown}s ·{" "}
                <button
                  onClick={fetchStats}
                  className="underline underline-offset-2"
                >
                  refresh now
                </button>
              </p>
              <p className="pt-1">
                <a href="/" className="underline underline-offset-2">← Back to generator</a>
              </p>
            </div>
          </>
        )}

        {!stats && !error && (
          <div className="flex justify-center pt-12">
            <div className="w-8 h-8 rounded-full border-4 border-slate-300 border-t-indigo-500 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = false,
  small = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`rounded-2xl shadow-sm p-4 ${accent ? "bg-red-50" : "bg-white"}`}>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`font-bold tabular-nums ${small ? "text-base" : "text-2xl"} ${accent ? "text-red-600" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}
