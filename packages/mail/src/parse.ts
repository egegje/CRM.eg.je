import { simpleParser, type ParsedMail, type AddressObject } from "mailparser";

export type Parsed = {
  messageId?: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  text?: string;
  html?: string;
  date?: Date;
  attachments: { filename: string; mime: string; size: number; content: Buffer }[];
};

function flatAddrs(a: AddressObject | AddressObject[] | undefined): string[] {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : [a];
  return arr.flatMap((x) => x.value.map((v) => v.address ?? "").filter(Boolean));
}

export async function parseRaw(raw: Buffer): Promise<Parsed> {
  const m: ParsedMail = await simpleParser(raw);
  return {
    messageId: m.messageId,
    from: m.from?.value[0]?.address ?? "",
    to: flatAddrs(m.to),
    cc: flatAddrs(m.cc),
    subject: m.subject ?? "",
    text: m.text ?? undefined,
    html: typeof m.html === "string" ? m.html : undefined,
    date: m.date,
    attachments: (m.attachments ?? []).map((a) => ({
      filename: a.filename ?? "file",
      mime: a.contentType,
      size: a.size,
      content: a.content,
    })),
  };
}
