import { prisma } from "@crm/db";
import { loadConfig } from "../config.js";
import { generateReply } from "../services/ai.js";
import { sendTelegram } from "../services/notifier.js";

const cfg = loadConfig();
let offset = 0;

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
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
};

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
      await answerCallback(cb.id, "генерирую черновик...");
      const m = await prisma.message.findUnique({ where: { id }, include: { mailbox: true } });
      if (!m) return;
      const text = await generateReply({ from: m.fromAddr, subject: m.subject, bodyText: m.bodyText });
      const drafts =
        (await prisma.folder.findFirst({ where: { mailboxId: m.mailboxId, kind: "drafts" } })) ??
        (await prisma.folder.create({ data: { mailboxId: m.mailboxId, name: "Drafts", kind: "drafts" } }));
      await prisma.message.create({
        data: {
          mailboxId: m.mailboxId,
          folderId: drafts.id,
          isDraft: true,
          fromAddr: m.mailbox.email,
          toAddrs: [m.fromAddr],
          ccAddrs: [],
          subject: m.subject.startsWith("Re:") ? m.subject : "Re: " + m.subject,
          bodyText: text,
        },
      });
      await sendTelegram(`📝 Черновик ответа на «${m.subject}»:\n\n${text}\n\n— сохранён в папку Drafts ящика ${m.mailbox.email}`);
    } else {
      await answerCallback(cb.id, "неизвестное действие");
    }
  } catch (e) {
    await answerCallback(cb.id, "ошибка: " + (e as Error).message);
  }
}

export async function startTelegramBot(): Promise<void> {
  if (!cfg.telegramBotToken) return;
  console.log("telegram bot polling started");
  // Long-poll loop
  void (async function loop() {
    while (true) {
      try {
        const res = (await tg("getUpdates", { offset, timeout: 25, allowed_updates: ["callback_query"] })) as {
          ok: boolean;
          result: Update[];
        };
        if (res?.ok && res.result) {
          for (const u of res.result) {
            offset = u.update_id + 1;
            if (u.callback_query) await handleCallback(u.callback_query);
          }
        }
      } catch (e) {
        console.error("tg poll error:", (e as Error).message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
}
