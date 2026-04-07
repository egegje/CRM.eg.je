import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Prisma } from "@crm/db";
import { requireUser } from "../auth.js";
import { NotFound, BadRequest } from "../errors.js";
import { buildWhere } from "../services/search.js";
import { sendMessage } from "../services/send.js";
import { decrypt } from "../crypto.js";
import { sendQueue } from "../queue.js";
import { audit } from "../services/audit.js";

const ListQuery = z.object({
  folderId: z.string().optional(),
  mailboxId: z.string().optional(),
  q: z.string().optional(),
  from: z.string().optional(),
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
});

const SendBody = z.object({ sendAt: z.coerce.date().optional() });
const Params = z.object({ id: z.string() });

async function getOrCreateFolder(mailboxId: string, kind: "drafts" | "trash" | "sent" | "inbox", name: string) {
  const f = await prisma.folder.findFirst({ where: { mailboxId, kind } });
  if (f) return f;
  return prisma.folder.create({ data: { mailboxId, name, kind } });
}

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/messages", { preHandler: requireUser() }, async (req) => {
    const q = ListQuery.parse(req.query);
    if (q.q) {
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "Message" WHERE "fts" @@ plainto_tsquery('simple', $1) AND "deletedAt" IS NULL ORDER BY "receivedAt" DESC NULLS LAST LIMIT $2`,
        q.q,
        q.limit,
      );
      const ids = rows.map((r) => r.id);
      if (!ids.length) return [];
      return prisma.message.findMany({
        where: { id: { in: ids } },
        orderBy: { receivedAt: "desc" },
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
    });
    const args: Prisma.MessageFindManyArgs = {
      where,
      orderBy: { receivedAt: "desc" },
      take: q.limit,
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
    if (!m.isRead) {
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
    const body = Patch.parse(req.body);
    const data: Prisma.MessageUpdateInput = {};
    if (body.to) data.toAddrs = body.to;
    if (body.cc) data.ccAddrs = body.cc;
    if (body.subject !== undefined) data.subject = body.subject;
    if (body.bodyText !== undefined) data.bodyText = body.bodyText;
    if (body.bodyHtml !== undefined) data.bodyHtml = body.bodyHtml;
    if (body.isRead !== undefined) data.isRead = body.isRead;
    if (body.isStarred !== undefined) data.isStarred = body.isStarred;
    if (body.folderId) data.folder = { connect: { id: body.folderId } };
    return prisma.message.update({ where: { id }, data });
  });

  app.delete("/messages/:id", { preHandler: requireUser() }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    const m = await prisma.message.findUnique({ where: { id } });
    if (!m) throw new NotFound();
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
    return { draftId: draft.id, bodyText: draftText };
  });

  app.post("/messages/:id/summarize", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const m = await prisma.message.findUnique({ where: { id } });
    if (!m) throw new NotFound();
    if (m.aiSummary) return { summary: m.aiSummary, actions: m.aiActions };
    const { summarizeEmail } = await import("../services/ai.js");
    const r = await summarizeEmail({
      from: m.fromAddr,
      subject: m.subject,
      bodyText: m.bodyText,
      bodyHtml: m.bodyHtml,
    });
    await prisma.message.update({
      where: { id },
      data: { aiSummary: r.summary, aiActions: r.actionItems },
    });
    return { summary: r.summary, actions: r.actionItems };
  });

  app.post("/messages/:id/restore", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const m = await prisma.message.findUnique({ where: { id } });
    if (!m || !m.deletedAt) throw new BadRequest("not in trash");
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
    if (!m.mailbox.enabled) throw new BadRequest("mailbox disabled");
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

    const result = await sendMessage(
      { mailbox: m.mailbox, decrypt: (b) => decrypt(b, m.mailbox.email) },
      {
        from: m.mailbox.email,
        to: m.toAddrs,
        cc: m.ccAddrs,
        subject: m.subject,
        text: m.bodyText ?? "",
        html: m.bodyHtml ?? undefined,
      },
    );
    const sent = await getOrCreateFolder(m.mailboxId, "sent", "Sent");
    await prisma.message.update({
      where: { id },
      data: {
        isDraft: false,
        sentAt: new Date(),
        folderId: sent.id,
        messageId: result.messageId,
        fromAddr: m.mailbox.email,
      },
    });
    await audit(req, "message.send", { messageId: id, to: m.toAddrs, subject: m.subject });
    return { sent: true };
  });
}
