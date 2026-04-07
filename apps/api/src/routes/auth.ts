import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@crm/db";
import { verifyPassword, currentUser } from "../auth.js";

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (req, reply) => {
    const body = LoginBody.parse(req.body);
    const u = await prisma.user.findUnique({ where: { email: body.email } });
    if (!u || !(await verifyPassword(u.passwordHash, body.password))) {
      return reply.status(401).send({ error: "invalid credentials" });
    }
    req.session.set("uid", u.id);
    await prisma.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
    return { id: u.id, email: u.email, name: u.name, role: u.role };
  });

  app.post("/auth/logout", async (req) => {
    req.session.delete();
    return { ok: true };
  });

  app.get("/me", async (req, reply) => {
    const u = await currentUser(req);
    if (!u) return reply.status(401).send({ error: "not authenticated" });
    return { id: u.id, email: u.email, name: u.name, role: u.role };
  });
}
