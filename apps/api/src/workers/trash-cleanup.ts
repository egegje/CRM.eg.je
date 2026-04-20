import { unlink } from "node:fs/promises";
import { prisma } from "@crm/db";
import { makeCleanupWorker, cleanupQueue } from "../queue.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function runCleanup(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - THIRTY_DAYS_MS);
  const old = await prisma.message.findMany({
    where: { deletedAt: { lt: cutoff } },
    include: { attachments: true },
  });
  for (const m of old) {
    for (const a of m.attachments) {
      if (!a.storagePath) continue;
      try {
        await unlink(a.storagePath);
      } catch {
        /* file may already be gone */
      }
    }
    await prisma.message.delete({ where: { id: m.id } });
  }
  return old.length;
}

export async function startTrashCleanupWorker() {
  await cleanupQueue.add(
    "daily",
    {},
    { repeat: { pattern: "0 3 * * *" }, jobId: "trash-daily" },
  );
  return makeCleanupWorker(async () => {
    await runCleanup();
  });
}
