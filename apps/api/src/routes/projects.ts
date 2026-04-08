import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@crm/db";
import { requireUser, requireRole } from "../auth.js";
import { syncProjectsFromMetr } from "../services/metr-sync.js";

const Params = z.object({ id: z.string() });

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get("/projects", { preHandler: requireUser() }, async () =>
    prisma.project.findMany({ orderBy: { name: "asc" } }),
  );

  app.post("/projects", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = z.object({ name: z.string().min(1), notes: z.string().optional() }).parse(req.body);
    return prisma.project.create({
      data: { name: body.name, source: "manual", notes: body.notes },
    });
  });

  app.delete(
    "/projects/:id",
    { preHandler: requireRole("owner", "admin") },
    async (req, reply) => {
      const { id } = Params.parse(req.params);
      await prisma.project.delete({ where: { id } });
      return reply.status(204).send();
    },
  );

  app.post("/projects/sync-metr", { preHandler: requireRole("owner", "admin") }, async () => {
    return syncProjectsFromMetr();
  });
}
