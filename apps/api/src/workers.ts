import { loadConfig } from "./config.js";
import { setKey } from "./crypto.js";
import { prisma } from "@crm/db";
import { startSyncFor } from "./workers/sync.js";
import { startScheduledSendWorker } from "./workers/scheduled-send.js";
import { startTrashCleanupWorker } from "./workers/trash-cleanup.js";
import { runReminders, runFollowups, runSnoozes } from "./workers/reminders.js";
import { startTelegramBot } from "./workers/telegram-bot.js";
import { startTaskBot } from "./workers/task-bot.js";
import { startMorningDigestCron } from "./workers/morning-digest.js";
import { startMetrDeadlinesCron } from "./workers/metr-deadlines.js";

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
const FIVE_MIN = 5 * 60 * 1000;
async function hourly() {
  try { await runReminders(); } catch (e) { console.error("reminders:", (e as Error).message); }
  try { await runFollowups(); } catch (e) { console.error("followups:", (e as Error).message); }
}
async function snoozeTick() {
  try { await runSnoozes(); } catch (e) { console.error("snoozes:", (e as Error).message); }
}
setInterval(hourly, HOUR);
setInterval(snoozeTick, FIVE_MIN);
setTimeout(hourly, 30 * 1000);
setTimeout(snoozeTick, 10 * 1000);

void startTelegramBot();
void startTaskBot();
startMorningDigestCron();
startMetrDeadlinesCron();

console.log(`workers up: ${mailboxes.length} mailboxes`);
