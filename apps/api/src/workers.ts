import { loadConfig } from "./config.js";
import { setKey } from "./crypto.js";
import { prisma } from "@crm/db";
import { startSyncFor } from "./workers/sync.js";
import { startScheduledSendWorker } from "./workers/scheduled-send.js";
import { startTrashCleanupWorker } from "./workers/trash-cleanup.js";

const cfg = loadConfig();
setKey(cfg.encKey);

const mailboxes = await prisma.mailbox.findMany({ where: { enabled: true } });
for (const m of mailboxes) {
  try {
    await startSyncFor(m.id);
    console.log(`sync started: ${m.email}`);
  } catch (e) {
    console.error(`sync failed: ${m.email}`, e);
  }
}
startScheduledSendWorker();
await startTrashCleanupWorker();

console.log(`workers up: ${mailboxes.length} mailboxes`);
