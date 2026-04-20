import { unlink } from "node:fs/promises";
import { prisma } from "@crm/db";
import { makeAttachmentPurgeWorker, attachmentPurgeQueue } from "../queue.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
/** Only lazy-fetched files (those large enough that we skipped them at sync) are candidates. */
const LAZY_THRESHOLD = 500 * 1024;

/**
 * Delete cached copies of attachments that:
 *   - are large enough to be lazy-fetch candidates (>= 500KB),
 *   - still have IMAP coordinates so we can re-download on demand,
 *   - have not been accessed for 30 days (or never accessed and cached >30d ago).
 * Deletes the file on disk and sets storagePath to NULL. The Attachment row stays.
 */
export async function runAttachmentPurge(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - THIRTY_DAYS_MS);
  const candidates = await prisma.attachment.findMany({
    where: {
      storagePath: { not: null },
      imapUid: { not: null },
      size: { gte: LAZY_THRESHOLD },
      OR: [
        { lastAccessedAt: { lt: cutoff } },
        { lastAccessedAt: null, cachedAt: { lt: cutoff } },
      ],
    },
    select: { id: true, storagePath: true },
  });

  let purged = 0;
  for (const a of candidates) {
    if (!a.storagePath) continue;
    try {
      await unlink(a.storagePath);
    } catch {
      /* file may already be gone — still clear the pointer */
    }
    await prisma.attachment.update({
      where: { id: a.id },
      data: { storagePath: null, cachedAt: null },
    });
    purged++;
  }
  return purged;
}

export async function startAttachmentPurgeWorker() {
  await attachmentPurgeQueue.add(
    "daily",
    {},
    { repeat: { pattern: "15 3 * * *" }, jobId: "attachment-purge-daily" },
  );
  return makeAttachmentPurgeWorker(async () => {
    const n = await runAttachmentPurge();
    if (n > 0) console.log(`[attachment-purge] purged ${n} cached files`);
  });
}
