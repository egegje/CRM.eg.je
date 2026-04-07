import { loadConfig } from "./config.js";
import { setKey } from "./crypto.js";
import { prisma } from "@crm/db";
import { startSyncFor } from "./workers/sync.js";
import { startScheduledSendWorker } from "./workers/scheduled-send.js";
import { startTrashCleanupWorker } from "./workers/trash-cleanup.js";
import { runReminders, runFollowups } from "./workers/reminders.js";

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

// Hourly reminders + follow-ups
const HOUR = 60 * 60 * 1000;
async function tick() {
  try { await runReminders(); } catch (e) { console.error("reminders:", (e as Error).message); }
  try { await runFollowups(); } catch (e) { console.error("followups:", (e as Error).message); }
}
setInterval(tick, HOUR);
setTimeout(tick, 30 * 1000); // first tick 30s after boot

console.log(`workers up: ${mailboxes.length} mailboxes`);
