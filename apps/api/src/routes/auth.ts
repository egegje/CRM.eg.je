import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@crm/db";
import { verifyPassword, currentUser, hashPassword, requireUser } from "../auth.js";
import { audit } from "../services/audit.js";

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (req, reply) => {
    const body = LoginBody.parse(req.body);
    const u = await prisma.user.findUnique({ where: { email: body.email } });
    if (!u || !(await verifyPassword(u.passwordHash, body.password))) {
      await audit(null, "auth.login_failed", { email: body.email, ip: req.ip });
      return reply.status(401).send({ error: "invalid credentials" });
    }
    req.session.set("uid", u.id);
    await prisma.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
    (req as unknown as { user: typeof u }).user = u;
    await audit(req, "auth.login", { email: u.email });
    return { id: u.id, email: u.email, name: u.name, role: u.role };
  });

  app.post("/auth/logout", async (req) => {
    await audit(req, "auth.logout");
    req.session.delete();
    return { ok: true };
  });

  app.post("/me/password", { preHandler: requireUser() }, async (req, reply) => {
    const body = z.object({ oldPassword: z.string().min(1), newPassword: z.string().min(4) }).parse(req.body);
    const u = req.user!;
    if (!(await verifyPassword(u.passwordHash, body.oldPassword))) {
      return reply.status(400).send({ error: "wrong old password" });
    }
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
    await audit(req, "user.password_change");
    return { ok: true };
  });

  app.get("/me", async (req, reply) => {
    const u = await currentUser(req);
    if (!u) return reply.status(401).send({ error: "not authenticated" });
    return { id: u.id, email: u.email, name: u.name, role: u.role };
  });
}
