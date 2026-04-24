import { readFile } from "node:fs/promises";
import { prisma } from "@crm/db";
import { sendMessage } from "../services/send.js";
import { decrypt } from "../crypto.js";
import { makeSendWorker } from "../queue.js";

export function startScheduledSendWorker() {
  return makeSendWorker(async (job) => {
    const { scheduledId } = job.data as { scheduledId: string };
    const sched = await prisma.scheduledSend.findUnique({ where: { id: scheduledId } });
    if (!sched || sched.status !== "pending") return;
    const payload = sched.payload as { messageId: string };
    const m = await prisma.message.findUnique({
      where: { id: payload.messageId },
      include: { mailbox: true },
    });
    if (!m) return;
    try {
      let signatureOverride: string | undefined;
      if (m.personaId) {
        const p = await prisma.persona.findUnique({
          where: { id: m.personaId },
          select: { signature: true },
        });
        signatureOverride = p?.signature ?? undefined;
      }
      const dbAttachments = await prisma.attachment.findMany({ where: { messageId: m.id } });
      const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
      for (const att of dbAttachments) {
        if (!att.storagePath) {
          console.error(
            `[scheduled-send] attachment ${att.id} (${att.filename}) on message ${m.id} has no storagePath — skipping`,
          );
          continue;
        }
        try {
          const buf = await readFile(att.storagePath);
          attachments.push({ filename: att.filename, content: buf, contentType: att.mime });
        } catch (e) {
          console.error(
            `[scheduled-send] failed to read attachment ${att.id} at ${att.storagePath}:`,
            e,
          );
          throw new Error(`attachment ${att.filename} missing on disk`);
        }
      }
      const r = await sendMessage(
        { mailbox: m.mailbox, decrypt: (b) => decrypt(b, m.mailbox.email) },
        {
          from: m.mailbox.email,
          to: m.toAddrs,
          cc: m.ccAddrs,
          subject: m.subject,
          text: m.bodyText ?? "",
          html: m.bodyHtml ?? undefined,
          attachments: attachments.length ? attachments : undefined,
          signatureOverride,
        },
      );
      const sent =
        (await prisma.folder.findFirst({ where: { mailboxId: m.mailboxId, kind: "sent" } })) ??
        (await prisma.folder.create({
          data: { mailboxId: m.mailboxId, name: "Sent", kind: "sent" },
        }));
      await prisma.$transaction([
        prisma.message.update({
          where: { id: m.id },
          data: {
            isDraft: false,
            isRead: true,
            sentAt: new Date(),
            folderId: sent.id,
            messageId: r.messageId,
            fromAddr: m.mailbox.email,
          },
        }),
        prisma.scheduledSend.update({
          where: { id: sched.id },
          data: { status: "sent" },
        }),
      ]);
    } catch (e) {
      await prisma.scheduledSend.update({
        where: { id: sched.id },
        data: { status: "failed" },
      });
      throw e;
    }
  });
}
