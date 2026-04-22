import webpush from "web-push";
import { prisma } from "@crm/db";
import { loadConfig } from "../config.js";

const cfg = loadConfig();

let ready = false;
if (cfg.vapidPublicKey && cfg.vapidPrivateKey && cfg.vapidSubject) {
  webpush.setVapidDetails(cfg.vapidSubject, cfg.vapidPublicKey, cfg.vapidPrivateKey);
  ready = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/** Send a Web Push notification to every subscription the user has registered. */
export async function sendWebPush(userId: string, payload: PushPayload): Promise<void> {
  if (!ready) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;
  const data = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data,
          { TTL: 60 * 60 * 24 },
        );
      } catch (e: unknown) {
        const err = e as { statusCode?: number };
        // 404/410 = subscription is dead — drop it
        if (err.statusCode === 404 || err.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          console.error("web push:", (e as Error).message);
        }
      }
    }),
  );
}

export function vapidPublicKey(): string | null {
  return cfg.vapidPublicKey ?? null;
}
