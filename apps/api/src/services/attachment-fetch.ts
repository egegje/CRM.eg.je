import { ImapFlow } from "imapflow";
import { prisma } from "@crm/db";
import { decrypt } from "../crypto.js";

/**
 * Download an attachment from the mail server by IMAP UID + part.
 * Used for lazy-fetching cached-out attachments and for forwards that
 * need the bytes but don't have a local copy.
 */
export async function imapFetchAttachment(
  mailboxId: string,
  imapUid: number,
  imapPart: string | null,
): Promise<Buffer> {
  const m = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!m) throw new Error("mailbox gone");
  const pass = decrypt(m.encryptedAppPassword, m.email);
  const client = new ImapFlow({
    host: m.imapHost,
    port: m.imapPort,
    secure: m.imapPort === 993,
    auth: { user: m.email, pass },
    logger: false,
  });
  await client.connect();
  try {
    await client.mailboxOpen("INBOX");
    if (imapPart) {
      const d = await client.download(String(imapUid), imapPart, { uid: true });
      if (!d || !d.content) throw new Error("part not found");
      const chunks: Buffer[] = [];
      for await (const c of d.content) chunks.push(c as Buffer);
      return Buffer.concat(chunks);
    }
    const { parseRaw } = await import("@crm/mail");
    const full = await client.fetchOne(
      String(imapUid),
      { source: true },
      { uid: true },
    );
    if (!full || !full.source) throw new Error("message not found");
    const parsed = await parseRaw(full.source);
    if (parsed.attachments.length === 0) throw new Error("no attachments in message");
    return parsed.attachments[0].content;
  } finally {
    await client.logout().catch(() => {});
  }
}
