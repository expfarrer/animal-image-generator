// app/lib/analytics.ts
// KV-backed analytics event store.
//
// Mirrors the ledger.ts pattern exactly:
//   - Writes are best-effort and never throw
//   - KV is the only persistence layer (no relational DB in this stack)
//
// KV key schema:
//   analytics:event:{id}  → JSON AnalyticsEvent (90-day TTL)
//   analytics:all         → sorted set of event IDs by timestamp (score = unix ms)

import { kv } from "../features/credits/lib/kv";

export const EVENT_NAMES = [
  "upload_completed",
  "image_optimized",
  "generate_clicked",
  "generate_success",
  "download_clicked",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export interface AnalyticsEvent {
  id: string;
  eventName: EventName;
  guestId: string | null;
  pathname: string | null;
  data: Record<string, unknown>;
  createdAt: number; // unix ms
}

export interface AnalyticsSummary {
  uploads: number;
  generateClicks: number;
  generateSuccesses: number;
  downloads: number;
  uploadToGenerateConversion: number | null; // percent, null if no uploads
  generateSuccessRate: number | null;        // percent, null if no clicks
  avgOriginalSizeBytes: number | null;
  avgOptimizedSizeBytes: number | null;
  avgSizeSavedBytes: number | null;
  avgReductionPercent: number | null;
  avgGenerateDurationMs: number | null;
  recentEvents: AnalyticsEvent[];
}

const EVENT_TTL_SEC = 60 * 60 * 24 * 90; // 90 days
const ANALYTICS_ALL_KEY = "analytics:all";
// Fetch at most this many events for summary computation — sufficient for any realistic POC volume
const SUMMARY_FETCH_LIMIT = 2000;

function eventKey(id: string) { return `analytics:event:${id}`; }

/**
 * Record an analytics event. Best-effort — errors are logged but never thrown.
 */
export async function recordAnalyticsEvent(
  event: Omit<AnalyticsEvent, "id" | "createdAt">,
): Promise<void> {
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const full: AnalyticsEvent = { id, createdAt, ...event };

  try {
    const p = kv.pipeline();
    p.set(eventKey(id), JSON.stringify(full), { ex: EVENT_TTL_SEC });
    p.zadd(ANALYTICS_ALL_KEY, { score: createdAt, member: id });
    await p.exec();
  } catch (err) {
    console.error("[analytics] write failed (non-fatal):", err);
  }
}

/**
 * Fetch the most recent analytics events, newest first.
 */
export async function getRecentAnalyticsEvents(limit = 50): Promise<AnalyticsEvent[]> {
  try {
    const ids = await kv.zrange<string[]>(ANALYTICS_ALL_KEY, 0, limit - 1, { rev: true });
    return fetchEventsByIds(ids ?? []);
  } catch (err) {
    console.error("[analytics] getRecentAnalyticsEvents failed:", err);
    return [];
  }
}

/**
 * Compute summary statistics, optionally filtered to events after `sinceMs`.
 */
export async function getAnalyticsSummary(sinceMs?: number): Promise<AnalyticsSummary> {
  const empty: AnalyticsSummary = {
    uploads: 0, generateClicks: 0, generateSuccesses: 0, downloads: 0,
    uploadToGenerateConversion: null, generateSuccessRate: null,
    avgOriginalSizeBytes: null, avgOptimizedSizeBytes: null,
    avgSizeSavedBytes: null, avgReductionPercent: null,
    avgGenerateDurationMs: null,
    recentEvents: [],
  };

  try {
    const ids = await kv.zrange<string[]>(
      ANALYTICS_ALL_KEY, 0, SUMMARY_FETCH_LIMIT - 1, { rev: true },
    );
    let events = await fetchEventsByIds(ids ?? []);

    if (sinceMs !== undefined) {
      events = events.filter((e) => e.createdAt >= sinceMs);
    }

    const ofType = (name: EventName) => events.filter((e) => e.eventName === name);

    const uploads          = ofType("upload_completed").length;
    const generateClicks   = ofType("generate_clicked").length;
    const generateSuccesses = ofType("generate_success").length;
    const downloads        = ofType("download_clicked").length;

    const optimizedEvents  = ofType("image_optimized");
    const successEvents    = ofType("generate_success");

    return {
      uploads,
      generateClicks,
      generateSuccesses,
      downloads,
      uploadToGenerateConversion: uploads > 0
        ? Math.round((generateClicks / uploads) * 100) : null,
      generateSuccessRate: generateClicks > 0
        ? Math.round((generateSuccesses / generateClicks) * 100) : null,
      avgOriginalSizeBytes:   numericMean(optimizedEvents, "original_size_bytes"),
      avgOptimizedSizeBytes:  numericMean(optimizedEvents, "optimized_size_bytes"),
      avgSizeSavedBytes:      numericMean(optimizedEvents, "size_saved_bytes"),
      avgReductionPercent:    numericMean(optimizedEvents, "reduction_percent"),
      avgGenerateDurationMs:  numericMean(successEvents,   "duration_ms"),
      recentEvents: events.slice(0, 50),
    };
  } catch (err) {
    console.error("[analytics] summary failed:", err);
    return empty;
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function fetchEventsByIds(ids: string[]): Promise<AnalyticsEvent[]> {
  if (ids.length === 0) return [];
  const keys = ids.map(eventKey);
  // @vercel/kv auto-deserializes JSON on read, so raw values are already objects.
  const raws = await kv.mget<(AnalyticsEvent | null)[]>(...keys);
  return (raws ?? []).filter(Boolean) as AnalyticsEvent[];
}

function numericMean(events: AnalyticsEvent[], field: string): number | null {
  const values = events
    .map((e) => e.data[field])
    .filter((v): v is number => typeof v === "number" && isFinite(v));
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}
