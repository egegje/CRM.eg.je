import { prisma } from "@crm/db";
import { loadConfig } from "../config.js";
import { parseTaskFromText } from "../services/tasks-ai.js";
import { notifyAssignment } from "../services/task-tg.js";

const cfg = loadConfig();
let offset = 0;

async function tg(method: string, body: unknown): Promise<unknown> {
  const r = await fetch(`https://api.telegram.org/bot${cfg.taskBotToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

type Update = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; title?: string };
    from: { id: number; username?: string; first_name?: string };
    text?: string;
    entities?: Array<{ type: string; offset: number; length: number }>;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string; first_name?: string };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function handleMessage(msg: NonNullable<Update["message"]>): Promise<void> {
  const text = msg.text || "";
  if (!text) return;
  const isTask =
    /#task\b|#задача\b/i.test(text) ||
    (msg.entities || []).some(
      (e) =>
        e.type === "mention" &&
        text.slice(e.offset, e.offset + e.length).toLowerCase().includes("bot"),
    );
  if (!isTask) return;

  // Verify chat is whitelisted
  const chat = await prisma.tgTaskChat.findUnique({ where: { chatId: BigInt(msg.chat.id) } });
  if (!chat) {
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      reply_to_message_id: msg.message_id,
      text: `Этот чат (id ${msg.chat.id}, "${msg.chat.title || ""}") не зарегистрирован для приёма задач. Админ должен добавить его в crm.eg.je → Админка → TG чаты.`,
    });
    return;
  }

  const cleanText = text.replace(/#task|#задача/gi, "").trim();
  const today = new Date().toISOString().slice(0, 10);

  let parsed;
  try {
    parsed = await parseTaskFromText(cleanText, today);
  } catch (e) {
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      reply_to_message_id: msg.message_id,
      text: "Не смог распарсить: " + (e as Error).message,
    });
    return;
  }

  let assigneeId: string | null = null;
  if (parsed.assigneeUsername) {
    const binding = await prisma.tgUserBinding.findFirst({
      where: { tgUsername: parsed.assigneeUsername.toLowerCase() },
    });
    assigneeId = binding?.userId ?? null;
  }

  let projectId: string | null = null;
  if (parsed.projectHint) {
    const proj = await prisma.project.findFirst({
      where: { name: { contains: parsed.projectHint, mode: "insensitive" } },
    });
    projectId = proj?.id ?? null;
  }

  const creatorBinding = await prisma.tgUserBinding.findUnique({
    where: { tgUserId: BigInt(msg.from.id) },
  });
  const creatorId = creatorBinding?.userId;
  if (!creatorId) {
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      reply_to_message_id: msg.message_id,
      text: `Твой Telegram (@${msg.from.username || msg.from.first_name}, id ${msg.from.id}) не привязан к юзеру в CRM. Админ должен привязать в Админке → TG bindings.`,
    });
    return;
  }

  const task = await prisma.task.create({
    data: {
      title: parsed.title,
      description: parsed.description || cleanText,
      creatorId,
      assigneeId,
      projectId,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      priority: parsed.priority || "normal",
      sourceTgChatId: String(msg.chat.id),
      sourceTgMessageId: msg.message_id,
    },
  });

  notifyAssignment(task.id, creatorId).catch(() => {});

  await tg("setMessageReaction", {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    reaction: [{ type: "emoji", emoji: "👍" }],
  }).catch(() => {});

  const lines = [`✅ <b>${escapeHtml(task.title)}</b>`];
  if (assigneeId) {
    const u = await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } });
    if (u) lines.push(`👤 ${escapeHtml(u.name)}`);
  } else {
    lines.push("⚠️ без исполнителя");
  }
  if (task.dueDate) lines.push(`📅 ${task.dueDate.toLocaleDateString("ru")}`);
  if (projectId && parsed.projectHint) lines.push(`📁 ${escapeHtml(parsed.projectHint)}`);

  await tg("sendMessage", {
    chat_id: msg.chat.id,
    reply_to_message_id: msg.message_id,
    text: lines.join("\n"),
    parse_mode: "HTML",
  });
}

async function handleCallback(cb: NonNullable<Update["callback_query"]>): Promise<void> {
  const data = cb.data || "";
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  async function answer(text: string): Promise<void> {
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text }).catch(() => {});
  }
  async function editText(text: string): Promise<void> {
    if (!chatId || !messageId) return;
    await tg("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
    }).catch(() => {});
  }

  // tcr:<emailMessageId> — confirm "create task from email"
  if (data.startsWith("tcr:")) {
    const emailId = data.slice(4);
    const m = await prisma.message.findUnique({ where: { id: emailId } });
    if (!m) {
      await answer("письмо не найдено");
      return;
    }
    // Find creator binding via the user who clicked
    const creatorBinding = await prisma.tgUserBinding.findUnique({
      where: { tgUserId: BigInt(cb.from.id) },
    });
    if (!creatorBinding) {
      await answer("ваш TG не привязан к юзеру CRM");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const text = `${m.subject || ""}\n${(m.bodyText || "").slice(0, 1000)}`;
    let parsed;
    try {
      parsed = await parseTaskFromText(text, today);
    } catch (e) {
      await answer("ошибка AI: " + (e as Error).message);
      return;
    }
    const task = await prisma.task.create({
      data: {
        title: parsed.title || m.subject || "(без темы)",
        description: parsed.description || (m.bodyText || "").slice(0, 1000),
        creatorId: creatorBinding.userId,
        assigneeId: creatorBinding.userId,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
        priority: parsed.priority || "normal",
        sourceEmailMessageId: m.id,
      },
    });
    notifyAssignment(task.id, null).catch(() => {});
    await editText(`✅ Задача создана: <b>${escapeHtml(task.title)}</b>\nID: <code>${task.id}</code>`);
    await answer("создано");
    return;
  }

  // tcl:<taskId> — confirm "close task"
  if (data.startsWith("tcl:")) {
    const taskId = data.slice(4);
    const t = await prisma.task.findUnique({ where: { id: taskId } });
    if (!t) {
      await answer("задача не найдена");
      return;
    }
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "done", completedAt: new Date() },
    });
    await editText(`✅ Задача закрыта: <b>${escapeHtml(t.title)}</b>`);
    await answer("закрыто");
    return;
  }

  if (data === "tig") {
    await editText("✕ проигнорировано");
    await answer("ок");
    return;
  }

  await answer("неизвестная команда");
}

export async function startTaskBot(): Promise<void> {
  if (!cfg.taskBotToken) {
    console.log("task bot: no token, skipping");
    return;
  }
  console.log("task bot polling started");
  void (async function loop() {
    while (true) {
      try {
        const res = (await tg("getUpdates", {
          offset,
          timeout: 25,
          allowed_updates: ["message", "callback_query"],
        })) as { ok: boolean; result: Update[] };
        if (res?.ok && res.result) {
          for (const u of res.result) {
            offset = u.update_id + 1;
            if (u.message) {
              await handleMessage(u.message).catch((e) =>
                console.error("task bot handle:", (e as Error).message),
              );
            }
            if (u.callback_query) {
              await handleCallback(u.callback_query).catch((e) =>
                console.error("task bot callback:", (e as Error).message),
              );
            }
          }
        }
      } catch (e) {
        console.error("task bot poll:", (e as Error).message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
}
