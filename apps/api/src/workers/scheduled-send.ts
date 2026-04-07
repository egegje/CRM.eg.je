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
      const r = await sendMessage(
        { mailbox: m.mailbox, decrypt: (b) => decrypt(b, m.mailbox.email) },
        {
          from: m.mailbox.email,
          to: m.toAddrs,
          cc: m.ccAddrs,
          subject: m.subject,
          text: m.bodyText ?? "",
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
