import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { prisma } from "@crm/db";
import { verifyPassword, currentUser, hashPassword, requireUser } from "../auth.js";
import { audit } from "../services/audit.js";

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (req, reply) => {
    const body = LoginBody.parse(req.body);
    const u = await prisma.user.findUnique({ where: { email: body.email } });
    if (!u || !(await verifyPassword(u.passwordHash, body.password))) {
      await audit(null, "auth.login_failed", { email: body.email, ip: req.ip });
      return reply.status(401).send({ error: "invalid credentials" });
    }
    // 2FA gate: if the user enrolled, require a current TOTP code. The
    // client sends a 401 with totpRequired=true on the first round-trip
    // and re-submits with the code.
    if (u.totpEnabled && u.totpSecret) {
      if (!body.totpCode) {
        return reply.status(401).send({ error: "totp_required", totpRequired: true });
      }
      const ok = authenticator.check(body.totpCode.replace(/\s+/g, ""), u.totpSecret);
      if (!ok) {
        await audit(null, "auth.login_failed", { email: body.email, ip: req.ip, reason: "totp_wrong" });
        return reply.status(401).send({ error: "totp_invalid", totpRequired: true });
      }
    }
    req.session.set("uid", u.id);
    await prisma.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
    (req as unknown as { user: typeof u }).user = u;
    await audit(req, "auth.login", { email: u.email });
    return { id: u.id, email: u.email, name: u.name, role: u.role };
  });

  // 2FA enrollment: generates a secret, returns otpauth URL + QR data URL.
  // The secret is stored on the user row but totpEnabled stays false until
  // the user successfully verifies a code via /me/totp/enable.
  app.post("/me/totp/setup", { preHandler: requireUser() }, async (req) => {
    const u = req.user!;
    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: u.id }, data: { totpSecret: secret, totpEnabled: false } });
    const otpauth = authenticator.keyuri(u.email, "CRM eg.je", secret);
    const qr = await QRCode.toDataURL(otpauth);
    return { secret, otpauth, qr };
  });

  app.post("/me/totp/enable", { preHandler: requireUser() }, async (req, reply) => {
    const body = z.object({ code: z.string().min(1) }).parse(req.body);
    const u = req.user!;
    if (!u.totpSecret) return reply.status(400).send({ error: "no_secret" });
    const ok = authenticator.check(body.code.replace(/\s+/g, ""), u.totpSecret);
    if (!ok) return reply.status(400).send({ error: "code_invalid" });
    await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: true } });
    await audit(req, "totp.enable");
    return { ok: true };
  });

  app.post("/me/totp/disable", { preHandler: requireUser() }, async (req, reply) => {
    const body = z.object({ code: z.string().optional(), password: z.string().optional() }).parse(req.body);
    const u = req.user!;
    if (!u.totpEnabled) return { ok: true };
    // Require either a current TOTP code or the account password — same
    // bar that gates login.
    let allowed = false;
    if (body.code && u.totpSecret) {
      allowed = authenticator.check(body.code.replace(/\s+/g, ""), u.totpSecret);
    }
    if (!allowed && body.password) {
      allowed = await verifyPassword(u.passwordHash, body.password);
    }
    if (!allowed) return reply.status(400).send({ error: "auth_required" });
    await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: false, totpSecret: null } });
    await audit(req, "totp.disable");
    return { ok: true };
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
    return { id: u.id, email: u.email, name: u.name, role: u.role, totpEnabled: u.totpEnabled };
  });
}
