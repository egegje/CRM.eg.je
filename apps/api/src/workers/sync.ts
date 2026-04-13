import { ImapFlow, type FetchMessageObject } from "imapflow";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@crm/db";
import { parseRaw } from "@crm/mail";
import { decrypt } from "../crypto.js";
import { loadConfig } from "../config.js";
import { notifyNewMail } from "../services/notifier.js";
import { maybeProposeTaskFromEmail, maybeProposeAutoClose } from "../services/email-task-ai.js";

const cfg = loadConfig();
const clients = new Map<string, ImapFlow>();

const stripNul = (s: string | undefined | null): string | undefined =>
  s == null ? undefined : s.replace(/\u0000/g, "");

// Common sent folder names to try in order
const SENT_FOLDER_NAMES = [
  "Sent",
  "INBOX.Sent",
  "Sent Messages",
  "Sent Items",
  "Отправленные",
  "INBOX.Отправленные",
];

async function persistMessage(
  mailboxId: string,
  folderId: string,
  msg: FetchMessageObject,
  options: { isRead?: boolean; skipNotify?: boolean } = {},
): Promise<void> {
  if (!msg.source) return;
  const parsed = await parseRaw(msg.source);
  if (parsed.messageId) {
    const exists = await prisma.message.findUnique({
      where: { messageId: parsed.messageId },
    });
    if (exists) return;
  }
  const created = await prisma.message.create({
    data: {
      mailboxId,
      folderId,
      imapUid: msg.uid,
      messageId: parsed.messageId,
      fromAddr: stripNul(parsed.from) ?? "",
      toAddrs: parsed.to,
      ccAddrs: parsed.cc,
      subject: stripNul(parsed.subject) ?? "",
      bodyText: stripNul(parsed.text),
      bodyHtml: stripNul(parsed.html),
      isRead: options.isRead ?? false,
      receivedAt: parsed.date ?? msg.internalDate ?? new Date(),
    },
  });
  for (const a of parsed.attachments) {
    const cleaned = a.filename.replace(/[/\\]/g, "_");
    const buf = Buffer.from(cleaned, "utf8");
    const safe = buf.length > 200 ? buf.subarray(0, 200).toString("utf8") + "_" : cleaned;
    const dir = join(cfg.attachmentDir, mailboxId, created.id);
    await mkdir(dir, { recursive: true });
    const path = join(dir, safe);
    await writeFile(path, a.content);
    await prisma.attachment.create({
      data: {
        messageId: created.id,
        filename: a.filename,
        mime: a.mime,
        size: a.size,
        storagePath: path,
      },
    });
  }

  if (options.skipNotify) return;

  // apply routing rules (only for inbox messages)
  const rules = await prisma.rule.findMany({ where: { enabled: true } });
  for (const r of rules) {
    const haystack =
      r.triggerType === "from" ? parsed.from
      : r.triggerType === "to" ? parsed.to.join(",")
      : parsed.subject;
    if (haystack.toLowerCase().includes(r.contains.toLowerCase())) {
      await prisma.message.update({ where: { id: created.id }, data: { folderId: r.folderId } }).catch(() => {});
      break;
    }
  }
  // upsert contacts (auto-collected address book)
  const ownEmails = new Set((await prisma.mailbox.findMany({ select: { email: true } })).map((m) => m.email.toLowerCase()));
  const addrs = new Set(
    [parsed.from, ...parsed.to, ...parsed.cc]
      .filter(Boolean)
      .map((e) => e.toLowerCase())
      .filter((e) => !ownEmails.has(e)),
  );
  for (const email of addrs) {
    await prisma.contact
      .upsert({
        where: { email },
        create: { email, name: "", useCount: 1, lastUsedAt: new Date() },
        update: { useCount: { increment: 1 }, lastUsedAt: new Date() },
      })
      .catch(() => {});
  }
  // fire-and-forget AI summary + telegram notification
  const mailboxRow = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (mailboxRow) {
    notifyNewMail(created, mailboxRow).catch((e) =>
      console.error("notify failed:", (e as Error).message),
    );
    maybeProposeTaskFromEmail(created.id).catch((e) =>
      console.error("ai task detect failed:", (e as Error).message),
    );
    maybeProposeAutoClose(created.id).catch((e) =>
      console.error("ai autoclose failed:", (e as Error).message),
    );
  }
}

/**
 * Try to open a sent folder by trying common names.
 * Returns the IMAP folder name that succeeded, or null if none found.
 */
async function openSentFolder(client: ImapFlow): Promise<string | null> {
  for (const name of SENT_FOLDER_NAMES) {
    try {
      await client.mailboxOpen(name);
      return name;
    } catch {
      // folder doesn't exist on this server, try next
    }
  }
  return null;
}

/**
 * Sync all sent messages since sentLastUid for a given mailbox client.
 * Returns the new max UID (or the original if nothing fetched).
 */
async function syncSentFolder(
  client: ImapFlow,
  mailboxId: string,
  lastUid: number,
): Promise<number> {
  const sentFolderName = await openSentFolder(client);
  if (!sentFolderName) {
    console.log(`[sync] No sent folder found for mailbox ${mailboxId}`);
    return lastUid;
  }

  const sentFolder =
    (await prisma.folder.findFirst({ where: { mailboxId, kind: "sent" } })) ??
    (await prisma.folder.create({ data: { mailboxId, name: sentFolderName, kind: "sent" } }));

  let max = lastUid;
  try {
    for await (const msg of client.fetch(
      { uid: `${lastUid + 1}:*` },
      { source: true, uid: true, envelope: true, internalDate: true },
    )) {
      await persistMessage(mailboxId, sentFolder.id, msg, { isRead: true, skipNotify: true });
      if (msg.uid > max) max = msg.uid;
    }
  } catch (e) {
    console.error(`[sync] Error fetching sent for ${mailboxId}:`, (e as Error).message);
  }

  return max;
}

export async function startSyncFor(mailboxId: string): Promise<void> {
  const m = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!m || !m.enabled) return;
  if (clients.has(mailboxId)) return;

  const pass = decrypt(m.encryptedAppPassword, m.email);
  const client = new ImapFlow({
    host: m.imapHost,
    port: m.imapPort,
    secure: m.imapPort === 993,
    auth: { user: m.email, pass },
    logger: false,
  });
  clients.set(mailboxId, client);
  await client.connect();

  // --- Sync Sent folder first (one-time fetch, no IDLE) ---
  try {
    const state = await prisma.syncState.upsert({
      where: { mailboxId },
      create: { mailboxId, lastUid: 0, sentLastUid: 0 },
      update: {},
    });
    const newSentUid = await syncSentFolder(client, mailboxId, state.sentLastUid);
    if (newSentUid !== state.sentLastUid) {
      await prisma.syncState.update({
        where: { mailboxId },
        data: { sentLastUid: newSentUid },
      });
    }
  } catch (e) {
    console.error(`[sync] Sent sync failed for ${mailboxId}:`, (e as Error).message);
  }

  // --- Switch back to INBOX for ongoing sync + IDLE ---
  await client.mailboxOpen("INBOX");

  const inbox =
    (await prisma.folder.findFirst({ where: { mailboxId, kind: "inbox" } })) ??
    (await prisma.folder.create({ data: { mailboxId, name: "INBOX", kind: "inbox" } }));

  const state = await prisma.syncState.upsert({
    where: { mailboxId },
    create: { mailboxId, lastUid: 0, sentLastUid: 0 },
    update: {},
  });

  async function fetchSince(uid: number): Promise<void> {
    let max = uid;
    for await (const msg of client.fetch(
      { uid: `${uid + 1}:*` },
      { source: true, uid: true, envelope: true, internalDate: true },
    )) {
      await persistMessage(mailboxId, inbox.id, msg);
      if (msg.uid > max) max = msg.uid;
    }
    if (max !== uid) {
      await prisma.syncState.update({
        where: { mailboxId },
        data: { lastUid: max },
      });
    }
  }

  await fetchSince(state.lastUid);

  client.on("exists", async () => {
    const s = await prisma.syncState.findUnique({ where: { mailboxId } });
    await fetchSince(s?.lastUid ?? 0);
  });

  client.idle().catch(() => {
    /* idle ends naturally on logout */
  });
}

/**
 * On-demand: sync sent folder for a single mailbox without disrupting IDLE.
 * Creates a fresh short-lived connection just for the sent fetch.
 */
export async function syncSentForMailbox(mailboxId: string): Promise<{ synced: number }> {
  const m = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!m || !m.enabled) return { synced: 0 };

  const pass = decrypt(m.encryptedAppPassword, m.email);
  const client = new ImapFlow({
    host: m.imapHost,
    port: m.imapPort,
    secure: m.imapPort === 993,
    auth: { user: m.email, pass },
    logger: false,
  });

  await client.connect();
  try {
    const state = await prisma.syncState.upsert({
      where: { mailboxId },
      create: { mailboxId, lastUid: 0, sentLastUid: 0 },
      update: {},
    });

    const beforeUid = state.sentLastUid;
    const newSentUid = await syncSentFolder(client, mailboxId, beforeUid);
    if (newSentUid !== beforeUid) {
      await prisma.syncState.update({
        where: { mailboxId },
        data: { sentLastUid: newSentUid },
      });
    }
    return { synced: newSentUid - beforeUid };
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function stopAllSync(): Promise<void> {
  for (const c of clients.values()) {
    await c.logout().catch(() => {});
  }
  clients.clear();
}
