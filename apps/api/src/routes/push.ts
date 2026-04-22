import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@crm/db";
import { requireUser } from "../auth.js";
import { vapidPublicKey } from "../services/push.js";

const Subscribe = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/push/public-key", async () => ({ publicKey: vapidPublicKey() }));

  app.post("/api/push/subscribe", { preHandler: requireUser() }, async (req) => {
    const user = req.user!;
    const body = Subscribe.parse(req.body);
    const ua = (req.headers["user-agent"] as string | undefined) ?? null;
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: ua,
      },
      update: {
        userId: user.id,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: ua,
      },
    });
    return { ok: true };
  });

  app.post("/api/push/unsubscribe", { preHandler: requireUser() }, async (req) => {
    const body = z.object({ endpoint: z.string().url() }).parse(req.body);
    await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint } });
    return { ok: true };
  });
}
