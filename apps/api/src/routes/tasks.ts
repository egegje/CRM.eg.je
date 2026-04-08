import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { prisma, type Prisma } from "@crm/db";
import { requireUser } from "../auth.js";
import { NotFound, BadRequest } from "../errors.js";
import { loadConfig } from "../config.js";
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
  creatorId: z.string().optional(),
  unassigned: z.coerce.boolean().optional(),
  projectId: z.string().optional(),
  status: z.enum(["open", "in_progress", "done", "cancelled", "all"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  const cfg = loadConfig();
  app.get("/tasks", { preHandler: requireUser() }, async (req) => {
    const q = ListQuery.parse(req.query);
    const where: Prisma.TaskWhereInput = {};
    if (q.assigneeId) where.assigneeId = q.assigneeId;
    if (q.creatorId) where.creatorId = q.creatorId;
    if (q.unassigned) where.assigneeId = null;
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
        attachments: true,
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
        attachments: true,
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

  // ---- team stats ----
  app.get("/tasks/team-stats", { preHandler: requireUser() }, async (req) => {
    const me = req.user!;
    // Visibility: owner sees everyone; admin sees everyone except owners;
    // manager sees only themselves.
    let userWhere: Prisma.UserWhereInput = {};
    if (me.role === "manager") userWhere = { id: me.id };
    else if (me.role === "admin") userWhere = { role: { not: "owner" } };
    const users = await prisma.user.findMany({
      where: userWhere,
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const out = [];
    for (const u of users) {
      const [open, overdue, doneWeek] = await Promise.all([
        prisma.task.count({ where: { assigneeId: u.id, status: { in: ["open", "in_progress"] } } }),
        prisma.task.count({
          where: {
            assigneeId: u.id,
            status: { in: ["open", "in_progress"] },
            dueDate: { lt: now },
          },
        }),
        prisma.task.count({
          where: { assigneeId: u.id, status: "done", completedAt: { gte: weekAgo } },
        }),
      ]);
      out.push({ ...u, open, overdue, doneWeek });
    }
    return out;
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

  // ---- task attachments ----
  app.post("/tasks/:id/attachments", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const t = await prisma.task.findUnique({ where: { id } });
    if (!t) throw new NotFound();
    const file = await req.file();
    if (!file) throw new BadRequest("no file");
    const buf = await file.toBuffer();
    if (buf.length > 25 * 1024 * 1024) throw new BadRequest("file > 25MB");
    const dir = join(cfg.attachmentDir, "tasks", id);
    await mkdir(dir, { recursive: true });
    const safe = file.filename.replace(/[/\\]/g, "_").slice(0, 200);
    const path = join(dir, Date.now() + "_" + safe);
    await writeFile(path, buf);
    return prisma.taskAttachment.create({
      data: {
        taskId: id,
        filename: file.filename,
        mime: file.mimetype,
        size: buf.length,
        storagePath: path,
      },
    });
  });

  app.get("/tasks/attachments/:aid", { preHandler: requireUser() }, async (req, reply) => {
    const { aid } = z.object({ aid: z.string() }).parse(req.params);
    const a = await prisma.taskAttachment.findUnique({ where: { id: aid } });
    if (!a) throw new NotFound();
    reply.header("content-type", a.mime);
    const inline = a.mime === "application/pdf" || a.mime.startsWith("image/");
    reply.header("content-disposition", `${inline ? "inline" : "attachment"}; filename="${a.filename}"`);
    return reply.send(createReadStream(a.storagePath));
  });

  app.delete("/tasks/:id/attachments/:aid", { preHandler: requireUser() }, async (req, reply) => {
    const { aid } = z.object({ id: z.string(), aid: z.string() }).parse(req.params);
    await prisma.taskAttachment.delete({ where: { id: aid } });
    return reply.status(204).send();
  });
}
