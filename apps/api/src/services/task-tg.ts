import { prisma } from "@crm/db";
import { loadConfig } from "../config.js";

const cfg = loadConfig();

type InlineKeyboard = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

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

/** Send a message via the task bot to a CRM user (looked up via TgUserBinding). */
export async function sendTaskBotToUser(
  userId: string,
  text: string,
  reply_markup?: InlineKeyboard,
): Promise<void> {
  const binding = await prisma.tgUserBinding.findUnique({ where: { userId } });
  if (!binding) return;
  await tgTask("sendMessage", {
    chat_id: Number(binding.tgUserId),
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup,
  });
}

/** Notify an assignee that a new task was created or assigned to them. */
export async function notifyAssignment(taskId: string, byUserId: string | null): Promise<void> {
  const t = await prisma.task.findUnique({ where: { id: taskId }, include: { project: true } });
  if (!t || !t.assigneeId) return;
  if (byUserId && t.assigneeId === byUserId) return; // self-assigned, no ping
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
  await sendTaskBotToUser(t.assigneeId, lines.join("\n"));
}
