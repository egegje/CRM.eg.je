import { prisma } from "@crm/db";
import { sendTelegram } from "../services/notifier.js";

const REMINDER_HOURS = 24;
const FOLLOWUP_HOURS = 72;

export async function runReminders(now = new Date()): Promise<void> {
  const pauseSetting = await prisma.taskSetting.findUnique({ where: { key: "tg_notifications_paused" } });
  if (pauseSetting?.value === "true") return;

  const cutoff = new Date(now.getTime() - REMINDER_HOURS * 3600 * 1000);
  // Unread messages older than 24h, not yet reminded.
  const stale = await prisma.message.findMany({
    where: {
      isRead: false,
      deletedAt: null,
      isDraft: false,
      receivedAt: { lt: cutoff, not: null },
      // Avoid spamming by storing reminder marker in aiActions (hacky but no extra column)
      // Use a marker action item "_reminded"
      NOT: { aiActions: { has: "_reminded" } },
    },
    include: { mailbox: true },
    orderBy: { receivedAt: "asc" },
    take: 50,
  });

  for (const m of stale) {
    const lines = [
      `⏰ <b>Непрочитано более 24ч</b>`,
      `<b>${escapeHtml(m.mailbox.displayName)}</b> · ${escapeHtml(m.mailbox.email)}`,
      `<b>От:</b> ${escapeHtml(m.fromAddr)}`,
      `<b>Тема:</b> ${escapeHtml(m.subject || "(без темы)")}`,
    ];
    if (m.aiSummary) lines.push("", `<i>${escapeHtml(m.aiSummary)}</i>`);
    try {
      await sendTelegram(lines.join("\n"));
      await prisma.message.update({
        where: { id: m.id },
        data: { aiActions: [...m.aiActions, "_reminded"] },
      });
    } catch (e) {
      console.error("reminder send failed:", (e as Error).message);
    }
  }
}

export async function runFollowups(now = new Date()): Promise<void> {
  const pauseSetting = await prisma.taskSetting.findUnique({ where: { key: "tg_notifications_paused" } });
  if (pauseSetting?.value === "true") return;

  const cutoff = new Date(now.getTime() - FOLLOWUP_HOURS * 3600 * 1000);
  // Sent messages older than 72h with no incoming reply from any of `toAddrs`.
  const sent = await prisma.message.findMany({
    where: {
      sentAt: { lt: cutoff, not: null },
      isDraft: false,
      NOT: { aiActions: { has: "_followup_sent" } },
    },
    include: { mailbox: true },
    orderBy: { sentAt: "desc" },
    take: 50,
  });
  for (const s of sent) {
    if (!s.toAddrs?.length) continue;
    // Was there an incoming message from any of the recipients into the same mailbox after sentAt?
    const reply = await prisma.message.findFirst({
      where: {
        mailboxId: s.mailboxId,
        receivedAt: { gt: s.sentAt!, not: null },
        fromAddr: { in: s.toAddrs },
      },
    });
    if (reply) {
      await prisma.message.update({
        where: { id: s.id },
        data: { aiActions: [...s.aiActions, "_followup_sent"] }, // marked done
      });
      continue;
    }
    const lines = [
      `📭 <b>Нет ответа на письмо ${FOLLOWUP_HOURS}ч+</b>`,
      `<b>${escapeHtml(s.mailbox.displayName)}</b> · ${escapeHtml(s.mailbox.email)}`,
      `<b>Кому:</b> ${escapeHtml(s.toAddrs.join(", "))}`,
      `<b>Тема:</b> ${escapeHtml(s.subject || "(без темы)")}`,
    ];
    try {
      await sendTelegram(lines.join("\n"));
      await prisma.message.update({
        where: { id: s.id },
        data: { aiActions: [...s.aiActions, "_followup_sent"] },
      });
    } catch (e) {
      console.error("followup send failed:", (e as Error).message);
    }
  }
}

export async function runSnoozes(now = new Date()): Promise<void> {
  const due = await prisma.snooze.findMany({
    where: { notified: false, snoozeUntil: { lte: now } },
    take: 100,
  });
  for (const s of due) {
    const m = await prisma.message.findUnique({
      where: { id: s.messageId },
      include: { mailbox: true },
    });
    if (!m) {
      await prisma.snooze.update({ where: { id: s.id }, data: { notified: true } });
      continue;
    }
    const lines = [
      `🔔 <b>Напоминание о письме</b>`,
      `<b>${escapeHtml(m.mailbox.displayName)}</b> · ${escapeHtml(m.mailbox.email)}`,
      `<b>От:</b> ${escapeHtml(m.fromAddr)}`,
      `<b>Тема:</b> ${escapeHtml(m.subject || "(без темы)")}`,
    ];
    if (m.aiSummary) lines.push("", `<i>${escapeHtml(m.aiSummary)}</i>`);
    try {
      await sendTelegram(lines.join("\n"));
      await prisma.snooze.update({ where: { id: s.id }, data: { notified: true } });
    } catch (e) {
      console.error("snooze send failed:", (e as Error).message);
    }
  }
}

export async function checkResponseTracking(now = new Date()): Promise<void> {
  // Find all tracking tasks (with tag "отслеживание") that are open and past due
  const trackingTag = await prisma.taskTag.findUnique({ where: { name: "отслеживание" } });
  if (!trackingTag) return;

  const overdueTasks = await prisma.task.findMany({
    where: {
      status: { in: ["open", "in_progress"] },
      tagAssignments: { some: { tagId: trackingTag.id } },
      dueDate: { lte: now },
    },
    include: { comments: true },
  });

  for (const task of overdueTasks) {
    // Skip if already has an expiry comment
    if (task.comments.some((c) => c.text.includes("Срок ответа истёк") || c.text.includes("Ответ получен"))) {
      continue;
    }

    // Parse tracking metadata from description
    const meta = parseTrackingMeta(task.description || "");
    if (!meta.toAddrs.length) continue;

    // Check if a reply came from any of the tracked addresses
    const reply = await prisma.message.findFirst({
      where: {
        fromAddr: { in: meta.toAddrs },
        receivedAt: { gt: task.createdAt, not: null },
        deletedAt: null,
        isDraft: false,
      },
      orderBy: { receivedAt: "desc" },
    });

    // Use a system user ID for automated comments
    const systemUserId = task.assigneeId || task.creatorId;

    if (reply) {
      const replyDate = reply.receivedAt
        ? reply.receivedAt.toLocaleDateString("ru-RU")
        : "неизвестно";
      await prisma.taskComment.create({
        data: {
          taskId: task.id,
          userId: systemUserId,
          text: `\u2705 Ответ получен от ${reply.fromAddr} ${replyDate}`,
        },
      });
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "done", completedAt: new Date() },
      });
    } else {
      await prisma.taskComment.create({
        data: {
          taskId: task.id,
          userId: systemUserId,
          text: `\u26A0\uFE0F Срок ответа истёк. Проверь пришёл ли ответ по обращению.`,
        },
      });
      // Send TG notification
      try {
        const lines = [
          `\u{1F514} <b>Срок ответа истёк</b>`,
          `<b>Задача:</b> ${escapeHtml(task.title)}`,
          `<b>Ожидали ответ от:</b> ${escapeHtml(meta.toAddrs.join(", "))}`,
        ];
        await sendTelegram(lines.join("\n"));
      } catch (e) {
        console.error("tracking tg notify failed:", (e as Error).message);
      }
    }
  }

  // Also check non-overdue tracking tasks for early replies
  const pendingTasks = await prisma.task.findMany({
    where: {
      status: { in: ["open", "in_progress"] },
      tagAssignments: { some: { tagId: trackingTag.id } },
      dueDate: { gt: now },
    },
    include: { comments: true },
  });

  for (const task of pendingTasks) {
    if (task.comments.some((c) => c.text.includes("Ответ получен"))) continue;

    const meta = parseTrackingMeta(task.description || "");
    if (!meta.toAddrs.length) continue;

    const reply = await prisma.message.findFirst({
      where: {
        fromAddr: { in: meta.toAddrs },
        receivedAt: { gt: task.createdAt, not: null },
        deletedAt: null,
        isDraft: false,
      },
      orderBy: { receivedAt: "desc" },
    });

    if (reply) {
      const systemUserId = task.assigneeId || task.creatorId;
      const replyDate = reply.receivedAt
        ? reply.receivedAt.toLocaleDateString("ru-RU")
        : "неизвестно";
      await prisma.taskComment.create({
        data: {
          taskId: task.id,
          userId: systemUserId,
          text: `\u2705 Ответ получен от ${reply.fromAddr} ${replyDate}`,
        },
      });
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "done", completedAt: new Date() },
      });
    }
  }
}

function parseTrackingMeta(description: string): { toAddrs: string[]; messageId: string } {
  const result = { toAddrs: [] as string[], messageId: "" };
  const metaIdx = description.indexOf("---TRACKING_META---");
  if (metaIdx === -1) return result;
  const metaBlock = description.slice(metaIdx);
  const toMatch = metaBlock.match(/toAddrs:(.+)/);
  if (toMatch) {
    try { result.toAddrs = JSON.parse(toMatch[1]); } catch {}
  }
  const msgMatch = metaBlock.match(/messageId:(.+)/);
  if (msgMatch) result.messageId = msgMatch[1].trim();
  return result;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
