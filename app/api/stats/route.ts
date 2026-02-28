// app/api/stats/route.ts
import { NextResponse } from "next/server";
import {
  rateStore,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
} from "../../lib/rateLimit";

export const runtime = "nodejs";

export async function GET() {
  const now = Date.now();

  // Aggregate across all tracked IPs; mask the last octet for privacy
  const entries = Array.from(rateStore.entries()).map(([ip, entry]) => {
    const windowAge = now - entry.windowStart;
    const windowRemainingSec = Math.max(
      0,
      Math.ceil((RATE_LIMIT_WINDOW_MS - windowAge) / 1000),
    );
    // Mask last octet: "1.2.3.4" → "1.2.3.x", IPv6 last group → "...:x"
    const maskedIp = ip.includes(".")
      ? ip.replace(/\.\d+$/, ".x")
      : ip.replace(/:[^:]+$/, ":x");
    return {
      ip: maskedIp,
      count: entry.count,
      windowRemainingSec,
      blocked: entry.count >= RATE_LIMIT_MAX,
    };
  });

  const totalRequests = entries.reduce((s, e) => s + e.count, 0);
  const blockedIps = entries.filter((e) => e.blocked).length;

  return NextResponse.json({
    rateLimitMax: RATE_LIMIT_MAX,
    rateLimitWindowSec: RATE_LIMIT_WINDOW_MS / 1000,
    activeIps: entries.length,
    totalRequestsInWindow: totalRequests,
    blockedIps,
    entries,
    serverTimeIso: new Date().toISOString(),
  });
}
