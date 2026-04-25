import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Prisma } from "@crm/db";
import { requireRole, requireUser } from "../auth.js";
import { hashPassword } from "../auth.js";
import { accessibleMailboxIds } from "../services/access.js";
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
    const mb = await prisma.mailbox.create({
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
    // The creator obviously wants to see the mailbox they just added —
    // auto-grant access to themselves so they don't have to make a second
    // trip to /admin/users to check the box.
    if (req.user) {
      await prisma.userMailbox.create({ data: { userId: req.user.id, mailboxId: mb.id } });
    }
    return mb;
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
      syncSince: z.union([z.coerce.date(), z.null()]).optional(),
      lazyAttachments: z.boolean().optional(),
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
      select: { id: true, email: true, displayName: true, enabled: true, signature: true, imapHost: true, imapPort: true, smtpHost: true, smtpPort: true, syncSince: true, lazyAttachments: true },
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

  // Contact card: history of messages and related tasks for one email.
  // Auth = any logged-in user (we already restrict per-mailbox via accessIds).
  app.get("/contacts/card", { preHandler: requireUser() }, async (req) => {
    const q = z.object({ email: z.string().email() }).parse(req.query);
    const email = q.email;
    const accessIds = await accessibleMailboxIds(req.user!);
    const [contact, fromMessages, toMessages, tasks] = await Promise.all([
      prisma.contact.findFirst({ where: { email: { equals: email, mode: "insensitive" } } }),
      prisma.message.findMany({
        where: {
          fromAddr: { equals: email, mode: "insensitive" },
          mailboxId: { in: accessIds },
          deletedAt: null,
        },
        select: {
          id: true, subject: true, fromAddr: true, fromName: true,
          receivedAt: true, sentAt: true, isRead: true, mailboxId: true,
        },
        orderBy: { receivedAt: "desc" },
        take: 20,
      }),
      prisma.message.findMany({
        where: {
          toAddrs: { has: email },
          mailboxId: { in: accessIds },
          deletedAt: null,
        },
        select: {
          id: true, subject: true, toAddrs: true,
          receivedAt: true, sentAt: true, mailboxId: true,
        },
        orderBy: { sentAt: "desc" },
        take: 20,
      }),
      prisma.task.findMany({
        where: {
          OR: [
            { description: { contains: email, mode: "insensitive" } },
            { title: { contains: email, mode: "insensitive" } },
          ],
        },
        select: { id: true, title: true, status: true, dueDate: true, priority: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);
    return {
      email,
      name: contact?.name || fromMessages[0]?.fromName || "",
      useCount: contact?.useCount ?? 0,
      lastUsedAt: contact?.lastUsedAt ?? null,
      from: fromMessages,
      to: toMessages,
      tasks,
    };
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

  // Upload a facsimile signature PNG for a persona.
  app.post("/admin/personas/:id/signature", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const file = await req.file();
    if (!file) throw new BadRequest("no file");
    const buf = await file.toBuffer();
    if (buf.length > 5 * 1024 * 1024) throw new BadRequest("файл больше 5 МБ");
    if (!file.mimetype.startsWith("image/")) throw new BadRequest("ожидается PNG/JPG");
    const cfg = loadConfig();
    const dir = (await import("node:path")).join(cfg.attachmentDir, "_signatures");
    await (await import("node:fs/promises")).mkdir(dir, { recursive: true });
    const path = (await import("node:path")).join(dir, `${id}.png`);
    await (await import("node:fs/promises")).writeFile(path, buf);
    await prisma.persona.update({ where: { id }, data: { signaturePath: path } });
    return { ok: true };
  });

  // Companies — minimum CRUD + requisites + seal upload (one-of-each is fine
  // for now; the existing schema already has Company rows).
  app.get("/admin/companies", { preHandler: requireRole("owner", "admin") }, async () => {
    return prisma.company.findMany({ orderBy: { name: "asc" } });
  });
  app.patch("/admin/companies/:id", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = z
      .object({
        name: z.string().optional(),
        inn: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        requisites: z.record(z.string(), z.string()).nullable().optional(),
      })
      .parse(req.body);
    return prisma.company.update({ where: { id }, data: body as Prisma.CompanyUpdateInput });
  });
  app.post("/admin/companies/:id/seal", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const file = await req.file();
    if (!file) throw new BadRequest("no file");
    const buf = await file.toBuffer();
    if (buf.length > 5 * 1024 * 1024) throw new BadRequest("файл больше 5 МБ");
    if (!file.mimetype.startsWith("image/")) throw new BadRequest("ожидается PNG/JPG");
    const cfg = loadConfig();
    const dir = (await import("node:path")).join(cfg.attachmentDir, "_seals");
    await (await import("node:fs/promises")).mkdir(dir, { recursive: true });
    const path = (await import("node:path")).join(dir, `${id}.png`);
    await (await import("node:fs/promises")).writeFile(path, buf);
    await prisma.company.update({ where: { id }, data: { sealPath: path } });
    return { ok: true };
  });

  // ---- document templates ----
  app.get("/admin/doc-templates", { preHandler: requireUser() }, async () => {
    return prisma.documentTemplate.findMany({ orderBy: { name: "asc" } });
  });
  app.post("/admin/doc-templates", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = z.object({ name: z.string().min(1), html: z.string().min(1) }).parse(req.body);
    return prisma.documentTemplate.create({ data: body });
  });
  app.patch("/admin/doc-templates/:id", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = z.object({ name: z.string().optional(), html: z.string().optional() }).parse(req.body);
    return prisma.documentTemplate.update({ where: { id }, data: body });
  });
  app.delete("/admin/doc-templates/:id", { preHandler: requireRole("owner", "admin") }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.documentTemplate.delete({ where: { id } });
    return reply.status(204).send();
  });

  // Render a template to HTML with placeholders filled. Signature/seal PNGs
  // are inlined as data: URIs so the resulting HTML is self-contained — the
  // user can save-as-PDF in their browser and attach to email manually.
  app.post("/doc-templates/:id/render", { preHandler: requireUser() }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    const body = z
      .object({ companyId: z.string().optional(), personaId: z.string().optional() })
      .parse(req.body);
    const tpl = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFound();
    const company = body.companyId
      ? await prisma.company.findUnique({ where: { id: body.companyId } })
      : null;
    const persona = body.personaId
      ? await prisma.persona.findUnique({ where: { id: body.personaId } })
      : null;
    const fs = await import("node:fs/promises");
    const toDataUri = async (p: string | null | undefined) => {
      if (!p) return "";
      try {
        const b = await fs.readFile(p);
        return "data:image/png;base64," + b.toString("base64");
      } catch {
        return "";
      }
    };
    const signatureSrc = await toDataUri(persona?.signaturePath);
    const sealSrc = await toDataUri(company?.sealPath);
    const reqMap = (company?.requisites as Record<string, string> | null) ?? {};
    const placeholders: Record<string, string> = {
      "дата": new Date().toLocaleDateString("ru"),
      "сегодня": new Date().toLocaleDateString("ru"),
      "имя": persona?.name ?? "",
      "подпись_фио": persona?.name ?? "",
      "компания": company?.name ?? "",
      "инн": company?.inn ?? "",
      "подпись": signatureSrc
        ? `<img src="${signatureSrc}" alt="подпись" style="max-height:60px">`
        : "",
      "печать": sealSrc
        ? `<img src="${sealSrc}" alt="печать" style="max-height:120px">`
        : "",
    };
    for (const [k, v] of Object.entries(reqMap)) placeholders[k] = v;
    let html = tpl.html;
    for (const [k, v] of Object.entries(placeholders)) {
      const re = new RegExp("\\{\\{\\s*" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\}\\}", "gi");
      html = html.replace(re, v);
    }
    const fullHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${tpl.name}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.5; color: #000; }
  .stamp-block { margin-top: 32px; position: relative; }
  .stamp-block img { vertical-align: middle; }
  table { border-collapse: collapse; }
</style>
</head><body>${html}</body></html>`;
    reply.header("content-type", "text/html; charset=utf-8");
    return fullHtml;
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

  const RuleBody = z.object({
    name: z.string().nullable().optional(),
    triggerType: z.enum(["from", "from_domain", "to", "subject"]),
    contains: z.string().min(1),
    folderId: z.string().nullable().optional(),
    tagId: z.string().nullable().optional(),
    createTask: z.boolean().optional(),
    assignToUserId: z.string().nullable().optional(),
    markRead: z.boolean().optional(),
    enabled: z.boolean().optional(),
  });
  app.post("/admin/rules", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = RuleBody.parse(req.body);
    return prisma.rule.create({ data: body });
  });

  app.patch("/admin/rules/:id", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = RuleBody.partial().parse(req.body);
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
