#!/usr/bin/env node
// CRM auto smoke-test. Runs hourly via systemd timer.
// Logs in as several users, exercises API + UI paths, reports failures to Telegram.
//
// Exit code: 0 if all pass, 1 if any fail.

import pw from "/opt/crm.eg.je/scripts/node_modules/playwright/index.js";
const { chromium } = pw;
import { readFileSync } from "node:fs";

const BASE = "https://crm.eg.je";
const TG_CHAT = "7600578327";
const SECRETS = readFileSync("/etc/crm/secrets.env", "utf8");
const TG_TOKEN = SECRETS.match(/^TELEGRAM_BOT_TOKEN=(.+)$/m)?.[1]?.trim();

const users = [
  { email: "ul@eg.je", pass: "ulyana2026", role: "admin" },
  { email: "ik@eg.je", pass: "katya2026", role: "manager" },
  { email: "go@eg.je", pass: "olya2026", role: "manager" },
];

const failures = [];

function fail(who, msg) {
  failures.push(`${who}: ${msg}`);
  console.error(`FAIL ${who}: ${msg}`);
}

async function apiLogin(email, pass) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: pass }),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  return { status: res.status, cookie };
}

async function apiGet(path, cookie) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
  return { status: res.status, body: await res.text() };
}

async function runApiChecks(u) {
  const who = `API:${u.email}`;
  const { status, cookie } = await apiLogin(u.email, u.pass);
  if (status !== 200) return fail(who, `/auth/login → ${status}`);
  if (!cookie) return fail(who, `/auth/login returned no session cookie`);
  const paths = [
    ["/me", 200],
    ["/mailboxes", 200],
    ["/folders", 200],
    ["/messages?limit=3", 200],
    ["/home/summary", 200],
    ["/outbox", 200],
  ];
  for (const [p, want] of paths) {
    const r = await apiGet(p, cookie);
    if (r.status !== want) fail(who, `GET ${p} → ${r.status} (expected ${want})`);
  }
}

async function runUiChecks(u) {
  const who = `UI:${u.email}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 20000 });
    if (!(await page.locator("#login-screen").isVisible())) {
      return fail(who, "login screen not visible on fresh load");
    }
    if (await page.locator("#tabbar").isVisible()) {
      fail(who, "tabbar visible on login screen (should be hidden)");
    }
    await page.fill('input[name="email"]', u.email);
    await page.fill('input[name="password"]', u.pass);
    await page.click('#login-form button[type="submit"]');
    await page.waitForTimeout(3500);
    if (await page.locator("#login-screen").isVisible()) {
      return fail(who, "login-screen still visible 3.5s after submit (bounced back?)");
    }
    if (!(await page.locator("#app").isVisible())) {
      return fail(who, "#app not visible after login");
    }
    if (!(await page.locator("#home-view").isVisible())) {
      return fail(who, "home-view not visible after login");
    }
    if (pageErrors.length) {
      fail(who, `JS errors: ${pageErrors.join(" | ")}`);
    }
  } finally {
    await browser.close();
  }
}

console.log(`[${new Date().toISOString()}] smoke-test starting`);
for (const u of users) {
  await runApiChecks(u);
}
for (const u of users) {
  try {
    await runUiChecks(u);
  } catch (e) {
    fail(`UI:${u.email}`, `threw: ${e.message}`);
  }
}

if (failures.length === 0) {
  console.log("ALL PASS");
  process.exit(0);
}

console.log("FAILURES:");
failures.forEach((f) => console.log(" -", f));

if (TG_TOKEN) {
  const text = `CRM smoke-test FAILED (${failures.length}):\n\n${failures.map((f) => "• " + f).join("\n")}`;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, text }),
    });
  } catch (e) {
    console.error("TG notify failed:", e.message);
  }
}
process.exit(1);
