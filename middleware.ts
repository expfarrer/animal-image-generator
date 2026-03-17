// middleware.ts
// Protects all /admin/* routes with HTTP Basic Auth.
//
// Required env vars:
//   ENABLE_CREDIT_LEDGER=true   — feature flag; routes return 404 when false
//   ADMIN_SECRET=<long-secret>  — password for Basic Auth (username is ignored)
//
// Note: this app uses guest session cookies (no email auth).
// ADMIN_SECRET replaces the ADMIN_EMAILS pattern — there is no email identity
// system to hook into, so a shared secret is the correct approach here.

import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/admin/:path*"],
};

export function middleware(req: NextRequest) {
  if (process.env.ENABLE_CREDIT_LEDGER !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    console.error("[admin] ADMIN_SECRET is not configured — /admin routes are blocked");
    return new NextResponse("Admin not configured", { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) {
    return unauthorized();
  }

  // atob is available in Edge runtime; Buffer is not
  let decoded: string;
  try {
    decoded = atob(auth.slice(6));
  } catch {
    return unauthorized();
  }

  // username:password — both must match
  const colonIdx = decoded.indexOf(":");
  const username = colonIdx >= 0 ? decoded.slice(0, colonIdx) : "";
  const password = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded;

  if (username !== "admin" || password !== secret) {
    return unauthorized();
  }

  return NextResponse.next();
}

function unauthorized() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="AIG Admin"' },
  });
}
