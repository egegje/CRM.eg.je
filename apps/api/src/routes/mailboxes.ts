import type { FastifyInstance } from "fastify";
import { prisma } from "@crm/db";
import { requireUser } from "../auth.js";

export async function mailboxRoutes(app: FastifyInstance): Promise<void> {
  app.get("/mailboxes", { preHandler: requireUser() }, async () => {
    return prisma.mailbox.findMany({
      where: { enabled: true },
      select: { id: true, email: true, displayName: true, enabled: true },
      orderBy: { displayName: "asc" },
    });
  });
}
