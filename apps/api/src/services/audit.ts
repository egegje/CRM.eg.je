import { prisma } from "@crm/db";
import type { FastifyRequest } from "fastify";

export async function audit(
  req: FastifyRequest | null,
  action: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: (req as { user?: { id: string } } | null)?.user?.id ?? null,
        action,
        details: (details as object) ?? null,
        ip: req?.ip ?? null,
      },
    });
  } catch {
    /* never let audit failure break the request */
  }
}
