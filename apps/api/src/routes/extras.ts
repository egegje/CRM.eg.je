import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Prisma } from "@crm/db";
import { requireUser, hashPassword } from "../auth.js";
import { sendMessage } from "../services/send.js";
import { setKey, decrypt } from "../crypto.js";
import { loadConfig } from "../config.js";
import { NotFound, BadRequest } from "../errors.js";
import { randomBytes } from "node:crypto";
import { accessibleMailboxIds } from "../services/access.js";

setKey(loadConfig().encKey);

const Params = z.object({ id: z.string() });

export async function extraRoutes(app: FastifyInstance): Promise<void> {
  // ---- quick links (public for all authenticated users) ----
  app.get("/quick-links", { preHandler: requireUser() }, async () => {
    const row = await prisma.taskSetting.findUnique({ where: { key: "quick_links" } });
    if (!row) return [];
    try { return JSON.parse(row.value); } catch { return []; }
  });

  // ---- smart folders ----
  app.get("/smart-folders", { preHandler: requireUser() }, async (req) => {
    const user = req.user!;
    return prisma.smartFolder.findMany({ where: { ownerId: user.id }, orderBy: { name: "asc" } });
  });

  const SmartCreate = z.object({
    name: z.string().min(1),
    query: z.object({
      q: z.string().optional(),
      from: z.string().optional(),
      mailboxId: z.string().optional(),
      status: z.enum(["read", "unread"]).optional(),
      starred: z.boolean().optional(),
    }),
  });
  app.post("/smart-folders", { preHandler: requireUser() }, async (req) => {
    const body = SmartCreate.parse(req.body);
    const user = req.user!;
    return prisma.smartFolder.create({
      data: { ownerId: user.id, name: body.name, query: body.query },
    });
  });

  app.delete("/smart-folders/:id", { preHandler: requireUser() }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    const user = req.user!;
    const f = await prisma.smartFolder.findUnique({ where: { id } });
    if (!f || f.ownerId !== user.id) throw new NotFound();
    await prisma.smartFolder.delete({ where: { id } });
    return reply.status(204).send();
  });

  app.get("/smart-folders/:id/messages", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const user = req.user!;
    const f = await prisma.smartFolder.findUnique({ where: { id } });
    if (!f || f.ownerId !== user.id) throw new NotFound();
    const q = f.query as { q?: string; from?: string; mailboxId?: string; status?: "read" | "unread"; starred?: boolean };
    const where: Prisma.MessageWhereInput = { deletedAt: null };
    const accessIds = await accessibleMailboxIds(user);
    where.mailboxId = { in: accessIds };
    if (q.mailboxId) where.mailboxId = q.mailboxId;
    if (q.from) where.fromAddr = { contains: q.from, mode: "insensitive" };
    if (q.status === "read") where.isRead = true;
    if (q.status === "unread") where.isRead = false;
    if (q.starred) where.isStarred = true;
    if (q.q) {
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "Message" WHERE "fts" @@ plainto_tsquery('simple', $1) AND "deletedAt" IS NULL LIMIT 200`,
        q.q,
      );
      where.id = { in: rows.map((r) => r.id) };
    }
    return prisma.message.findMany({ where, orderBy: { receivedAt: "desc" }, take: 200 });
  });

  // ---- templates ----
  app.get("/templates", { preHandler: requireUser() }, async (req) => {
    const user = req.user!;
    return prisma.template.findMany({ where: { ownerId: user.id }, orderBy: { name: "asc" } });
  });

  app.post("/templates", { preHandler: requireUser() }, async (req) => {
    const body = z.object({ name: z.string().min(1), body: z.string().min(1) }).parse(req.body);
    const user = req.user!;
    return prisma.template.create({ data: { ownerId: user.id, name: body.name, body: body.body } });
  });

  app.delete("/templates/:id", { preHandler: requireUser() }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    const user = req.user!;
    const t = await prisma.template.findUnique({ where: { id } });
    if (!t || t.ownerId !== user.id) throw new NotFound();
    await prisma.template.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ---- stats dashboard ----
  app.get("/stats", { preHandler: requireUser() }, async (req) => {
    const ids = await accessibleMailboxIds(req.user!);
    const mailboxFilter = { mailboxId: { in: ids } };
    const [total, unread, last7daysRows] = await Promise.all([
      prisma.message.count({ where: { deletedAt: null, ...mailboxFilter } }),
      prisma.message.count({ where: { deletedAt: null, isRead: false, ...mailboxFilter } }),
      prisma.$queryRaw<{ d: Date; c: bigint }[]>`SELECT date_trunc('day', "receivedAt")::date AS d, count(*)::bigint AS c FROM "Message" WHERE "receivedAt" >= now() - interval '7 days' AND "deletedAt" IS NULL AND "mailboxId" = ANY(${ids}) GROUP BY 1 ORDER BY 1`,
    ]);
    const byMailbox = await prisma.$queryRaw<{ email: string; c: bigint }[]>`SELECT mb.email, count(m.id)::bigint AS c FROM "Mailbox" mb LEFT JOIN "Message" m ON m."mailboxId" = mb.id AND m."deletedAt" IS NULL WHERE mb.id = ANY(${ids}) GROUP BY mb.email ORDER BY c DESC`;
    const byPriority = await prisma.$queryRaw<{ p: string | null; c: bigint }[]>`SELECT "aiPriority" AS p, count(*)::bigint AS c FROM "Message" WHERE "deletedAt" IS NULL AND "aiPriority" IS NOT NULL AND "mailboxId" = ANY(${ids}) GROUP BY "aiPriority"`;
    return {
      total,
      unread,
      last7days: last7daysRows.map((r) => ({ d: r.d, c: Number(r.c) })),
      byMailbox: byMailbox.map((r) => ({ email: r.email, c: Number(r.c) })),
      byPriority: byPriority.map((r) => ({ p: r.p, c: Number(r.c) })),
    };
  });

  // ---- per-mailbox unread counts (for sidebar badges) ----
  app.get("/mailboxes/unread", { preHandler: requireUser() }, async (req) => {
    const ids = await accessibleMailboxIds(req.user!);
    const where: { isRead: boolean; deletedAt: null; mailboxId: { in: string[] } } = {
      isRead: false,
      deletedAt: null,
      mailboxId: { in: ids },
    };
    const rows = await prisma.message.groupBy({
      by: ["mailboxId"],
      where,
      _count: { _all: true },
    });
    const result: Record<string, number> = {};
    for (const r of rows) result[r.mailboxId] = r._count._all;
    return result;
  });

  // ---- forgot password ----
  // Sends a reset link via the first enabled mailbox.
  const ForgotBody = z.object({ email: z.string().email() });
  app.post("/auth/forgot", async (req) => {
    const body = ForgotBody.parse(req.body);
    const u = await prisma.user.findUnique({ where: { email: body.email } });
    if (!u) return { ok: true }; // don't leak existence
    const token = randomBytes(32).toString("hex");
    await prisma.passwordReset.create({
      data: { userId: u.id, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    const link = `https://crm.eg.je/?reset=${token}`;
    const sender = await prisma.mailbox.findFirst({ where: { enabled: true } });
    if (sender) {
      try {
        await sendMessage(
          { mailbox: sender, decrypt: (b) => decrypt(b, sender.email) },
          {
            from: sender.email,
            to: [body.email],
            subject: "Сброс пароля crm.eg.je",
            text: `Вы запросили сброс пароля. Перейдите по ссылке (действительна 1 час):\n\n${link}\n\nЕсли это были не вы — проигнорируйте письмо.`,
          },
        );
      } catch (e) {
        req.log.error({ err: e }, "forgot send failed");
      }
    }
    return { ok: true };
  });

  const ResetBody = z.object({ token: z.string().min(1), newPassword: z.string().min(4) });
  app.post("/auth/reset", async (req, reply) => {
    const body = ResetBody.parse(req.body);
    const r = await prisma.passwordReset.findUnique({ where: { token: body.token } });
    if (!r || r.used || r.expiresAt < new Date()) {
      return reply.status(400).send({ error: "invalid or expired token" });
    }
    await prisma.user.update({
      where: { id: r.userId },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });
    await prisma.passwordReset.update({ where: { id: r.id }, data: { used: true } });
    return { ok: true };
  });
}
