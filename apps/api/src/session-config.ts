/**
 * Session cookie config — kept in its own module (no side-effecting imports)
 * so it can be unit-tested without booting Fastify/BullMQ.
 */

// 30 days in seconds — long enough that PWAs and iOS WKWebView don't
// drop the cookie on app backgrounding, short enough that a stolen
// cookie loses value in a reasonable window.
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function buildSessionCookieOptions(env: string) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env === "production",
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
}
