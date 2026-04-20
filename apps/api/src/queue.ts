import { Queue, Worker, type Processor } from "bullmq";
import { loadConfig } from "./config.js";

const cfg = loadConfig();
const url = new URL(cfg.redisUrl);
const connection = {
  host: url.hostname,
  port: Number(url.port || 6379),
};

export const sendQueue = new Queue("scheduled-send", { connection });
export const cleanupQueue = new Queue("trash-cleanup", { connection });
export const attachmentPurgeQueue = new Queue("attachment-purge", { connection });

export function makeSendWorker(processor: Processor): Worker {
  return new Worker("scheduled-send", processor, { connection });
}
export function makeCleanupWorker(processor: Processor): Worker {
  return new Worker("trash-cleanup", processor, { connection });
}
export function makeAttachmentPurgeWorker(processor: Processor): Worker {
  return new Worker("attachment-purge", processor, { connection });
}
