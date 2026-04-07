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
    throw new Error("no ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN configured");
  }
  return client;
}

export type EmailSummary = {
  summary: string;
  actionItems: string[];
};

const SYSTEM = `Ты — помощник менеджера по аренде недвижимости. Тебе дают входящее письмо. Верни JSON с двумя полями:
- "summary": суть письма в 1-2 коротких предложениях на русском
- "actionItems": массив строк (действия, которые нужно сделать получателю; пустой массив если действий нет)
Только JSON, без markdown-обёртки.`;

export async function summarizeEmail(input: {
  from: string;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
}): Promise<EmailSummary> {
  const body = (input.bodyText ?? stripHtml(input.bodyHtml ?? "")).slice(0, 8000);
  const userMsg = `От: ${input.from}\nТема: ${input.subject}\n\n${body}`;

  const response = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 600,
    system: SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as EmailSummary;
    return {
      summary: String(parsed.summary ?? "").slice(0, 500),
      actionItems: Array.isArray(parsed.actionItems)
        ? parsed.actionItems.slice(0, 10).map((s) => String(s).slice(0, 300))
        : [],
    };
  } catch {
    return { summary: text.slice(0, 500), actionItems: [] };
  }
}

const REPLY_SYSTEM = `Ты — помощник менеджера по аренде недвижимости. Тебе дают входящее письмо. Сгенерируй короткий вежливый ответ на русском от лица менеджера. Только текст ответа, без markdown, без приветствия "Здравствуйте, [имя]" — сразу по делу.`;

export async function generateReply(input: {
  from: string;
  subject: string;
  bodyText?: string | null;
}): Promise<string> {
  const body = (input.bodyText ?? "").slice(0, 6000);
  const userMsg = `От: ${input.from}\nТема: ${input.subject}\n\n${body}`;
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 800,
    system: REPLY_SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
