import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../config.js";

const cfg = loadConfig();
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  if (cfg.anthropicApiKey) {
    client = new Anthropic({ apiKey: cfg.anthropicApiKey });
  } else if (cfg.anthropicAuthToken) {
    client = new Anthropic({ authToken: cfg.anthropicAuthToken });
  } else {
    throw new Error("no anthropic key");
  }
  return client;
}

export type ParsedTask = {
  title: string;
  description?: string;
  assigneeUsername?: string;
  dueDate?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  projectHint?: string;
};

const SYSTEM = `Ты разбираешь сообщения из рабочего чата на задачи. Дано сообщение и текущая дата.
Верни JSON: {"title", "description", "assigneeUsername" (без @), "dueDate" (ISO YYYY-MM-DD или null), "priority" (low/normal/high/urgent), "projectHint" (если упомянут объект)}.
Если не хватает данных — оставляй поля null. Title должен быть кратким (5-10 слов). Только JSON, без markdown.`;

export async function parseTaskFromText(text: string, todayIso: string): Promise<ParsedTask> {
  const r = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 500,
    system: SYSTEM,
    messages: [{ role: "user", content: `Сегодня ${todayIso}. Сообщение:\n${text}` }],
  });
  const txt = r.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const cleaned = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(cleaned) as ParsedTask;
  } catch {
    return { title: text.slice(0, 80) };
  }
}
