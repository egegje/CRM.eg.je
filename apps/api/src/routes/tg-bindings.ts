import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@crm/db";
import { requireRole } from "../auth.js";

export async function tgBindingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/tg-chats", { preHandler: requireRole("owner", "admin") }, async () => {
    const rows = await prisma.tgTaskChat.findMany({ orderBy: { addedAt: "desc" } });
    return rows.map((r) => ({ ...r, chatId: r.chatId.toString() }));
  });

  app.post("/admin/tg-chats", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = z.object({ chatId: z.string(), name: z.string() }).parse(req.body);
    const r = await prisma.tgTaskChat.upsert({
      where: { chatId: BigInt(body.chatId) },
      create: { chatId: BigInt(body.chatId), name: body.name },
      update: { name: body.name },
    });
    return { ...r, chatId: r.chatId.toString() };
  });

  app.delete(
    "/admin/tg-chats/:chatId",
    { preHandler: requireRole("owner", "admin") },
    async (req, reply) => {
      const { chatId } = z.object({ chatId: z.string() }).parse(req.params);
      await prisma.tgTaskChat.delete({ where: { chatId: BigInt(chatId) } });
      return reply.status(204).send();
    },
  );

  app.get("/admin/tg-bindings", { preHandler: requireRole("owner", "admin") }, async () => {
    const rows = await prisma.tgUserBinding.findMany();
    return rows.map((r) => ({ ...r, tgUserId: r.tgUserId.toString() }));
  });

  app.post("/admin/tg-bindings", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = z
      .object({
        userId: z.string(),
        tgUserId: z.string(),
        tgUsername: z.string().optional(),
      })
      .parse(req.body);
    const r = await prisma.tgUserBinding.upsert({
      where: { userId: body.userId },
      create: {
        userId: body.userId,
        tgUserId: BigInt(body.tgUserId),
        tgUsername: body.tgUsername?.toLowerCase(),
      },
      update: {
        tgUserId: BigInt(body.tgUserId),
        tgUsername: body.tgUsername?.toLowerCase(),
      },
    });
    return { ...r, tgUserId: r.tgUserId.toString() };
  });

  app.delete(
    "/admin/tg-bindings/:userId",
    { preHandler: requireRole("owner", "admin") },
    async (req, reply) => {
      const { userId } = z.object({ userId: z.string() }).parse(req.params);
      await prisma.tgUserBinding.delete({ where: { userId } });
      return reply.status(204).send();
    },
  );
}
