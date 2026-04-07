import { loadConfig } from "../config.js";
import { summarizeEmail } from "./ai.js";
import { prisma, type Message, type Mailbox } from "@crm/db";

const cfg = loadConfig();

type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

export async function sendTelegram(text: string, replyMarkup?: InlineKeyboard): Promise<void> {
  if (!cfg.telegramBotToken || !cfg.telegramChatId) return;
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
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notifyNewMail(message: Message, mailbox: Mailbox): Promise<void> {
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
      data: { aiSummary: summary, aiActions: actions },
    });
  } catch (e) {
    summary = "(AI-саммари недоступно: " + (e as Error).message + ")";
  }

  const lines = [
    `📨 <b>${esc(mailbox.displayName)}</b> · ${esc(mailbox.email)}`,
    `<b>От:</b> ${esc(message.fromAddr)}`,
    `<b>Тема:</b> ${esc(message.subject || "(без темы)")}`,
    "",
    `<i>${esc(summary)}</i>`,
  ];
  if (actions.length) {
    lines.push("", "<b>Что сделать:</b>");
    for (const a of actions) lines.push(`• ${esc(a)}`);
  }
  await sendTelegram(lines.join("\n"), {
    inline_keyboard: [[
      { text: "✓ прочитано", callback_data: `read:${message.id}` },
      { text: "⭐ важное", callback_data: `star:${message.id}` },
      { text: "🗑 удалить", callback_data: `del:${message.id}` },
    ]],
  });
}
