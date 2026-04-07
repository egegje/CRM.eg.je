import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@crm/db";
import { requireUser } from "../auth.js";
import { NotFound, BadRequest } from "../errors.js";
import { accessibleMailboxIds } from "../services/access.js";

const Create = z.object({
  name: z.string().min(1).max(80),
  mailboxId: z.string().optional(),
});
const Patch = z.object({ name: z.string().min(1).max(80) });
const Params = z.object({ id: z.string() });

export async function folderRoutes(app: FastifyInstance): Promise<void> {
  app.get("/folders", { preHandler: requireUser() }, async (req) => {
    const user = req.user!;
    const ids = await accessibleMailboxIds(user);
    const mailboxFilter = ids ? { mailboxId: { in: ids } } : { mailboxId: { not: null } };
    return prisma.folder.findMany({
      where: { OR: [{ ownerId: user.id }, mailboxFilter] },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
  });

  app.post("/folders", { preHandler: requireUser() }, async (req) => {
    const body = Create.parse(req.body);
    const user = req.user!;
    return prisma.folder.create({
      data: {
        name: body.name,
        kind: "custom",
        ownerId: user.id,
        mailboxId: body.mailboxId ?? null,
      },
    });
  });

  app.patch("/folders/:id", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = Patch.parse(req.body);
    const f = await prisma.folder.findUnique({ where: { id } });
    if (!f || f.kind !== "custom") throw new NotFound("folder not found");
    return prisma.folder.update({ where: { id }, data: { name: body.name } });
  });

  app.delete("/folders/:id", { preHandler: requireUser() }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    const f = await prisma.folder.findUnique({
      where: { id },
      include: { messages: { take: 1 } },
    });
    if (!f || f.kind !== "custom") throw new NotFound("folder not found");
    if (f.messages.length) throw new BadRequest("folder not empty");
    await prisma.folder.delete({ where: { id } });
    return reply.status(204).send();
  });
}
