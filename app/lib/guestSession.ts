// app/lib/guestSession.ts
// Helpers for the guest session cookie.
// The cookie is the server-trusted identity that links a browser to its credit balance.
// No login, no email, no account — just a long-lived random ID stored httpOnly.

export const GUEST_COOKIE_NAME = "aig_guest";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Read the guest session ID from an incoming request's Cookie header.
 * Works in any context that has a Request object (route handlers, middleware).
 */
export function readGuestId(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key.trim() === GUEST_COOKIE_NAME) return rest.join("=").trim();
  }
  return null;
}

/** Generate a new random guest session ID. */
export function generateGuestId(): string {
  return crypto.randomUUID();
}

/**
 * Build a Set-Cookie header string for the guest session cookie.
 * Secure flag is added in production automatically.
 */
export function buildGuestCookieHeader(guestId: string): string {
  const parts = [
    `${GUEST_COOKIE_NAME}=${guestId}`,
    `Path=/`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    `SameSite=Lax`,
    `HttpOnly`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}
