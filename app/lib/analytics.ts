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
  "generate_failed",
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
  // Raw funnel counts
  uploads: number;
  generateClicks: number;
  generateSuccesses: number;
  generateFailed: number;
  downloads: number;

  // Corrected funnel — upload_id-based (one ID per distinct accepted image)
  uniqueUploads: number;
  uploadsWithClick: number;
  uploadsWithSuccess: number;
  correctedUploadToGenerateRate: number | null; // percent, null if no uploads
  correctedUploadToSuccessRate: number | null;  // percent, null if no uploads
  avgRetriesPerUpload: number | null;           // 1-decimal, null if no clicks
  generateFailureRate: number | null;           // percent of clicks that resulted in failure

  // Cost (estimated, from generate_success events only — credits deducted on success)
  totalEstimatedCostUsd: number | null;
  avgCostPerSuccess: number | null;

  // Image optimization stats (from image_optimized events)
  avgOriginalSizeBytes: number | null;
  avgOptimizedSizeBytes: number | null;
  avgSizeSavedBytes: number | null;
  avgReductionPercent: number | null;

  // Generation timing
  avgGenerateDurationMs: number | null;

  // Recent events for the dashboard table
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
    uploads: 0, generateClicks: 0, generateSuccesses: 0, generateFailed: 0, downloads: 0,
    uniqueUploads: 0, uploadsWithClick: 0, uploadsWithSuccess: 0,
    correctedUploadToGenerateRate: null, correctedUploadToSuccessRate: null,
    avgRetriesPerUpload: null, generateFailureRate: null,
    totalEstimatedCostUsd: null, avgCostPerSuccess: null,
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

    const uploadCompletedEvents = ofType("upload_completed");
    const clickEvents           = ofType("generate_clicked");
    const successEvents         = ofType("generate_success");
    const failedEvents          = ofType("generate_failed");
    const optimizedEvents       = ofType("image_optimized");

    const uploads           = uploadCompletedEvents.length;
    const generateClicks    = clickEvents.length;
    const generateSuccesses = successEvents.length;
    const generateFailed    = failedEvents.length;
    const downloads         = ofType("download_clicked").length;

    // upload_id-based corrected funnel
    const uniqueUploadIds    = uniqueStringSet(uploadCompletedEvents, "upload_id");
    const clickUploadIds     = uniqueStringSet(clickEvents, "upload_id");
    const successUploadIds   = uniqueStringSet(successEvents, "upload_id");
    const uniqueUploads      = uniqueUploadIds.size;
    const uploadsWithClick   = clickUploadIds.size;
    const uploadsWithSuccess = successUploadIds.size;

    const correctedUploadToGenerateRate = uniqueUploads > 0
      ? Math.round((uploadsWithClick / uniqueUploads) * 100) : null;
    const correctedUploadToSuccessRate = uniqueUploads > 0
      ? Math.round((uploadsWithSuccess / uniqueUploads) * 100) : null;

    // Avg retries per upload: (avg clicks per uploading upload) - 1
    const avgRetriesPerUpload = uploadsWithClick > 0
      ? Math.round(((generateClicks / uploadsWithClick) - 1) * 10) / 10
      : null;

    // Failure rate: failed / clicks (clicks = total attempts)
    const generateFailureRate = generateClicks > 0
      ? Math.round((generateFailed / generateClicks) * 100) : null;

    // Cost from generate_success events (credits only deducted on success)
    const costValues = successEvents
      .map((e) => e.data.estimated_cost_usd)
      .filter((v): v is number => typeof v === "number" && isFinite(v));
    const totalEstimatedCostUsd = costValues.length > 0
      ? Math.round(costValues.reduce((a, b) => a + b, 0) * 100) / 100
      : null;
    const avgCostPerSuccess = generateSuccesses > 0 && totalEstimatedCostUsd !== null
      ? Math.round((totalEstimatedCostUsd / generateSuccesses) * 1000) / 1000
      : null;

    return {
      uploads,
      generateClicks,
      generateSuccesses,
      generateFailed,
      downloads,
      uniqueUploads,
      uploadsWithClick,
      uploadsWithSuccess,
      correctedUploadToGenerateRate,
      correctedUploadToSuccessRate,
      avgRetriesPerUpload,
      generateFailureRate,
      totalEstimatedCostUsd,
      avgCostPerSuccess,
      avgOriginalSizeBytes:  numericMean(optimizedEvents, "original_size_bytes"),
      avgOptimizedSizeBytes: numericMean(optimizedEvents, "optimized_size_bytes"),
      avgSizeSavedBytes:     numericMean(optimizedEvents, "size_saved_bytes"),
      avgReductionPercent:   numericMean(optimizedEvents, "reduction_percent"),
      avgGenerateDurationMs: numericMean(successEvents,   "duration_ms"),
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

/** Collect unique non-empty string values for a given data field across events. */
function uniqueStringSet(events: AnalyticsEvent[], field: string): Set<string> {
  const s = new Set<string>();
  for (const e of events) {
    const v = e.data[field];
    if (typeof v === "string" && v.length > 0) s.add(v);
  }
  return s;
}
