import type { FastifyInstance } from "fastify";
import { prisma } from "@crm/db";
import { requireUser } from "../auth.js";
import { accessibleMailboxIds } from "../services/access.js";

export async function mailboxRoutes(app: FastifyInstance): Promise<void> {
  app.get("/mailboxes", { preHandler: requireUser() }, async (req) => {
    const ids = await accessibleMailboxIds(req.user!);
    return prisma.mailbox.findMany({
      where: { enabled: true, id: { in: ids } },
      select: { id: true, email: true, displayName: true, enabled: true, signature: true },
      orderBy: { displayName: "asc" },
    });
  });
}
