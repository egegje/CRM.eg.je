/**
 * The iOS PWA "kicked out every few minutes" bug came from a missing
 * maxAge on the session cookie — browsers treated it as a session cookie
 * and dropped it on backgrounding. These tests pin the cookie attributes
 * we rely on, and pin them as constants so they can't silently drift.
 */
import { describe, it, expect } from "vitest";
import {
  SESSION_COOKIE_MAX_AGE,
  buildSessionCookieOptions,
} from "../../src/session-config.js";

describe("session cookie options", () => {
  it("persists for 30 days so iOS PWA doesn't kick users out on backgrounding", () => {
    const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
    expect(SESSION_COOKIE_MAX_AGE).toBe(THIRTY_DAYS_SECONDS);
  });

  it("is httpOnly and SameSite=lax in every environment", () => {
    for (const env of ["development", "production", "test"]) {
      const opts = buildSessionCookieOptions(env);
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe("lax");
      expect(opts.maxAge).toBe(SESSION_COOKIE_MAX_AGE);
      expect(opts.path).toBe("/");
    }
  });

  it("sets secure=true only in production", () => {
    expect(buildSessionCookieOptions("production").secure).toBe(true);
    expect(buildSessionCookieOptions("development").secure).toBe(false);
    expect(buildSessionCookieOptions("test").secure).toBe(false);
  });
});
