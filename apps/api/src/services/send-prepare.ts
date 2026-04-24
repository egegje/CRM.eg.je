import { readFile } from "node:fs/promises";
import { prisma, type Message, type Mailbox } from "@crm/db";
import { decrypt } from "../crypto.js";
import type { SendCtx, SendPayload } from "./send.js";

export type DraftForSend = Message & { mailbox: Mailbox };

/**
 * Build everything sendMessage needs from a stored draft row: SMTP
 * credentials, recipients, subject/body, per-persona signature, and
 * attachment buffers read from disk. Used by both the /messages/:id/send
 * route (immediate send) and the scheduled-send worker (the delayed
 * "Undo send" path) so they can't drift.
 *
 * Throws if any attachment file is missing on disk — sending a message
 * with attachments silently dropped is worse than failing loudly.
 */
export async function prepareSendPayload(
  draft: DraftForSend,
): Promise<{ ctx: SendCtx; payload: SendPayload }> {
  let signatureOverride: string | undefined;
  if (draft.personaId) {
    const p = await prisma.persona.findUnique({
      where: { id: draft.personaId },
      select: { signature: true },
    });
    signatureOverride = p?.signature ?? undefined;
  }

  const dbAttachments = await prisma.attachment.findMany({
    where: { messageId: draft.id },
  });
  const attachments: SendPayload["attachments"] = [];
  for (const att of dbAttachments) {
    if (!att.storagePath) {
      throw new Error(
        `attachment ${att.id} (${att.filename}) missing storagePath`,
      );
    }
    const content = await readFile(att.storagePath);
    attachments.push({
      filename: att.filename,
      content,
      contentType: att.mime,
    });
  }

  return {
    ctx: {
      mailbox: draft.mailbox,
      decrypt: (b) => decrypt(b, draft.mailbox.email),
    },
    payload: {
      from: draft.mailbox.email,
      to: draft.toAddrs,
      cc: draft.ccAddrs,
      subject: draft.subject ?? "",
      text: draft.bodyText ?? "",
      html: draft.bodyHtml ?? undefined,
      attachments: attachments.length ? attachments : undefined,
      signatureOverride,
    },
  };
}
