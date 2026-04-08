import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, type Prisma } from "@crm/db";
import { requireUser } from "../auth.js";
import { NotFound } from "../errors.js";
import { audit } from "../services/audit.js";
import { notifyAssignment } from "../services/task-tg.js";

const Params = z.object({ id: z.string() });

const Create = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.string().optional(),
  projectId: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  category: z.string().optional(),
  sourceEmailMessageId: z.string().optional(),
});

const Patch = z.object({
  title: z.string().optional(),
  description: z.string().optional().nullable(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  status: z.enum(["open", "in_progress", "done", "cancelled"]).optional(),
  category: z.string().optional().nullable(),
});

const ListQuery = z.object({
  assigneeId: z.string().optional(),
  projectId: z.string().optional(),
  status: z.enum(["open", "in_progress", "done", "cancelled", "all"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.get("/tasks", { preHandler: requireUser() }, async (req) => {
    const q = ListQuery.parse(req.query);
    const where: Prisma.TaskWhereInput = {};
    if (q.assigneeId) where.assigneeId = q.assigneeId;
    if (q.projectId) where.projectId = q.projectId;
    if (q.priority) where.priority = q.priority;
    if (q.status && q.status !== "all") where.status = q.status;
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: "insensitive" } },
        { description: { contains: q.search, mode: "insensitive" } },
      ];
    }
    return prisma.task.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: q.limit,
      include: {
        project: true,
        comments: { orderBy: { createdAt: "asc" } },
        tagAssignments: { include: { tag: true } },
      },
    });
  });

  app.get("/tasks/:id", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const t = await prisma.task.findUnique({
      where: { id },
      include: {
        project: true,
        comments: { orderBy: { createdAt: "asc" } },
        tagAssignments: { include: { tag: true } },
      },
    });
    if (!t) throw new NotFound();
    return t;
  });

  app.post("/tasks", { preHandler: requireUser() }, async (req) => {
    const body = Create.parse(req.body);
    const user = req.user!;
    const t = await prisma.task.create({
      data: { ...body, creatorId: user.id },
    });
    await audit(req, "task.create", { taskId: t.id, title: t.title });
    notifyAssignment(t.id, user.id).catch((e) => console.error("notify:", (e as Error).message));
    return t;
  });

  app.patch("/tasks/:id", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = Patch.parse(req.body);
    const before = await prisma.task.findUnique({ where: { id }, select: { assigneeId: true } });
    const data: Prisma.TaskUpdateInput = { ...body } as Prisma.TaskUpdateInput;
    if (body.status === "done") (data as { completedAt: Date }).completedAt = new Date();
    if (body.status && body.status !== "done") (data as { completedAt: null }).completedAt = null;
    const t = await prisma.task.update({ where: { id }, data });
    await audit(req, "task.update", { taskId: id, changes: body });
    if (body.assigneeId !== undefined && body.assigneeId && body.assigneeId !== before?.assigneeId) {
      notifyAssignment(t.id, req.user!.id).catch((e) => console.error("notify:", (e as Error).message));
    }
    return t;
  });

  app.delete("/tasks/:id", { preHandler: requireUser() }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.task.delete({ where: { id } });
    await audit(req, "task.delete", { taskId: id });
    return reply.status(204).send();
  });

  app.post("/tasks/:id/comments", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = z.object({ text: z.string().min(1) }).parse(req.body);
    const user = req.user!;
    return prisma.taskComment.create({
      data: { taskId: id, userId: user.id, text: body.text },
    });
  });

  // ---- tags ----
  app.get("/tags", { preHandler: requireUser() }, async () => {
    return prisma.taskTag.findMany({ orderBy: { name: "asc" } });
  });
  app.post("/tags", { preHandler: requireUser() }, async (req) => {
    const body = z.object({ name: z.string().min(1), color: z.string().optional() }).parse(req.body);
    return prisma.taskTag.create({ data: { name: body.name, color: body.color || "#6b7280" } });
  });
  app.delete("/tags/:id", { preHandler: requireUser() }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.taskTag.delete({ where: { id } });
    return reply.status(204).send();
  });
  app.post("/tasks/:id/tags", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = z.object({ tagId: z.string() }).parse(req.body);
    return prisma.taskTagAssignment.upsert({
      where: { taskId_tagId: { taskId: id, tagId: body.tagId } },
      create: { taskId: id, tagId: body.tagId },
      update: {},
    });
  });
  app.delete("/tasks/:id/tags/:tagId", { preHandler: requireUser() }, async (req, reply) => {
    const { id, tagId } = z.object({ id: z.string(), tagId: z.string() }).parse(req.params);
    await prisma.taskTagAssignment.delete({
      where: { taskId_tagId: { taskId: id, tagId } },
    });
    return reply.status(204).send();
  });
}
