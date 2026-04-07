import nodemailer from "nodemailer";

export type SendInput = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

export type SendResult = { messageId: string };

export async function sendMail(i: SendInput): Promise<SendResult> {
  const t = nodemailer.createTransport({
    host: i.host,
    port: i.port,
    secure: i.port === 465,
    auth: { user: i.user, pass: i.pass },
  });
  const info = await t.sendMail({
    from: i.from,
    to: i.to,
    cc: i.cc,
    subject: i.subject,
    text: i.text,
    html: i.html,
    attachments: i.attachments,
  });
  return { messageId: info.messageId };
}
