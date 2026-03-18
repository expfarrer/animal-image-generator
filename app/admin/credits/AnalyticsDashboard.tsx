// app/admin/credits/AnalyticsDashboard.tsx
// Server component — rendered inside the admin/credits page (already protected by middleware).
// Displays summary cards and a recent events table. No client state needed.

import type { AnalyticsSummary, AnalyticsEvent, EventName } from "../../lib/analytics";

function fmt(n: number | null, suffix = ""): string {
  if (n === null) return "—";
  return `${n.toLocaleString()}${suffix}`;
}

function fmtBytes(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function EventDataCell({ event }: { event: AnalyticsEvent }) {
  const d = event.data;
  if (event.eventName === "image_optimized") {
    return (
      <span className="text-xs text-slate-500 font-mono">
        {fmtBytes(typeof d.original_size_bytes === "number" ? d.original_size_bytes : null)} →{" "}
        {fmtBytes(typeof d.optimized_size_bytes === "number" ? d.optimized_size_bytes : null)}{" "}
        {typeof d.reduction_percent === "number"
          ? `(−${d.reduction_percent}%)`
          : ""}{" "}
        {typeof d.output_format === "string" ? d.output_format.replace("image/", "") : ""}
      </span>
    );
  }
  if (event.eventName === "generate_success") {
    return (
      <span className="text-xs text-slate-500 font-mono">
        {typeof d.duration_ms === "number" ? `${(d.duration_ms / 1000).toFixed(1)}s` : "—"}
      </span>
    );
  }
  return <span className="text-xs text-slate-400">—</span>;
}

const EVENT_BADGE: Record<EventName, string> = {
  upload_completed:  "bg-blue-100 text-blue-700",
  image_optimized:   "bg-violet-100 text-violet-700",
  generate_clicked:  "bg-amber-100 text-amber-700",
  generate_success:  "bg-green-100 text-green-700",
  download_clicked:  "bg-slate-100 text-slate-600",
};

export default function AnalyticsDashboard({
  summary,
  range,
}: {
  summary: AnalyticsSummary;
  range: string;
}) {
  const rangeLabel = range === "30d" ? "30 days" : range === "all" ? "all time" : "7 days";

  return (
    <section className="mb-10">
      {/* Section header + range selector */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Analytics</h2>
          <p className="text-xs text-slate-400">Last {rangeLabel}</p>
        </div>
        <div className="flex gap-1.5 text-xs font-medium">
          {(["7d", "30d", "all"] as const).map((r) => (
            <a
              key={r}
              href={`?range=${r}`}
              className={`px-3 py-1.5 rounded-full border transition-colors ${
                range === r
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-slate-300 text-slate-600 hover:border-indigo-400"
              }`}
            >
              {r === "all" ? "All" : r}
            </a>
          ))}
        </div>
      </div>

      {/* Summary cards — two rows */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Card label="Uploads"              value={fmt(summary.uploads)} />
        <Card label="Generate Clicks"      value={fmt(summary.generateClicks)} />
        <Card label="Successful Gens"      value={fmt(summary.generateSuccesses)} />
        <Card label="Downloads"            value={fmt(summary.downloads)} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card
          label="Upload → Generate"
          value={summary.uploadToGenerateConversion !== null
            ? `${summary.uploadToGenerateConversion}%`
            : "—"}
          sub="conversion rate"
        />
        <Card
          label="Generate Success"
          value={summary.generateSuccessRate !== null
            ? `${summary.generateSuccessRate}%`
            : "—"}
          sub="of clicks"
        />
        <Card
          label="Avg Compression"
          value={fmt(summary.avgReductionPercent, "%")}
          sub={`${fmtBytes(summary.avgOriginalSizeBytes)} → ${fmtBytes(summary.avgOptimizedSizeBytes)}`}
        />
        <Card
          label="Avg Gen Time"
          value={summary.avgGenerateDurationMs !== null
            ? `${(summary.avgGenerateDurationMs / 1000).toFixed(1)}s`
            : "—"}
          sub="end-to-end"
        />
      </div>

      {/* Recent events table */}
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Recent Events</h3>
      {summary.recentEvents.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm bg-white rounded-2xl border border-slate-200">
          No events recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 whitespace-nowrap">Timestamp</th>
                <th className="px-4 py-3 whitespace-nowrap">Event</th>
                <th className="px-4 py-3 whitespace-nowrap">Guest ID</th>
                <th className="px-4 py-3 whitespace-nowrap">Data</th>
                <th className="px-4 py-3 whitespace-nowrap">Path</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentEvents.map((ev, i) => (
                <tr
                  key={ev.id}
                  className={`border-b border-slate-50 last:border-0 ${
                    i % 2 === 1 ? "bg-slate-50/60" : "bg-white"
                  }`}
                >
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap font-mono text-xs">
                    {fmtDate(ev.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      EVENT_BADGE[ev.eventName] ?? "bg-slate-100 text-slate-500"
                    }`}>
                      {ev.eventName}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {ev.guestId ? (
                      <a
                        href={`/admin/credits?guest=${encodeURIComponent(ev.guestId)}`}
                        className="font-mono text-xs text-indigo-600 underline underline-offset-2"
                        title={ev.guestId}
                      >
                        {ev.guestId.slice(0, 8)}…
                      </a>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 max-w-xs">
                    <EventDataCell event={ev} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                    {ev.pathname ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
