import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Prisma } from "@crm/db";
import { requireRole } from "../auth.js";
import { hashPassword } from "../auth.js";
import { setKey, encrypt } from "../crypto.js";
import { loadConfig } from "../config.js";
import { NotFound, BadRequest } from "../errors.js";
import { syncSentForMailbox } from "../workers/sync.js";

setKey(loadConfig().encKey);

const Params = z.object({ id: z.string() });

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // ---- users ----
  app.get("/admin/users", { preHandler: requireRole("owner", "admin") }, async () => {
    return prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, lastLoginAt: true, createdAt: true, signature: true },
      orderBy: { createdAt: "desc" },
    });
  });

  const CreateUser = z.object({
    email: z.string().email(),
    password: z.string().min(4),
    name: z.string().min(1),
    role: z.enum(["owner", "admin", "manager"]),
  });
  app.post("/admin/users", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = CreateUser.parse(req.body);
    const { password, ...rest } = body;
    return prisma.user.create({
      data: { ...rest, passwordHash: await hashPassword(password) },
      select: { id: true, email: true, name: true, role: true },
    });
  });

  app.delete("/admin/users/:id", { preHandler: requireRole("owner") }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.user.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ---- mailboxes ----
  app.get("/admin/mailboxes", { preHandler: requireRole("owner", "admin") }, async () => {
    return prisma.mailbox.findMany({
      select: { id: true, email: true, displayName: true, enabled: true, imapHost: true, imapPort: true, smtpHost: true, smtpPort: true, createdAt: true },
      orderBy: { displayName: "asc" },
    });
  });

  const CreateMailbox = z.object({
    email: z.string().email(),
    displayName: z.string().min(1),
    appPassword: z.string().min(1),
    imapHost: z.string().min(1).optional(),
    imapPort: z.coerce.number().int().min(1).max(65535).optional(),
    smtpHost: z.string().min(1).optional(),
    smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  });
  app.post("/admin/mailboxes", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = CreateMailbox.parse(req.body);
    const enc = encrypt(body.appPassword, body.email);
    return prisma.mailbox.create({
      data: {
        email: body.email,
        displayName: body.displayName,
        encryptedAppPassword: enc,
        ...(body.imapHost ? { imapHost: body.imapHost } : {}),
        ...(body.imapPort ? { imapPort: body.imapPort } : {}),
        ...(body.smtpHost ? { smtpHost: body.smtpHost } : {}),
        ...(body.smtpPort ? { smtpPort: body.smtpPort } : {}),
      },
      select: { id: true, email: true, displayName: true, enabled: true },
    });
  });

  app.patch("/admin/mailboxes/:id", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const parsed = z.object({
      enabled: z.boolean().optional(),
      displayName: z.string().optional(),
      signature: z.string().optional(),
      imapHost: z.string().min(1).optional(),
      imapPort: z.coerce.number().int().min(1).max(65535).optional(),
      smtpHost: z.string().min(1).optional(),
      smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
      appPassword: z.string().min(1).optional(),
    }).parse(req.body);
    const { appPassword, ...body } = parsed;
    const data: Prisma.MailboxUpdateInput = { ...body };
    if (appPassword) {
      const mb = await prisma.mailbox.findUnique({ where: { id }, select: { email: true } });
      if (!mb) throw new NotFound();
      data.encryptedAppPassword = encrypt(appPassword, mb.email);
    }
    return prisma.mailbox.update({
      where: { id },
      data,
      select: { id: true, email: true, displayName: true, enabled: true, signature: true, imapHost: true, imapPort: true, smtpHost: true, smtpPort: true },
    });
  });

  // ---- user ↔ mailbox access ----
  app.get("/admin/users/:id/mailboxes", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const rows = await prisma.userMailbox.findMany({ where: { userId: id }, select: { mailboxId: true } });
    return rows.map((r) => r.mailboxId);
  });

  app.put("/admin/users/:id/mailboxes", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = z.object({ mailboxIds: z.array(z.string()) }).parse(req.body);
    await prisma.$transaction([
      prisma.userMailbox.deleteMany({ where: { userId: id } }),
      prisma.userMailbox.createMany({
        data: body.mailboxIds.map((mb) => ({ userId: id, mailboxId: mb })),
        skipDuplicates: true,
      }),
    ]);
    return { count: body.mailboxIds.length };
  });

  // PATCH user (rename, role change)
  app.patch("/admin/users/:id", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = z.object({
      name: z.string().optional(),
      role: z.enum(["owner", "admin", "manager"]).optional(),
      signature: z.string().nullable().optional(),
    }).parse(req.body);
    return prisma.user.update({ where: { id }, data: body, select: { id: true, name: true, role: true, signature: true } });
  });

  app.delete("/admin/mailboxes/:id", { preHandler: requireRole("owner") }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    const has = await prisma.message.findFirst({ where: { mailboxId: id } });
    if (has) throw new BadRequest("mailbox has messages; disable instead of deleting");
    await prisma.mailbox.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ---- contacts ----
  app.get("/admin/contacts", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const q = z.object({ q: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    return prisma.contact.findMany({
      where: q.q ? { OR: [{ email: { contains: q.q, mode: "insensitive" } }, { name: { contains: q.q, mode: "insensitive" } }] } : undefined,
      orderBy: [{ useCount: "desc" }, { lastUsedAt: "desc" }],
      take: q.limit,
    });
  });

  app.post("/admin/contacts/scan-history", { preHandler: requireRole("owner", "admin") }, async () => {
    const { scanAllContacts } = await import("../services/contacts-scan.js");
    return scanAllContacts();
  });

  app.get("/admin/contacts/export.csv", { preHandler: requireRole("owner", "admin") }, async (_req, reply) => {
    const all = await prisma.contact.findMany({ orderBy: [{ useCount: "desc" }, { email: "asc" }] });
    const esc = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
    const lines = ["email,name,useCount,lastUsedAt"];
    for (const c of all) {
      lines.push([esc(c.email), esc(c.name), c.useCount, c.lastUsedAt ? c.lastUsedAt.toISOString() : ""].join(","));
    }
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="contacts-${new Date().toISOString().slice(0,10)}.csv"`);
    return reply.send("\uFEFF" + lines.join("\n"));
  });

  // ---- user company access ----
  app.get("/admin/users/:id/companies", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const rows = await prisma.userCompanyAccess.findMany({ where: { userId: id }, select: { companyId: true } });
    return rows.map((r) => r.companyId);
  });

  app.put("/admin/users/:id/companies", { preHandler: requireRole("owner") }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = z.object({ companyIds: z.array(z.string()) }).parse(req.body);
    await prisma.$transaction([
      prisma.userCompanyAccess.deleteMany({ where: { userId: id } }),
      prisma.userCompanyAccess.createMany({
        data: body.companyIds.map((c) => ({ userId: id, companyId: c })),
        skipDuplicates: true,
      }),
    ]);
    return { count: body.companyIds.length };
  });

  // ---- personas (signature cards for compose «From person») ----
  app.get("/personas", { preHandler: requireRole("owner", "admin", "manager") }, async () => {
    return prisma.persona.findMany({ orderBy: { name: "asc" } });
  });
  app.post("/admin/personas", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = z.object({ name: z.string().min(1), signature: z.string().min(1) }).parse(req.body);
    return prisma.persona.create({ data: body });
  });
  app.patch("/admin/personas/:id", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = z.object({ name: z.string().optional(), signature: z.string().optional() }).parse(req.body);
    return prisma.persona.update({ where: { id }, data: body });
  });
  app.delete("/admin/personas/:id", { preHandler: requireRole("owner", "admin") }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.persona.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ---- task settings (key/value) ----
  app.get("/admin/task-settings", { preHandler: requireRole("owner", "admin") }, async () => {
    const rows = await prisma.taskSetting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  app.put("/admin/task-settings", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = z.record(z.string(), z.string().nullable()).parse(req.body);
    for (const [key, value] of Object.entries(body)) {
      if (value === null || value === "") {
        await prisma.taskSetting.delete({ where: { key } }).catch(() => {});
      } else {
        await prisma.taskSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        });
      }
    }
    return { ok: true };
  });

  app.delete("/admin/contacts/:id", { preHandler: requireRole("owner", "admin") }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.contact.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ---- TG task notification delivery log ----
  app.get("/admin/tg-notify-log", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const q = z.object({
      taskId: z.string().optional(),
      userId: z.string().optional(),
      status: z.enum(["sent", "skipped", "failed"]).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(200),
    }).parse(req.query);
    const logs = await prisma.tgTaskNotify.findMany({
      where: { taskId: q.taskId, userId: q.userId, status: q.status },
      orderBy: { createdAt: "desc" },
      take: q.limit,
      include: { task: { select: { id: true, title: true } } },
    });
    const userIds = Array.from(new Set(logs.map((l) => l.userId)));
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
    return logs.map((l) => ({ ...l, user: userMap[l.userId] || null }));
  });

  // ---- audit log ----
  app.get("/admin/audit", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const q = z.object({
      userId: z.string().optional(),
      action: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).parse(req.query);
    return prisma.auditLog.findMany({
      where: { userId: q.userId, action: q.action },
      orderBy: { createdAt: "desc" },
      take: q.limit,
    });
  });

  // ---- analytics: heatmap (hour×weekday) ----
  app.get("/admin/analytics/heatmap", { preHandler: requireRole("owner", "admin") }, async () => {
    const rows = await prisma.$queryRaw<{ dow: number; hr: number; c: bigint }[]>`
      SELECT extract(dow from "createdAt")::int AS dow,
             extract(hour from "createdAt")::int AS hr,
             count(*)::bigint AS c
        FROM "AuditLog"
       WHERE "createdAt" >= now() - interval '30 days'
         AND action = 'message.send'
       GROUP BY 1, 2
       ORDER BY 1, 2
    `;
    return rows.map((r) => ({ dow: r.dow, hr: r.hr, c: Number(r.c) }));
  });

  // ---- analytics: leaderboard last 7 days ----
  app.get("/admin/analytics/leaderboard", { preHandler: requireRole("owner", "admin") }, async () => {
    const rows = await prisma.$queryRaw<{ userId: string; email: string; sent: bigint }[]>`
      SELECT u.id AS "userId", u.email, count(a.id)::bigint AS sent
        FROM "User" u
        LEFT JOIN "AuditLog" a ON a."userId" = u.id
                              AND a.action = 'message.send'
                              AND a."createdAt" >= now() - interval '7 days'
       GROUP BY u.id, u.email
       ORDER BY sent DESC
       LIMIT 10
    `;
    return rows.map((r) => ({ userId: r.userId, email: r.email, sent: Number(r.sent) }));
  });

  // ---- analytics: top contacts per user ----
  app.get("/admin/analytics/contacts/:userId", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { userId } = z.object({ userId: z.string() }).parse(req.params);
    const rows = await prisma.$queryRaw<{ contact: string; c: bigint }[]>`
      SELECT (a.details->>'to')::text AS contact, count(*)::bigint AS c
        FROM "AuditLog" a
       WHERE a."userId" = ${userId}
         AND a.action = 'message.send'
       GROUP BY 1
       ORDER BY c DESC
       LIMIT 20
    `;
    return rows.map((r) => ({ contact: r.contact, c: Number(r.c) }));
  });

  // ---- analytics ----
  app.get("/admin/analytics", { preHandler: requireRole("owner", "admin") }, async () => {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, lastLoginAt: true, createdAt: true },
    });

    const result = await Promise.all(
      users.map(async (u) => {
        // Session pairing: walk login/logout events ordered by time.
        const events = await prisma.auditLog.findMany({
          where: { userId: u.id, action: { in: ["auth.login", "auth.logout"] } },
          orderBy: { createdAt: "asc" },
          select: { action: true, createdAt: true },
        });

        let sessionCount = 0;
        let totalSessionMs = 0;
        let openLogin: Date | null = null;
        for (const e of events) {
          if (e.action === "auth.login") {
            if (openLogin) {
              // implicit close at next login
              const dur = e.createdAt.getTime() - openLogin.getTime();
              if (dur > 0 && dur < 12 * 3600 * 1000) totalSessionMs += dur;
            }
            openLogin = e.createdAt;
            sessionCount++;
          } else if (e.action === "auth.logout" && openLogin) {
            const dur = e.createdAt.getTime() - openLogin.getTime();
            if (dur > 0 && dur < 12 * 3600 * 1000) totalSessionMs += dur;
            openLogin = null;
          }
        }
        // Don't count still-open session.

        const [sentCount, deletedCount, summarizeCount, aiReplyCount] = await Promise.all([
          prisma.auditLog.count({ where: { userId: u.id, action: "message.send" } }),
          prisma.auditLog.count({ where: { userId: u.id, action: "message.delete" } }),
          prisma.auditLog.count({ where: { userId: u.id, action: "message.summarize" } }),
          prisma.auditLog.count({ where: { userId: u.id, action: "message.ai_reply" } }),
        ]);

        const inactiveDays = u.lastLoginAt
          ? Math.floor((Date.now() - u.lastLoginAt.getTime()) / (24 * 3600 * 1000))
          : null;

        // Avg response time: for each "send" event, find the most recent inbound
        // message in the same mailbox from any of the recipients before that send,
        // and compute the delta. Aggregate.
        const sentEvents = await prisma.auditLog.findMany({
          where: { userId: u.id, action: "message.send" },
          select: { createdAt: true, details: true },
          take: 200,
        });
        let respTotal = 0;
        let respCount = 0;
        for (const ev of sentEvents) {
          const det = ev.details as { to?: string[] } | null;
          if (!det?.to?.length) continue;
          const inbound = await prisma.message.findFirst({
            where: {
              fromAddr: { in: det.to },
              receivedAt: { lt: ev.createdAt, not: null },
            },
            orderBy: { receivedAt: "desc" },
            select: { receivedAt: true },
          });
          if (inbound?.receivedAt) {
            const dt = ev.createdAt.getTime() - inbound.receivedAt.getTime();
            if (dt > 0 && dt < 7 * 24 * 3600 * 1000) {
              respTotal += dt;
              respCount++;
            }
          }
        }
        const avgResponseHours = respCount ? Math.round((respTotal / respCount / 3600000) * 10) / 10 : null;

        return {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          lastLoginAt: u.lastLoginAt,
          inactiveDays,
          sessionCount,
          totalSessionHours: Math.round((totalSessionMs / 3600000) * 10) / 10,
          sent: sentCount,
          deleted: deletedCount,
          aiSummarize: summarizeCount,
          aiReply: aiReplyCount,
          aiUsageRatio: sentCount ? Math.round((aiReplyCount / sentCount) * 100) : 0,
          avgResponseHours,
        };
      }),
    );

    return result.sort((a, b) => b.sent - a.sent);
  });

  // ---- rules ----
  app.get("/admin/rules", { preHandler: requireRole("owner", "admin") }, async () => {
    return prisma.rule.findMany({ orderBy: { createdAt: "desc" } });
  });

  const CreateRule = z.object({
    triggerType: z.enum(["from", "to", "subject"]),
    contains: z.string().min(1),
    folderId: z.string().min(1),
    enabled: z.boolean().default(true),
  });
  app.post("/admin/rules", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = CreateRule.parse(req.body);
    return prisma.rule.create({ data: body });
  });

  app.patch("/admin/rules/:id", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = z.object({ enabled: z.boolean().optional(), contains: z.string().optional() }).parse(req.body);
    return prisma.rule.update({ where: { id }, data: body });
  });

  app.delete("/admin/rules/:id", { preHandler: requireRole("owner", "admin") }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.rule.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ---- sent folder sync ----
  app.post(
    "/admin/mailboxes/:id/sync-sent",
    { preHandler: requireRole("owner", "admin") },
    async (req) => {
      const { id } = Params.parse(req.params);
      const mb = await prisma.mailbox.findUnique({ where: { id } });
      if (!mb) throw new NotFound();
      const result = await syncSentForMailbox(id);
      return { ok: true, mailboxId: id, ...result };
    },
  );

  app.post(
    "/admin/sync-sent-all",
    { preHandler: requireRole("owner", "admin") },
    async () => {
      const mailboxes = await prisma.mailbox.findMany({ where: { enabled: true } });
      const results = await Promise.allSettled(
        mailboxes.map((m) => syncSentForMailbox(m.id)),
      );
      return {
        ok: true,
        total: mailboxes.length,
        succeeded: results.filter((r) => r.status === "fulfilled").length,
      };
    },
  );
}
