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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
