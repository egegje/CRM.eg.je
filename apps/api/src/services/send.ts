import { sendMail, appendToSent } from "@crm/mail";
import type { Mailbox } from "@crm/db";

export type SendCtx = {
  mailbox: Mailbox;
  decrypt: (b: Buffer) => string;
};

export type SendPayload = {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
  signatureOverride?: string;
};

export async function sendMessage(ctx: SendCtx, p: SendPayload): Promise<{ messageId: string }> {
  const pass = ctx.decrypt(ctx.mailbox.encryptedAppPassword);
  // Per-user signature wins over mailbox-level signature.
  const sig = p.signatureOverride ?? ctx.mailbox.signature ?? null;
  if (sig && p.text) {
    p = { ...p, text: p.text + "\n\n--\n" + sig };
  }
  const result = await sendMail({
    host: ctx.mailbox.smtpHost,
    port: ctx.mailbox.smtpPort,
    user: ctx.mailbox.email,
    pass,
    from: p.from,
    to: p.to,
    cc: p.cc,
    subject: p.subject,
    text: p.text,
    html: p.html,
    attachments: p.attachments,
  });

  // Append to remote Sent folder (best-effort).
  try {
    const headers = [
      `From: ${p.from}`,
      `To: ${p.to.join(", ")}`,
      ...(p.cc && p.cc.length ? [`Cc: ${p.cc.join(", ")}`] : []),
      `Subject: ${p.subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      p.text ?? "",
    ];
    const rfc822 = Buffer.from(headers.join("\r\n"));
    await appendToSent(
      {
        host: ctx.mailbox.imapHost,
        port: ctx.mailbox.imapPort,
        user: ctx.mailbox.email,
        pass,
      },
      rfc822,
    );
  } catch {
    /* swallow — local Sent record is authoritative */
  }

  return { messageId: result.messageId };
}
