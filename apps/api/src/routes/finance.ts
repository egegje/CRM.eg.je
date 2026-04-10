import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@crm/db";
import { requireUser, requireRole } from "../auth.js";
import { NotFound } from "../errors.js";

const Params = z.object({ id: z.string() });

export async function financeRoutes(app: FastifyInstance): Promise<void> {
  // ---- companies ----
  app.get("/companies", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const user = req.user!;
    // Owner sees all. Admin sees only companies they have access to
    // (if no access rows exist for them, they see all — backwards compat).
    if (user.role === "owner") {
      return prisma.company.findMany({
        orderBy: { name: "asc" },
        include: { accounts: { orderBy: { bank: "asc" } } },
      });
    }
    // Admin sees only companies with explicit access grant
    const access = await prisma.userCompanyAccess.findMany({
      where: { userId: user.id },
      select: { companyId: true },
    });
    if (access.length === 0) {
      // No access granted — sees nothing
      return [];
    }
    return prisma.company.findMany({
      where: { id: { in: access.map((a) => a.companyId) } },
      orderBy: { name: "asc" },
      include: { accounts: { orderBy: { bank: "asc" } } },
    });
  });

  app.post("/companies", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        inn: z.string().optional(),
        sberCustId: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    return prisma.company.create({ data: body });
  });

  app.patch("/companies/:id", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = z
      .object({
        name: z.string().optional(),
        inn: z.string().nullable().optional(),
        sberCustId: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(req.body);
    return prisma.company.update({ where: { id }, data: body });
  });

  app.delete("/companies/:id", { preHandler: requireRole("owner", "admin") }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.company.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ---- bank accounts ----
  app.post("/bank-accounts", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = z
      .object({
        companyId: z.string(),
        bank: z.string().min(1),
        accountNumber: z.string().min(1),
        currency: z.string().default("RUB"),
        balance: z.coerce.number().default(0),
        notes: z.string().optional(),
      })
      .parse(req.body);
    return prisma.bankAccount.create({ data: body });
  });

  app.patch("/bank-accounts/:id", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = z
      .object({
        bank: z.string().optional(),
        accountNumber: z.string().optional(),
        currency: z.string().optional(),
        balance: z.coerce.number().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(req.body);
    return prisma.bankAccount.update({ where: { id }, data: body });
  });

  app.delete("/bank-accounts/:id", { preHandler: requireRole("owner", "admin") }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.bankAccount.delete({ where: { id } });
    return reply.status(204).send();
  });
}
