import { prisma } from "@crm/db";
import { loadConfig } from "../config.js";

const cfg = loadConfig();

async function tg(method: string, body: unknown): Promise<unknown> {
  if (!cfg.taskBotToken) return null;
  const r = await fetch(`https://api.telegram.org/bot${cfg.taskBotToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendMorningDigest(): Promise<void> {
  const pauseSetting = await prisma.taskSetting.findUnique({ where: { key: "tg_notifications_paused" } });
  if (pauseSetting?.value === "true") return;

  const bindings = await prisma.tgUserBinding.findMany();
  for (const b of bindings) {
    const tasks = await prisma.task.findMany({
      where: { assigneeId: b.userId, status: { in: ["open", "in_progress"] } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      include: { project: true },
      take: 30,
    });
    if (!tasks.length) continue;
    const now = new Date();
    const lines: string[] = ["🌅 <b>Доброе утро! Открытые задачи:</b>", ""];
    for (const t of tasks) {
      const overdue = t.dueDate && t.dueDate < now;
      const due = t.dueDate
        ? ` · ${overdue ? "⏰" : "📅"} ${t.dueDate.toLocaleDateString("ru")}`
        : "";
      const proj = t.project ? ` · 📁 ${escapeHtml(t.project.name)}` : "";
      lines.push(`${overdue ? "🔴 " : "• "}${escapeHtml(t.title)}${due}${proj}`);
    }
    try {
      await tg("sendMessage", {
        chat_id: Number(b.tgUserId),
        text: lines.join("\n"),
        parse_mode: "HTML",
      });
    } catch (e) {
      console.error("digest:", (e as Error).message);
    }
  }
}

let lastFiredHour = -1;
export function startMorningDigestCron(): void {
  setInterval(async () => {
    try {
      const setting = await prisma.taskSetting.findUnique({ where: { key: "digest_hour_msk" } });
      const hour = parseInt(setting?.value || "9", 10);
      const now = new Date();
      const mskHour = (now.getUTCHours() + 3) % 24;
      if (mskHour === hour && lastFiredHour !== hour) {
        lastFiredHour = hour;
        sendMorningDigest().catch((e) => console.error("digest cron:", e));
      } else if (mskHour !== hour) {
        lastFiredHour = -1;
      }
    } catch (e) {
      console.error("digest tick:", (e as Error).message);
    }
  }, 60_000);
}
