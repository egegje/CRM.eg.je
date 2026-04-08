import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../config.js";
import { prisma } from "@crm/db";
import { sendTaskBotToUser, escapeHtml } from "./task-tg.js";

const cfg = loadConfig();
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  if (cfg.anthropicApiKey) client = new Anthropic({ apiKey: cfg.anthropicApiKey });
  else if (cfg.anthropicAuthToken) client = new Anthropic({ authToken: cfg.anthropicAuthToken });
  else throw new Error("no anthropic key");
  return client;
}

const SYSTEM = `Ты помогаешь определять, требует ли входящее письмо постановки задачи (требование, просьба, действие, дедлайн от получателя).
Верни JSON: {"isTask": boolean, "confidence": 0..1, "title": string|null, "reason": string}.
title — короткая формулировка задачи (5-10 слов на русском) если isTask=true, иначе null.
isTask=true только если письмо явно содержит запрос на действие/решение/документ от получателя.
Простые ответы, рассылки, автоответы, новости — isTask=false.
reason — одна короткая фраза по-русски, почему такое решение.
Только JSON, без markdown.`;

export type EmailTaskDetection = {
  isTask: boolean;
  confidence: number;
  title: string | null;
  reason: string;
};

export async function detectTaskFromEmail(subject: string, body: string): Promise<EmailTaskDetection> {
  const text = `Subject: ${subject}\n\n${(body || "").slice(0, 2000)}`;
  const r = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    system: SYSTEM,
    messages: [{ role: "user", content: text }],
  });
  const txt = r.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const cleaned = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(cleaned) as EmailTaskDetection;
  } catch {
    return { isTask: false, confidence: 0, title: null, reason: "parse error" };
  }
}

/**
 * After a new incoming email is persisted, optionally ask Claude Haiku
 * whether it looks like a task. If it does (with high enough confidence),
 * send a Telegram message to the configured notify user with inline
 * confirm buttons. The actual task creation happens in task-bot.ts on
 * callback_query handling.
 */
export async function maybeProposeTaskFromEmail(messageId: string): Promise<void> {
  const enabled = await prisma.taskSetting.findUnique({
    where: { key: "ai_email_detect_enabled" },
  });
  if (enabled?.value !== "true") return;
  const target = await prisma.taskSetting.findUnique({
    where: { key: "email_ai_notify_user_id" },
  });
  if (!target?.value) return;
  const m = await prisma.message.findUnique({ where: { id: messageId } });
  if (!m || m.isDraft || m.sentAt) return;
  if (!m.subject && !m.bodyText) return;
  const det = await detectTaskFromEmail(m.subject, m.bodyText || "").catch(() => null);
  if (!det || !det.isTask || det.confidence < 0.6) return;
  const lines = [
    `📧 <b>Письмо похоже на задачу</b> (${Math.round(det.confidence * 100)}%)`,
    `<i>${escapeHtml(det.title || m.subject || "")}</i>`,
    "",
    `от: ${escapeHtml(m.fromAddr)}`,
    `тема: ${escapeHtml(m.subject || "(без темы)")}`,
    "",
    `<i>${escapeHtml(det.reason)}</i>`,
  ];
  await sendTaskBotToUser(target.value, lines.join("\n"), {
    inline_keyboard: [
      [
        { text: "✅ Создать задачу", callback_data: `tcr:${m.id}` },
        { text: "✕ Игнор", callback_data: "tig" },
      ],
    ],
  });
}

const CLOSE_SYSTEM = `Ты помогаешь определить, означает ли новое письмо, что определённая задача выполнена.
Дано: краткое описание задачи и текст нового письма от того же контрагента.
Верни JSON: {"likelyDone": boolean, "confidence": 0..1, "reason": string}.
likelyDone=true только если в письме явно указано, что работа сделана/документ получен/вопрос решён.
"спасибо/жду/уточните" — likelyDone=false.
reason — короткая фраза по-русски.
Только JSON, без markdown.`;

export type AutoCloseDetection = {
  likelyDone: boolean;
  confidence: number;
  reason: string;
};

export async function detectAutoClose(taskTitle: string, taskDescription: string, emailText: string): Promise<AutoCloseDetection> {
  const r = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    system: CLOSE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Задача: ${taskTitle}\nОписание: ${(taskDescription || "").slice(0, 500)}\n\nНовое письмо:\n${(emailText || "").slice(0, 1500)}`,
      },
    ],
  });
  const txt = r.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const cleaned = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(cleaned) as AutoCloseDetection;
  } catch {
    return { likelyDone: false, confidence: 0, reason: "parse error" };
  }
}

/**
 * After every persisted incoming message, look up open tasks whose
 * sourceEmailMessageId points to a Message from the same sender. If
 * Claude Haiku thinks the new email implies the task is done, send
 * a TG card with «Закрыть задачу N?» buttons.
 */
export async function maybeProposeAutoClose(messageId: string): Promise<void> {
  const enabled = await prisma.taskSetting.findUnique({
    where: { key: "ai_autoclose_enabled" },
  });
  if (enabled?.value !== "true") return;
  const target = await prisma.taskSetting.findUnique({
    where: { key: "email_ai_notify_user_id" },
  });
  if (!target?.value) return;
  const m = await prisma.message.findUnique({ where: { id: messageId } });
  if (!m || m.isDraft || m.sentAt) return;
  if (!m.fromAddr) return;
  // Find open tasks linked to a source email from the same sender.
  const candidates = await prisma.task.findMany({
    where: { status: { in: ["open", "in_progress"] }, sourceEmailMessageId: { not: null } },
    take: 50,
  });
  for (const t of candidates) {
    if (!t.sourceEmailMessageId || t.sourceEmailMessageId.startsWith("metr-buyback:")) continue;
    const src = await prisma.message.findUnique({ where: { id: t.sourceEmailMessageId } });
    if (!src || src.fromAddr.toLowerCase() !== m.fromAddr.toLowerCase()) continue;
    const det = await detectAutoClose(
      t.title,
      t.description || "",
      `Subject: ${m.subject}\n\n${m.bodyText || ""}`,
    ).catch(() => null);
    if (!det || !det.likelyDone || det.confidence < 0.7) continue;
    const lines = [
      `🔚 <b>Похоже, задача выполнена</b> (${Math.round(det.confidence * 100)}%)`,
      `<i>${escapeHtml(t.title)}</i>`,
      "",
      `от: ${escapeHtml(m.fromAddr)}`,
      `тема: ${escapeHtml(m.subject || "(без темы)")}`,
      "",
      `<i>${escapeHtml(det.reason)}</i>`,
    ];
    await sendTaskBotToUser(target.value, lines.join("\n"), {
      inline_keyboard: [
        [
          { text: "✅ Закрыть задачу", callback_data: `tcl:${t.id}` },
          { text: "✕ Не закрывать", callback_data: "tig" },
        ],
      ],
    });
    // Only propose for the first matching task per incoming, to avoid spam.
    return;
  }
}
