import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@crm/db";
import { requireRole } from "../auth.js";
import {
  buildAuthUrl,
  exchangeCode,
  getClientInfo,
  getStatementSummary,
  getStatementTransactions,
} from "../services/sber-client.js";
import crypto from "node:crypto";

export async function sberRoutes(app: FastifyInstance): Promise<void> {
  // ---- OAuth flow ----

  /** Redirect the admin to Sber Business ID login page. */
  app.get("/api/sber/connect", { preHandler: requireRole("owner", "admin") }, async (req, reply) => {
    const state = crypto.randomBytes(16).toString("hex");
    (req.session as { set(k: string, v: string): void }).set("sber_state", state);
    const url = buildAuthUrl(state);
    return reply.redirect(url);
  });

  /** Sber redirects back here with ?code=...&state=... */
  app.get("/api/sber/callback", async (req, reply) => {
    const q = z.object({ code: z.string(), state: z.string() }).parse(req.query);
    const expected = (req.session as { get(k: string): unknown }).get("sber_state") as string | undefined;
    if (!expected || expected !== q.state) {
      return reply.status(400).send("state mismatch — возможно CSRF-атака");
    }
    (req.session as { set(k: string, v: string): void }).set("sber_state", "");
    try {
      const tokens = await exchangeCode(q.code);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      await prisma.sberToken.upsert({
        where: { id: "singleton" },
        create: {
          id: "singleton",
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          expiresAt,
          scope: tokens.scope,
        },
        update: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? undefined,
          expiresAt,
          scope: tokens.scope,
        },
      });
      // Redirect back to CRM finance view.
      return reply.redirect("/#sber-connected");
    } catch (e) {
      return reply.status(500).send(`Ошибка авторизации Sber: ${(e as Error).message}`);
    }
  });

  /** Check if Sber is connected. */
  app.get("/api/sber/status", { preHandler: requireRole("owner", "admin", "manager") }, async () => {
    const row = await prisma.sberToken.findUnique({ where: { id: "singleton" } });
    if (!row) return { connected: false };
    return {
      connected: true,
      expiresAt: row.expiresAt.toISOString(),
      expired: row.expiresAt < new Date(),
      hasRefresh: !!row.refreshToken,
    };
  });

  // ---- Data endpoints (proxy to Sber API) ----

  /** Get org info + list of accounts. */
  app.get("/api/sber/accounts", { preHandler: requireRole("owner", "admin", "manager") }, async () => {
    return getClientInfo();
  });

  /** Get statement summary for a given account + date. */
  app.get("/api/sber/statement/summary", { preHandler: requireRole("owner", "admin", "manager") }, async (req) => {
    const q = z.object({
      accountNumber: z.string(),
      statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(req.query);
    return getStatementSummary(q.accountNumber, q.statementDate);
  });

  /** Get transactions for a given account + date. */
  app.get("/api/sber/statement/transactions", { preHandler: requireRole("owner", "admin", "manager") }, async (req) => {
    const q = z.object({
      accountNumber: z.string(),
      statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(req.query);
    return getStatementTransactions(q.accountNumber, q.statementDate);
  });
}
