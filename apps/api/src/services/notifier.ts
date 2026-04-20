import { loadConfig } from "../config.js";
import { summarizeEmail } from "./ai.js";
import { prisma, type Message, type Mailbox } from "@crm/db";

const cfg = loadConfig();

type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

export async function sendTelegram(text: string, replyMarkup?: InlineKeyboard): Promise<{ message_id: number } | null> {
  if (!cfg.telegramBotToken || !cfg.telegramChatId) return null;
  const url = `https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: cfg.telegramChatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`telegram ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { result?: { message_id: number } };
  return json.result ?? null;
}

export async function sendTelegramPhoto(filePath: string, caption?: string): Promise<void> {
  if (!cfg.telegramBotToken || !cfg.telegramChatId) return;
  const { readFile } = await import("node:fs/promises");
  const { basename } = await import("node:path");
  const buf = await readFile(filePath);
  const fd = new FormData();
  fd.append("chat_id", cfg.telegramChatId);
  if (caption) fd.append("caption", caption);
  fd.append("photo", new Blob([buf]), basename(filePath));
  const res = await fetch(`https://api.telegram.org/bot${cfg.telegramBotToken}/sendPhoto`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(`tg sendPhoto ${res.status}`);
}

export async function editTelegramMessage(messageId: number, text: string, replyMarkup?: InlineKeyboard): Promise<void> {
  if (!cfg.telegramBotToken || !cfg.telegramChatId) return;
  await fetch(`https://api.telegram.org/bot${cfg.telegramBotToken}/editMessageText`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: cfg.telegramChatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    }),
  }).catch(() => {});
}

export async function sendTelegramDocument(filePath: string, caption?: string): Promise<void> {
  if (!cfg.telegramBotToken || !cfg.telegramChatId) return;
  const { readFile } = await import("node:fs/promises");
  const { basename } = await import("node:path");
  const buf = await readFile(filePath);
  const fd = new FormData();
  fd.append("chat_id", cfg.telegramChatId);
  if (caption) fd.append("caption", caption);
  fd.append("document", new Blob([buf]), basename(filePath));
  const res = await fetch(`https://api.telegram.org/bot${cfg.telegramBotToken}/sendDocument`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(`tg sendDocument ${res.status}`);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notifyNewMail(message: Message, mailbox: Mailbox): Promise<void> {
  // Check if TG notifications are paused
  const pauseSetting = await prisma.taskSetting.findUnique({ where: { key: "tg_notifications_paused" } });
  if (pauseSetting?.value === "true") return;

  let summary = "";
  let actions: string[] = [];
  try {
    const r = await summarizeEmail({
      from: message.fromAddr,
      subject: message.subject,
      bodyText: message.bodyText,
      bodyHtml: message.bodyHtml,
    });
    summary = r.summary;
    actions = r.actionItems;
    await prisma.message.update({
      where: { id: message.id },
      data: { aiSummary: summary, aiActions: actions, aiPriority: r.priority },
    });
  } catch (e) {
    summary = "(AI-саммари недоступно: " + (e as Error).message + ")";
  }

  // Compact one-block format
  const attachments = await prisma.attachment.findMany({
    where: { messageId: message.id },
    select: { id: true, filename: true, mime: true, storagePath: true },
  });
  const imgCount = attachments.filter((a) => /^image\//.test(a.mime)).length;
  const otherCount = attachments.length - imgCount;
  const attachLine = attachments.length
    ? `📎 ${attachments.length}${imgCount ? ` (${imgCount} 🖼)` : ""}`
    : "";

  const subj = message.subject || "(без темы)";
  const lines = [
    `<b>${esc(mailbox.displayName)}</b> · <code>${esc(message.fromAddr)}</code>${attachLine ? "  " + attachLine : ""}`,
    `<b>${esc(subj)}</b>`,
  ];
  if (summary) lines.push("", esc(summary));
  if (actions.length) {
    lines.push("", actions.map((a) => "• " + esc(a)).join("\n"));
  }
  const sent = await sendTelegram(lines.join("\n"), {
    inline_keyboard: [[
      { text: "✓", callback_data: `read:${message.id}` },
      { text: "⭐", callback_data: `star:${message.id}` },
      { text: "🗑", callback_data: `del:${message.id}` },
      { text: "🤖", callback_data: `aireply:${message.id}` },
      { text: "✏️", callback_data: `reply:${message.id}` },
    ]],
  });

  // Track tg message → email mapping so user can reply via Telegram quote-reply
  if (sent?.message_id) {
    await prisma.tgNotify
      .create({ data: { messageId: message.id, tgMessageId: sent.message_id } })
      .catch(() => {});
  }

  // Forward image attachments only if 1-3 (avoid flooding); skip if many
  if (imgCount > 0 && imgCount <= 3) {
    for (const a of attachments) {
      if (!/^image\//.test(a.mime)) continue;
      if (!a.storagePath) continue;
      try {
        await sendTelegramPhoto(a.storagePath, a.filename);
      } catch (e) {
        console.error("tg attachment forward failed:", (e as Error).message);
      }
    }
  }
}
