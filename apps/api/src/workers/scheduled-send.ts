import { prisma } from "@crm/db";
import { sendMessage } from "../services/send.js";
import { prepareSendPayload } from "../services/send-prepare.js";
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
      const { ctx, payload: sendPayload } = await prepareSendPayload(m);
      const r = await sendMessage(ctx, sendPayload);
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
