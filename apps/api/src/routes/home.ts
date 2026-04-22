import type { FastifyInstance } from "fastify";
import { prisma } from "@crm/db";
import { requireUser } from "../auth.js";
import { accessibleMailboxIds } from "../services/access.js";
import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../config.js";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay() || 7;
  if (day !== 1) x.setDate(x.getDate() - (day - 1));
  return x;
}

const briefingCache = new Map<string, { at: number; text: string }>();
const BRIEF_TTL_MS = 30 * 60 * 1000;

export async function homeRoutes(app: FastifyInstance): Promise<void> {
  const cfg = loadConfig();

  app.get("/home/summary", { preHandler: requireUser() }, async (req) => {
    const u = req.user!;
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);

    const mailboxIds = await accessibleMailboxIds(u);
    const mailboxFilter = { in: mailboxIds };

    const [
      unreadCount,
      openTasks,
      overdueTasks,
      accounts,
      companies,
      urgentTasks,
      unreadMessages,
      recentPayments,
      weeklyTasks,
    ] = await Promise.all([
      prisma.message.count({
        where: {
          isRead: false, deletedAt: null,
          mailboxId: mailboxFilter,
          folder: { kind: "inbox" },
        },
      }),
      prisma.task.count({ where: { status: { in: ["open", "in_progress", "awaiting_review"] } } }),
      prisma.task.count({ where: { status: { in: ["open", "in_progress"] }, dueDate: { lt: startOfDay(now) } } }),
      prisma.bankAccount.findMany({ select: { balance: true, currency: true } }),
      prisma.company.count({}),
      prisma.task.findMany({
        where: {
          status: { in: ["open", "in_progress"] },
          OR: [
            { dueDate: { lt: startOfDay(now) } },
            { priority: { in: ["urgent", "high"] } },
          ],
        },
        orderBy: [{ priority: "desc" }, { dueDate: { sort: "asc", nulls: "last" } }],
        take: 6,
        include: { project: { select: { id: true, name: true } } },
      }),
      prisma.message.findMany({
        where: {
          isRead: false, deletedAt: null,
          mailboxId: mailboxFilter,
          folder: { kind: "inbox" },
        },
        orderBy: { receivedAt: "desc" },
        take: 5,
        select: {
          id: true, subject: true, fromAddr: true, receivedAt: true,
          mailbox: { select: { email: true } },
        },
      }),
      prisma.bankTransaction.findMany({
        where: { direction: "CREDIT" },
        orderBy: { operationDate: "desc" },
        take: 5,
        select: {
          id: true, operationDate: true, amount: true,
          counterpartyName: true, paymentPurpose: true,
          accountNumber: true,
        },
      }),
      prisma.task.findMany({
        where: {
          status: { in: ["open", "in_progress"] },
          dueDate: { gte: weekStart, lt: weekEnd },
        },
        orderBy: { dueDate: "asc" },
        select: { id: true, title: true, dueDate: true, priority: true, assigneeId: true },
      }),
    ]);

    const balance = accounts.reduce((s, a) => s + Number(a.balance), 0);

    const week: Record<string, Array<{ id: string; title: string; priority: string }>> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      week[key] = [];
    }
    for (const t of weeklyTasks) {
      if (!t.dueDate) continue;
      const key = t.dueDate.toISOString().slice(0, 10);
      if (week[key]) week[key].push({ id: t.id, title: t.title, priority: t.priority });
    }

    return {
      now: now.toISOString(),
      counters: {
        unread: unreadCount,
        openTasks,
        overdueTasks,
        balance,
        objects: companies,
      },
      urgentTasks: urgentTasks.map(t => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
        project: t.project ? { id: t.project.id, name: t.project.name } : null,
        overdue: !!(t.dueDate && t.dueDate < startOfDay(now)),
      })),
      unreadMessages: unreadMessages.map(m => ({
        id: m.id,
        subject: m.subject,
        fromAddr: m.fromAddr,
        receivedAt: m.receivedAt,
        mailbox: m.mailbox?.email,
      })),
      recentPayments: recentPayments.map(p => ({
        id: p.id,
        date: p.operationDate,
        amount: Number(p.amount),
        counterparty: p.counterpartyName,
        purpose: p.paymentPurpose,
        accountNumber: p.accountNumber,
      })),
      week,
      weekStart: weekStart.toISOString().slice(0, 10),
    };
  });

  app.get("/home/briefing", { preHandler: requireUser() }, async (req, reply) => {
    const u = req.user!;
    const cached = briefingCache.get(u.id);
    if (cached && Date.now() - cached.at < BRIEF_TTL_MS) {
      return { text: cached.text, cached: true };
    }
    if (!cfg.anthropicApiKey) {
      return reply.code(503).send({ error: "AI не настроен" });
    }

    const now = new Date();
    const mailboxIds = await accessibleMailboxIds(u);
    const mailboxFilter = { in: mailboxIds };

    const [unread, overdue, openTasks, nextWeek, recentPayments] = await Promise.all([
      prisma.message.count({ where: { isRead: false, deletedAt: null, mailboxId: mailboxFilter, folder: { kind: "inbox" } } }),
      prisma.task.count({ where: { status: { in: ["open", "in_progress"] }, dueDate: { lt: startOfDay(now) } } }),
      prisma.task.count({ where: { status: { in: ["open", "in_progress", "awaiting_review"] } } }),
      prisma.task.findMany({
        where: {
          status: { in: ["open", "in_progress"] },
          dueDate: { gte: now, lt: new Date(now.getTime() + 7 * 86400000) },
        },
        orderBy: { dueDate: "asc" }, take: 5,
        select: { title: true, dueDate: true, priority: true },
      }),
      prisma.bankTransaction.findMany({
        where: { direction: "CREDIT", operationDate: { gte: new Date(now.getTime() - 7 * 86400000) } },
        orderBy: { operationDate: "desc" }, take: 3,
        select: { amount: true, counterpartyName: true },
      }),
    ]);

    const fmtRu = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
    const summary = {
      name: u.name || u.email?.split("@")[0] || "",
      unread, overdue, openTasks,
      nextTasks: nextWeek.map(t => `${t.title}${t.dueDate ? ` до ${fmtRu.format(t.dueDate)}` : ""} (${t.priority})`),
      recentPayments: recentPayments.map(p => `${Number(p.amount).toLocaleString("ru-RU")}₽ от ${p.counterpartyName || "—"}`),
    };

    try {
      const client = new Anthropic({ apiKey: cfg.anthropicApiKey });
      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 250,
        messages: [{
          role: "user",
          content: `Ты — ассистент в CRM. На основе данных дай 2-3 коротких предложения на русском языке — что важно сегодня. Пиши живо, по делу, без воды. Никаких списков, только связный текст. Если просрочено много — выдели это.\n\nДанные:\n${JSON.stringify(summary, null, 2)}`,
        }],
      });
      const text = res.content
        .filter((c) => c.type === "text")
        .map((c) => (c as { text: string }).text)
        .join("\n")
        .trim();
      briefingCache.set(u.id, { at: Date.now(), text });
      return { text, cached: false };
    } catch (e) {
      req.log.error({ err: e }, "home.briefing.ai");
      return reply.code(500).send({ error: "AI не ответил" });
    }
  });
}
