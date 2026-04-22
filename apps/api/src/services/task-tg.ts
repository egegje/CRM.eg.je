import { prisma } from "@crm/db";
import { loadConfig } from "../config.js";
import { sendWebPush } from "./push.js";

const cfg = loadConfig();

type InlineKeyboard = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

type SendResult =
  | { status: "sent"; tgMessageId: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Low-level Telegram API call against the task bot token. */
export async function tgTask(method: string, body: unknown): Promise<unknown> {
  if (!cfg.taskBotToken) return null;
  const r = await fetch(`https://api.telegram.org/bot${cfg.taskBotToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json().catch(() => null);
}

/** Send a message via the task bot to a CRM user and return a structured delivery result. */
export async function sendTaskBotToUser(
  userId: string,
  text: string,
  reply_markup?: InlineKeyboard,
): Promise<SendResult> {
  if (!cfg.taskBotToken) return { status: "skipped", reason: "bot token not configured" };
  const binding = await prisma.tgUserBinding.findUnique({ where: { userId } });
  if (!binding) return { status: "skipped", reason: "no TG binding" };
  try {
    const r = (await tgTask("sendMessage", {
      chat_id: Number(binding.tgUserId),
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup,
    })) as { ok?: boolean; result?: { message_id: number }; description?: string } | null;
    if (r && r.ok && r.result) return { status: "sent", tgMessageId: r.result.message_id };
    return { status: "failed", reason: r?.description || "unknown TG API error" };
  } catch (e) {
    return { status: "failed", reason: (e as Error).message };
  }
}

async function notificationsPaused(): Promise<boolean> {
  const p = await prisma.taskSetting.findUnique({ where: { key: "tg_notifications_paused" } });
  return p?.value === "true";
}

async function logNotify(
  taskId: string,
  userId: string,
  kind: string,
  result: SendResult,
): Promise<void> {
  try {
    await prisma.tgTaskNotify.create({
      data: {
        taskId,
        userId,
        kind,
        status: result.status,
        tgMessageId: result.status === "sent" ? result.tgMessageId : null,
        reason: result.status === "sent" ? null : result.reason,
      },
    });
  } catch (e) {
    console.error("logNotify:", (e as Error).message);
  }
}

async function deliverAndLog(
  taskId: string,
  userId: string,
  kind: string,
  text: string,
): Promise<void> {
  const result = await sendTaskBotToUser(userId, text);
  await logNotify(taskId, userId, kind, result);
}

/** Notify an assignee + co-assignees that a new task was created or assigned to them. */
export async function notifyAssignment(taskId: string, byUserId: string | null): Promise<void> {
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true, coAssignees: true },
  });
  if (!t) return;
  const targets = new Set<string>();
  if (t.assigneeId) targets.add(t.assigneeId);
  for (const ca of t.coAssignees) targets.add(ca.userId);
  for (const uid of Array.from(targets)) {
    if (byUserId && uid === byUserId) targets.delete(uid);
  }
  if (!targets.size) return;

  if (await notificationsPaused()) {
    for (const uid of targets) {
      await logNotify(taskId, uid, "assignment", { status: "skipped", reason: "paused" });
    }
    return;
  }

  const by = byUserId
    ? await prisma.user.findUnique({ where: { id: byUserId }, select: { name: true } })
    : null;
  const lines = [
    `📌 <b>Новая задача:</b> ${escapeHtml(t.title)}`,
    by ? `от: ${escapeHtml(by.name)}` : "",
  ].filter(Boolean);
  if (t.dueDate) lines.push(`дедлайн: ${t.dueDate.toLocaleDateString("ru")}`);
  if (t.project) lines.push(`проект: ${escapeHtml(t.project.name)}`);
  if (t.priority && t.priority !== "normal") lines.push(`приоритет: ${t.priority}`);
  if (t.description) lines.push("", escapeHtml(t.description.slice(0, 300)));
  const text = lines.join("\n");
  const pushTitle = "Новая задача";
  const pushBody = by ? `${t.title} · от ${by.name}` : t.title;
  const pushUrl = `/#/tasks/${t.id}`;
  for (const uid of targets) {
    await deliverAndLog(taskId, uid, "assignment", text);
    sendWebPush(uid, { title: pushTitle, body: pushBody, url: pushUrl, tag: `task-${t.id}` })
      .catch((e) => console.error("push:", (e as Error).message));
  }
}

/** Notify creator: assignee marked task as ready for review. */
export async function notifyReviewRequested(taskId: string, byUserId: string | null): Promise<void> {
  const t = await prisma.task.findUnique({ where: { id: taskId } });
  if (!t || !t.creatorId) return;
  if (byUserId && t.creatorId === byUserId) return;
  if (await notificationsPaused()) {
    await logNotify(taskId, t.creatorId, "reviewRequested", { status: "skipped", reason: "paused" });
    return;
  }
  const by = byUserId
    ? await prisma.user.findUnique({ where: { id: byUserId }, select: { name: true } })
    : null;
  const text = [
    `🔎 <b>Задача на проверку:</b> ${escapeHtml(t.title)}`,
    by ? `исполнитель: ${escapeHtml(by.name)}` : "",
    `Откройте задачу в CRM и подтвердите закрытие или верните в работу.`,
  ].filter(Boolean).join("\n");
  await deliverAndLog(taskId, t.creatorId, "reviewRequested", text);
}

/** Notify assignee + co-assignees: creator confirmed closure. */
export async function notifyReviewConfirmed(taskId: string, byUserId: string | null): Promise<void> {
  const t = await prisma.task.findUnique({ where: { id: taskId }, include: { coAssignees: true } });
  if (!t) return;
  const targets = new Set<string>();
  if (t.assigneeId) targets.add(t.assigneeId);
  for (const ca of t.coAssignees) targets.add(ca.userId);
  for (const uid of Array.from(targets)) {
    if (byUserId && uid === byUserId) targets.delete(uid);
  }
  if (!targets.size) return;

  if (await notificationsPaused()) {
    for (const uid of targets) {
      await logNotify(taskId, uid, "reviewConfirmed", { status: "skipped", reason: "paused" });
    }
    return;
  }

  const by = byUserId
    ? await prisma.user.findUnique({ where: { id: byUserId }, select: { name: true } })
    : null;
  const text = [
    `✅ <b>Закрытие подтверждено:</b> ${escapeHtml(t.title)}`,
    by ? `подтвердил(а): ${escapeHtml(by.name)}` : "",
  ].filter(Boolean).join("\n");
  for (const uid of targets) {
    await deliverAndLog(taskId, uid, "reviewConfirmed", text);
  }
}

/** Notify assignee + co-assignees: creator returned task to work. */
export async function notifyReviewReturned(taskId: string, byUserId: string | null): Promise<void> {
  const t = await prisma.task.findUnique({ where: { id: taskId }, include: { coAssignees: true } });
  if (!t) return;
  const targets = new Set<string>();
  if (t.assigneeId) targets.add(t.assigneeId);
  for (const ca of t.coAssignees) targets.add(ca.userId);
  for (const uid of Array.from(targets)) {
    if (byUserId && uid === byUserId) targets.delete(uid);
  }
  if (!targets.size) return;

  if (await notificationsPaused()) {
    for (const uid of targets) {
      await logNotify(taskId, uid, "reviewReturned", { status: "skipped", reason: "paused" });
    }
    return;
  }

  const by = byUserId
    ? await prisma.user.findUnique({ where: { id: byUserId }, select: { name: true } })
    : null;
  const text = [
    `↩️ <b>Задача возвращена в работу:</b> ${escapeHtml(t.title)}`,
    by ? `вернул(а): ${escapeHtml(by.name)}` : "",
    `Проверьте комментарии и продолжите выполнение.`,
  ].filter(Boolean).join("\n");
  for (const uid of targets) {
    await deliverAndLog(taskId, uid, "reviewReturned", text);
  }
}
