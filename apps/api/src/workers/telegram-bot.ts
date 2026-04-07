import { prisma } from "@crm/db";
import { loadConfig } from "../config.js";
import { generateReply } from "../services/ai.js";
import { sendTelegram } from "../services/notifier.js";
import { sendMessage } from "../services/send.js";
import { setKey, decrypt } from "../crypto.js";

const cfg = loadConfig();
setKey(cfg.encKey);
let offset = 0;
const pendingReply = new Map<number, string>(); // userId → emailMessageId

async function tg(method: string, body: unknown): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${cfg.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function answerCallback(id: string, text: string): Promise<void> {
  await tg("answerCallbackQuery", { callback_query_id: id, text }).catch(() => {});
}

type Update = {
  update_id: number;
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
  message?: {
    message_id: number;
    from: { id: number };
    chat: { id: number };
    text?: string;
    reply_to_message?: { message_id: number };
  };
};

async function sendEmailReply(emailId: string, replyText: string): Promise<void> {
  const m = await prisma.message.findUnique({ where: { id: emailId }, include: { mailbox: true } });
  if (!m) throw new Error("email not found");
  await sendMessage(
    { mailbox: m.mailbox, decrypt: (b) => decrypt(b, m.mailbox.email) },
    {
      from: m.mailbox.email,
      to: [m.fromAddr],
      subject: m.subject.startsWith("Re:") ? m.subject : "Re: " + m.subject,
      text: replyText,
    },
  );
}

async function handleCallback(cb: NonNullable<Update["callback_query"]>): Promise<void> {
  const data = cb.data ?? "";
  const [action, id] = data.split(":");
  if (!id) return answerCallback(cb.id, "?");
  try {
    if (action === "read") {
      await prisma.message.update({ where: { id }, data: { isRead: true } });
      await answerCallback(cb.id, "помечено прочитанным");
    } else if (action === "star") {
      await prisma.message.update({ where: { id }, data: { isStarred: true } });
      await answerCallback(cb.id, "помечено важным");
    } else if (action === "del") {
      const m = await prisma.message.findUnique({ where: { id } });
      if (m) {
        const trash =
          (await prisma.folder.findFirst({ where: { mailboxId: m.mailboxId, kind: "trash" } })) ??
          (await prisma.folder.create({ data: { mailboxId: m.mailboxId, name: "Trash", kind: "trash" } }));
        await prisma.message.update({
          where: { id },
          data: { deletedAt: new Date(), folderId: trash.id },
        });
      }
      await answerCallback(cb.id, "в корзине");
    } else if (action === "aireply") {
      await answerCallback(cb.id, "генерирую...");
      const m = await prisma.message.findUnique({ where: { id }, include: { mailbox: true } });
      if (!m) return;
      const text = await generateReply({ from: m.fromAddr, subject: m.subject, bodyText: m.bodyText });
      // Don't auto-save to drafts. User can edit and confirm via reply mode.
      pendingReply.set(cb.from.id, id);
      await sendTelegram(
        `🤖 Сгенерированный ответ на «${m.subject}»:\n\n${text}\n\n— ответь на это сообщение своим текстом чтобы отправить (или с правками), либо «отправить как есть» чтобы отправить этот вариант. /cancel чтобы отменить.`,
      );
    } else if (action === "reply") {
      pendingReply.set(cb.from.id, id);
      await answerCallback(cb.id, "напиши ответ следующим сообщением");
      await sendTelegram(`✏️ Жду текст ответа на «${id}». Просто пришли следующим сообщением. /cancel чтобы отменить.`);
    } else {
      await answerCallback(cb.id, "неизвестное действие");
    }
  } catch (e) {
    await answerCallback(cb.id, "ошибка: " + (e as Error).message);
  }
}

async function handleMessage(msg: NonNullable<Update["message"]>): Promise<void> {
  const text = (msg.text || "").trim();
  if (!text) return;
  if (text === "/cancel") {
    pendingReply.delete(msg.from.id);
    await sendTelegram("отменено");
    return;
  }

  // Resolve which email this is replying to.
  let emailId: string | undefined;
  if (msg.reply_to_message) {
    const link = await prisma.tgNotify.findFirst({
      where: { tgMessageId: msg.reply_to_message.message_id },
      orderBy: { createdAt: "desc" },
    });
    if (link) emailId = link.messageId;
  }
  if (!emailId) emailId = pendingReply.get(msg.from.id);
  if (!emailId) return; // not in reply context — ignore

  try {
    await sendEmailReply(emailId, text);
    pendingReply.delete(msg.from.id);
    await sendTelegram("✅ ответ отправлен");
  } catch (e) {
    await sendTelegram("❌ ошибка отправки: " + (e as Error).message);
  }
}

export async function startTelegramBot(): Promise<void> {
  if (!cfg.telegramBotToken) return;
  console.log("telegram bot polling started");
  void (async function loop() {
    while (true) {
      try {
        const res = (await tg("getUpdates", { offset, timeout: 25, allowed_updates: ["callback_query", "message"] })) as {
          ok: boolean;
          result: Update[];
        };
        if (res?.ok && res.result) {
          for (const u of res.result) {
            offset = u.update_id + 1;
            if (u.callback_query) await handleCallback(u.callback_query);
            if (u.message) await handleMessage(u.message);
          }
        }
      } catch (e) {
        console.error("tg poll error:", (e as Error).message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
}
