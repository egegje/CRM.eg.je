import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@crm/db";
import { requireUser } from "../auth.js";
import { audit } from "../services/audit.js";

const TrackBody = z.object({
  messageId: z.string(),
  subject: z.string(),
  toAddrs: z.array(z.string()),
  trackDays: z.number().int().min(1).max(365),
});

export async function trackingRoutes(app: FastifyInstance): Promise<void> {
  app.post("/track-response", { preHandler: requireUser() }, async (req) => {
    const body = TrackBody.parse(req.body);
    const user = req.user!;
    const now = new Date();
    const dueDate = new Date(now.getTime() + body.trackDays * 24 * 60 * 60 * 1000);
    const sentDateStr = now.toLocaleDateString("ru-RU");
    const dueDateStr = dueDate.toLocaleDateString("ru-RU");
    const addrsStr = body.toAddrs.join(", ");

    // Ensure the "отслеживание" tag exists
    let tag = await prisma.taskTag.findUnique({ where: { name: "отслеживание" } });
    if (!tag) {
      tag = await prisma.taskTag.create({
        data: { name: "отслеживание", color: "#f59e0b" },
      });
    }

    // Create tracking task
    const description = [
      `Ожидаем ответ от ${addrsStr} до ${dueDateStr}.`,
      `Отправлено ${sentDateStr}.`,
      ``,
      `---TRACKING_META---`,
      `toAddrs:${JSON.stringify(body.toAddrs)}`,
      `messageId:${body.messageId}`,
    ].join("\n");

    const task = await prisma.task.create({
      data: {
        title: `\u{1F514} Отслеживание: ${body.subject}`,
        description,
        assigneeId: user.id,
        creatorId: user.id,
        dueDate,
        priority: "normal",
        status: "open",
        sourceEmailMessageId: body.messageId,
      },
    });

    // Assign the tracking tag
    await prisma.taskTagAssignment.create({
      data: { taskId: task.id, tagId: tag.id },
    });

    await audit(req, "tracking.create", {
      taskId: task.id,
      messageId: body.messageId,
      toAddrs: body.toAddrs,
      trackDays: body.trackDays,
    });

    return { ok: true, taskId: task.id };
  });
}
