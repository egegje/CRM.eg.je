import argon2 from "argon2";
import type { FastifyRequest } from "fastify";
import { Forbidden } from "./errors.js";
import { prisma, type Role, type User } from "@crm/db";

export async function hashPassword(p: string): Promise<string> {
  return argon2.hash(p, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, p: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, p);
  } catch {
    return false;
  }
}

export async function currentUser(req: FastifyRequest): Promise<User | null> {
  const id = req.session.get("uid") as string | undefined;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export function requireUser() {
  return async (req: FastifyRequest) => {
    const u = await currentUser(req);
    if (!u) throw new Forbidden("not authenticated");
    (req as unknown as { user: User }).user = u;
  };
}

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest) => {
    const u = await currentUser(req);
    if (!u) throw new Forbidden("not authenticated");
    if (!roles.includes(u.role)) throw new Forbidden("insufficient role");
    (req as unknown as { user: User }).user = u;
  };
}

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
  }
}

declare module "@fastify/secure-session" {
  interface SessionData {
    uid: string;
  }
}
