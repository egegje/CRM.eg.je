import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { prisma, type Prisma } from "@crm/db";
import { requireUser } from "../auth.js";
import { NotFound, BadRequest } from "../errors.js";
import { buildWhere, buildSearchWhere } from "../services/search.js";
import type { SearchIn, FolderKind } from "../services/search.js";
import { sendMessage } from "../services/send.js";
import { decrypt } from "../crypto.js";
import { sendQueue } from "../queue.js";
import { audit } from "../services/audit.js";
import { accessibleMailboxIds, assertMessageAccess } from "../services/access.js";

const ListQuery = z.object({
  folderId: z.string().optional(),
  mailboxId: z.string().optional(),
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  searchIn: z.enum(["all", "subject", "body", "from", "to"]).default("all"),
  folderKind: z.enum(["all", "inbox", "sent", "drafts"]).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  status: z.enum(["read", "unread", "all"]).optional(),
  trash: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const Create = z.object({
  mailboxId: z.string(),
  to: z.array(z.string().email()).default([]),
  cc: z.array(z.string().email()).default([]),
  subject: z.string().default(""),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
});

const Patch = z.object({
  to: z.array(z.string().email()).optional(),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  folderId: z.string().optional(),
  senderUserId: z.string().nullable().optional(),
  personaId: z.string().nullable().optional(),
});

const SendBody = z.object({ sendAt: z.coerce.date().optional() });
const Params = z.object({ id: z.string() });

async function getOrCreateFolder(mailboxId: string, kind: "drafts" | "trash" | "sent" | "inbox", name: string) {
  const f = await prisma.folder.findFirst({ where: { mailboxId, kind } });
  if (f) return f;
  return prisma.folder.create({ data: { mailboxId, name, kind } });
}

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/outbox", { preHandler: requireUser() }, async () => {
    const pending = await prisma.scheduledSend.count({ where: { status: "pending" } });
    const failed = await prisma.scheduledSend.count({ where: { status: "failed" } });
    return { pending, failed };
  });

  app.get("/messages", { preHandler: requireUser() }, async (req) => {
    const q = ListQuery.parse(req.query);
    const accessIds = await accessibleMailboxIds(req.user!);
    // Sent/drafts folders should sort by sentAt (that's the chronology users
    // expect). Receivedat on those rows reflects IMAP sync time, which can
    // jitter and breaks date-group headers (e.g. "Сегодня → На этой неделе →
    // Сегодня" interleaving).
    let isSentView = q.folderKind === "sent" || q.folderKind === "drafts";
    if (!isSentView && q.folderId) {
      const f = await prisma.folder.findUnique({
        where: { id: q.folderId },
        select: { kind: true },
      });
      if (f && (f.kind === "sent" || f.kind === "drafts")) isSentView = true;
    }
    const orderBy: Prisma.MessageOrderByWithRelationInput[] = isSentView
      ? [{ sentAt: { sort: "desc", nulls: "last" } }, { receivedAt: "desc" }]
      : [{ receivedAt: "desc" }];
    if (q.q) {
      // Scoped text search using Prisma (safe from SQL injection)
      const searchWhere = buildSearchWhere(q.q, q.searchIn as SearchIn);
      const baseWhere = buildWhere({
        folderId: q.folderId,
        mailboxId: q.mailboxId,
        fromAddr: q.from,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        status: q.status,
        trash: q.trash,
        folderKind: q.folderKind as FolderKind,
      });
      return prisma.message.findMany({
        where: {
          ...baseWhere,
          ...searchWhere,
          mailboxId: { in: accessIds },
        },
        orderBy,
        take: q.limit,
        include: { folder: { select: { kind: true } }, _count: { select: { attachments: true } } },
      });
    }
    const where = buildWhere({
      folderId: q.folderId,
      mailboxId: q.mailboxId,
      fromAddr: q.from,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      status: q.status,
      trash: q.trash,
      folderKind: q.folderKind as FolderKind,
    });
    (where as { mailboxId?: { in: string[] } }).mailboxId = { in: accessIds };
    const args: Prisma.MessageFindManyArgs = {
      where,
      orderBy,
      take: q.limit,
      include: { _count: { select: { attachments: true } } },
    };
    if (q.cursor) {
      args.cursor = { id: q.cursor };
      args.skip = 1;
    }
    return prisma.message.findMany(args);
  });

  app.get("/messages/:id", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const m = await prisma.message.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!m) throw new NotFound();
    await assertMessageAccess(req.user!, m);
    if (!m!.isRead) {
      await prisma.message.update({ where: { id }, data: { isRead: true } });
    }
    return m;
  });

  app.post("/messages", { preHandler: requireUser() }, async (req) => {
    const body = Create.parse(req.body);
    const drafts = await getOrCreateFolder(body.mailboxId, "drafts", "Drafts");
    return prisma.message.create({
      data: {
        mailboxId: body.mailboxId,
        folderId: drafts.id,
        isDraft: true,
        fromAddr: "",
        toAddrs: body.to,
        ccAddrs: body.cc,
        subject: body.subject,
        bodyText: body.bodyText,
        bodyHtml: body.bodyHtml,
      },
    });
  });

  app.patch("/messages/:id", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    await assertMessageAccess(req.user!, await prisma.message.findUnique({ where: { id }, select: { mailboxId: true } }));
    const body = Patch.parse(req.body);
    const data: Prisma.MessageUpdateInput = {};
    if (body.to) data.toAddrs = body.to;
    if (body.cc) data.ccAddrs = body.cc;
    if (body.subject !== undefined) data.subject = body.subject;
    if (body.bodyText !== undefined) data.bodyText = body.bodyText;
    if (body.bodyHtml !== undefined) data.bodyHtml = body.bodyHtml;
    if (body.isRead !== undefined) data.isRead = body.isRead;
    if (body.isStarred !== undefined) data.isStarred = body.isStarred;
    if (body.senderUserId !== undefined) data.senderUserId = body.senderUserId;
    if (body.personaId !== undefined) data.personaId = body.personaId;
    if (body.folderId) {
      const target = await prisma.folder.findUnique({ where: { id: body.folderId } });
      if (!target) throw new NotFound("folder not found");
      data.folder = { connect: { id: body.folderId } };
      // keep deletedAt consistent with target folder kind
      if (target.kind === "trash") data.deletedAt = new Date();
      else data.deletedAt = null;
    }
    return prisma.message.update({ where: { id }, data });
  });

  app.delete("/messages/:id", { preHandler: requireUser() }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    const m = await prisma.message.findUnique({ where: { id } });
    if (!m) throw new NotFound();
    await assertMessageAccess(req.user!, m);
    const trash = await getOrCreateFolder(m.mailboxId, "trash", "Trash");
    await prisma.message.update({
      where: { id },
      data: { deletedAt: new Date(), folderId: trash.id },
    });
    await audit(req, "message.delete", { messageId: id, subject: m.subject });
    return reply.status(204).send();
  });

  const Bulk = z.object({
    ids: z.array(z.string()).min(1).max(500),
    action: z.enum(["delete", "restore", "read", "unread", "star", "unstar", "move"]),
    folderId: z.string().optional(),
  });
  app.post("/messages/bulk", { preHandler: requireUser() }, async (req) => {
    const body = Bulk.parse(req.body);
    const accessIds = await accessibleMailboxIds(req.user!);
    const allowed = await prisma.message.findMany({
      where: { id: { in: body.ids }, mailboxId: { in: accessIds } },
      select: { id: true },
    });
    body.ids = allowed.map((m) => m.id);
    if (!body.ids.length) return { count: 0 };
    const where = { id: { in: body.ids } };
    if (body.action === "read") return prisma.message.updateMany({ where, data: { isRead: true } });
    if (body.action === "unread") return prisma.message.updateMany({ where, data: { isRead: false } });
    if (body.action === "star") return prisma.message.updateMany({ where, data: { isStarred: true } });
    if (body.action === "unstar") return prisma.message.updateMany({ where, data: { isStarred: false } });
    if (body.action === "delete") {
      // soft-delete: set deletedAt; folder move per-mailbox
      const ms = await prisma.message.findMany({ where, select: { id: true, mailboxId: true } });
      const byMb = new Map<string, string[]>();
      for (const m of ms) {
        if (!byMb.has(m.mailboxId)) byMb.set(m.mailboxId, []);
        byMb.get(m.mailboxId)!.push(m.id);
      }
      let count = 0;
      for (const [mailboxId, ids] of byMb) {
        const trash = await getOrCreateFolder(mailboxId, "trash", "Trash");
        const r = await prisma.message.updateMany({
          where: { id: { in: ids } },
          data: { deletedAt: new Date(), folderId: trash.id },
        });
        count += r.count;
      }
      return { count };
    }
    if (body.action === "restore") {
      const ms = await prisma.message.findMany({ where, select: { id: true, mailboxId: true } });
      let count = 0;
      for (const m of ms) {
        const inbox = await getOrCreateFolder(m.mailboxId, "inbox", "INBOX");
        await prisma.message.update({ where: { id: m.id }, data: { deletedAt: null, folderId: inbox.id } });
        count++;
      }
      return { count };
    }
    if (body.action === "move") {
      if (!body.folderId) throw new BadRequest("folderId required");
      return prisma.message.updateMany({ where, data: { folderId: body.folderId } });
    }
    throw new BadRequest("unknown action");
  });

  app.post("/messages/:id/ai-reply", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const m = await prisma.message.findUnique({ where: { id }, include: { mailbox: true } });
    if (!m) throw new NotFound();
    await assertMessageAccess(req.user!, m);
    const { generateReply } = await import("../services/ai.js");
    const draftText = await generateReply({
      from: m.fromAddr,
      subject: m.subject,
      bodyText: m.bodyText,
    });
    const drafts = await getOrCreateFolder(m.mailboxId, "drafts", "Drafts");
    const draft = await prisma.message.create({
      data: {
        mailboxId: m.mailboxId,
        folderId: drafts.id,
        isDraft: true,
        fromAddr: m.mailbox.email,
        toAddrs: [m.fromAddr],
        ccAddrs: [],
        subject: m.subject.startsWith("Re:") ? m.subject : "Re: " + m.subject,
        bodyText: draftText,
      },
    });
    await audit(req, "message.ai_reply", { messageId: id, draftId: draft.id });
    return { draftId: draft.id, bodyText: draftText };
  });

  const SnoozeBody = z.object({ until: z.coerce.date() });
  app.post("/messages/:id/snooze", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    await assertMessageAccess(req.user!, await prisma.message.findUnique({ where: { id }, select: { mailboxId: true } }));
    const body = SnoozeBody.parse(req.body);
    if (body.until.getTime() <= Date.now()) throw new BadRequest("until must be in the future");
    return prisma.snooze.upsert({
      where: { messageId: id },
      create: { messageId: id, snoozeUntil: body.until, notified: false },
      update: { snoozeUntil: body.until, notified: false },
    });
  });

  app.delete("/messages/:id/snooze", { preHandler: requireUser() }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.snooze.delete({ where: { messageId: id } }).catch(() => {});
    return reply.status(204).send();
  });

  app.post("/messages/:id/summarize", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const m = await prisma.message.findUnique({ where: { id } });
    if (!m) throw new NotFound();
    await assertMessageAccess(req.user!, m);
    if (m.aiSummary) return { summary: m.aiSummary, actions: m.aiActions, priority: m.aiPriority };
    const { summarizeEmail } = await import("../services/ai.js");
    const r = await summarizeEmail({
      from: m.fromAddr,
      subject: m.subject,
      bodyText: m.bodyText,
      bodyHtml: m.bodyHtml,
    });
    await prisma.message.update({
      where: { id },
      data: { aiSummary: r.summary, aiActions: r.actionItems, aiPriority: r.priority },
    });
    await audit(req, "message.summarize", { messageId: id });
    return { summary: r.summary, actions: r.actionItems, priority: r.priority };
  });

  app.post("/messages/:id/restore", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const m = await prisma.message.findUnique({ where: { id } });
    if (!m) throw new NotFound();
    await assertMessageAccess(req.user!, m);
    if (!m!.deletedAt) throw new BadRequest("not in trash");
    const inbox = await getOrCreateFolder(m.mailboxId, "inbox", "INBOX");
    return prisma.message.update({
      where: { id },
      data: { deletedAt: null, folderId: inbox.id },
    });
  });

  app.post("/messages/:id/send", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = SendBody.parse(req.body ?? {});
    const m = await prisma.message.findUnique({
      where: { id },
      include: { mailbox: true },
    });
    if (!m) throw new NotFound();
    await assertMessageAccess(req.user!, m);
    if (!m.mailbox.enabled) throw new BadRequest("mailbox disabled");

    // Check if email sending is paused globally
    const pauseSetting = await prisma.taskSetting.findUnique({ where: { key: "email_sending_paused" } });
    if (pauseSetting?.value === "true") throw new BadRequest("Отправка писем приостановлена администратором");

    const user = req.user!;

    if (body.sendAt && body.sendAt.getTime() > Date.now()) {
      const sched = await prisma.scheduledSend.create({
        data: {
          userId: user.id,
          mailboxId: m.mailboxId,
          payload: { messageId: id },
          sendAt: body.sendAt,
          status: "pending",
        },
      });
      const delay = body.sendAt.getTime() - Date.now();
      const job = await sendQueue.add("send", { scheduledId: sched.id }, { delay });
      await prisma.scheduledSend.update({
        where: { id: sched.id },
        data: { jobId: String(job.id) },
      });
      return { scheduled: true, id: sched.id };
    }

    // Per-persona signature: if the draft has personaId set, use that
    // persona's signature; otherwise fall back to mailbox-level signature.
    let signatureOverride: string | undefined;
    if (m.personaId) {
      const p = await prisma.persona.findUnique({
        where: { id: m.personaId },
        select: { signature: true },
      });
      signatureOverride = p?.signature ?? undefined;
    }
    // Load attachments from DB and read file contents
    const dbAttachments = await prisma.attachment.findMany({ where: { messageId: id } });
    const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
    for (const att of dbAttachments) {
      if (!att.storagePath) continue;
      try {
        const buf = await readFile(att.storagePath);
        attachments.push({ filename: att.filename, content: buf, contentType: att.mime });
      } catch {
        /* skip missing files */
      }
    }

    const result = await sendMessage(
      { mailbox: m.mailbox, decrypt: (b) => decrypt(b, m.mailbox.email) },
      {
        from: m.mailbox.email,
        to: m.toAddrs,
        cc: m.ccAddrs,
        subject: m.subject,
        text: m.bodyText ?? "",
        html: m.bodyHtml ?? undefined,
        attachments: attachments.length ? attachments : undefined,
        signatureOverride,
      },
    );
    const sent = await getOrCreateFolder(m.mailboxId, "sent", "Sent");
    await prisma.message.update({
      where: { id },
      data: {
        isDraft: false,
        isRead: true,
        sentAt: new Date(),
        folderId: sent.id,
        messageId: result.messageId,
        fromAddr: m.mailbox.email,
      },
    });
    await audit(req, "message.send", { messageId: id, to: m.toAddrs, subject: m.subject });
    return { sent: true };
  });

  // Cancel a pending scheduled-send (used by the "Undo send" toast).
  app.delete("/scheduled-sends/:id", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const sched = await prisma.scheduledSend.findUnique({ where: { id } });
    if (!sched) throw new NotFound();
    if (sched.userId !== req.user!.id) throw new BadRequest("не твоя отправка");
    if (sched.status !== "pending") return { cancelled: false, reason: "already " + sched.status };

    // Try to remove the BullMQ job so it doesn't fire.
    if (sched.jobId) {
      try {
        const job = await sendQueue.getJob(sched.jobId);
        if (job) await job.remove();
      } catch { /* job may already be gone */ }
    }

    await prisma.scheduledSend.update({
      where: { id },
      data: { status: "cancelled" },
    });
    // Keep the message as a draft so the user can edit and resend.
    const payload = sched.payload as { messageId?: string };
    if (payload?.messageId) {
      const drafts = await getOrCreateFolder(sched.mailboxId, "drafts", "Drafts");
      await prisma.message.update({
        where: { id: payload.messageId },
        data: { isDraft: true, folderId: drafts.id, sentAt: null },
      }).catch(() => null);
    }
    await audit(req, "message.scheduled.cancel", { scheduledId: id });
    return { cancelled: true };
  });
}
