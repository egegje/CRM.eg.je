import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@crm/db";
import { requireRole } from "../auth.js";
import { hashPassword } from "../auth.js";
import { setKey, encrypt } from "../crypto.js";
import { loadConfig } from "../config.js";
import { NotFound, BadRequest } from "../errors.js";

setKey(loadConfig().encKey);

const Params = z.object({ id: z.string() });

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // ---- users ----
  app.get("/admin/users", { preHandler: requireRole("owner", "admin") }, async () => {
    return prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  });

  const CreateUser = z.object({
    email: z.string().email(),
    password: z.string().min(4),
    name: z.string().min(1),
    role: z.enum(["owner", "admin", "manager"]),
  });
  app.post("/admin/users", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = CreateUser.parse(req.body);
    return prisma.user.create({
      data: { ...body, passwordHash: await hashPassword(body.password) },
      select: { id: true, email: true, name: true, role: true },
    });
  });

  app.delete("/admin/users/:id", { preHandler: requireRole("owner") }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.user.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ---- mailboxes ----
  app.get("/admin/mailboxes", { preHandler: requireRole("owner", "admin") }, async () => {
    return prisma.mailbox.findMany({
      select: { id: true, email: true, displayName: true, enabled: true, imapHost: true, smtpHost: true, createdAt: true },
      orderBy: { displayName: "asc" },
    });
  });

  const CreateMailbox = z.object({
    email: z.string().email(),
    displayName: z.string().min(1),
    appPassword: z.string().min(1),
  });
  app.post("/admin/mailboxes", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = CreateMailbox.parse(req.body);
    const enc = encrypt(body.appPassword, body.email);
    return prisma.mailbox.create({
      data: { email: body.email, displayName: body.displayName, encryptedAppPassword: enc },
      select: { id: true, email: true, displayName: true, enabled: true },
    });
  });

  app.patch("/admin/mailboxes/:id", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = z.object({ enabled: z.boolean().optional(), displayName: z.string().optional() }).parse(req.body);
    return prisma.mailbox.update({
      where: { id },
      data: body,
      select: { id: true, email: true, displayName: true, enabled: true },
    });
  });

  app.delete("/admin/mailboxes/:id", { preHandler: requireRole("owner") }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    const has = await prisma.message.findFirst({ where: { mailboxId: id } });
    if (has) throw new BadRequest("mailbox has messages; disable instead of deleting");
    await prisma.mailbox.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ---- contacts ----
  app.get("/admin/contacts", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const q = z.object({ q: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    return prisma.contact.findMany({
      where: q.q ? { OR: [{ email: { contains: q.q, mode: "insensitive" } }, { name: { contains: q.q, mode: "insensitive" } }] } : undefined,
      orderBy: [{ useCount: "desc" }, { lastUsedAt: "desc" }],
      take: q.limit,
    });
  });

  app.delete("/admin/contacts/:id", { preHandler: requireRole("owner", "admin") }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.contact.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ---- audit log ----
  app.get("/admin/audit", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const q = z.object({
      userId: z.string().optional(),
      action: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }).parse(req.query);
    return prisma.auditLog.findMany({
      where: { userId: q.userId, action: q.action },
      orderBy: { createdAt: "desc" },
      take: q.limit,
    });
  });

  // ---- rules ----
  app.get("/admin/rules", { preHandler: requireRole("owner", "admin") }, async () => {
    return prisma.rule.findMany({ orderBy: { createdAt: "desc" } });
  });

  const CreateRule = z.object({
    triggerType: z.enum(["from", "to", "subject"]),
    contains: z.string().min(1),
    folderId: z.string().min(1),
    enabled: z.boolean().default(true),
  });
  app.post("/admin/rules", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = CreateRule.parse(req.body);
    return prisma.rule.create({ data: body });
  });

  app.patch("/admin/rules/:id", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = z.object({ enabled: z.boolean().optional(), contains: z.string().optional() }).parse(req.body);
    return prisma.rule.update({ where: { id }, data: body });
  });

  app.delete("/admin/rules/:id", { preHandler: requireRole("owner", "admin") }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.rule.delete({ where: { id } });
    return reply.status(204).send();
  });
}
