import { ImapFlow, type FetchMessageObject } from "imapflow";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@crm/db";
import { parseRaw } from "@crm/mail";
import { decrypt } from "../crypto.js";
import { loadConfig } from "../config.js";

const cfg = loadConfig();
const clients = new Map<string, ImapFlow>();

async function persistMessage(
  mailboxId: string,
  inboxId: string,
  msg: FetchMessageObject,
): Promise<void> {
  if (!msg.source) return;
  const parsed = await parseRaw(msg.source);
  const created = await prisma.message.create({
    data: {
      mailboxId,
      folderId: inboxId,
      imapUid: msg.uid,
      messageId: parsed.messageId,
      fromAddr: parsed.from,
      toAddrs: parsed.to,
      ccAddrs: parsed.cc,
      subject: parsed.subject,
      bodyText: parsed.text,
      bodyHtml: parsed.html,
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
  await client.mailboxOpen("INBOX");

  const inbox =
    (await prisma.folder.findFirst({ where: { mailboxId, kind: "inbox" } })) ??
    (await prisma.folder.create({ data: { mailboxId, name: "INBOX", kind: "inbox" } }));

  const state = await prisma.syncState.upsert({
    where: { mailboxId },
    create: { mailboxId, lastUid: 0 },
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

export async function stopAllSync(): Promise<void> {
  for (const c of clients.values()) {
    await c.logout().catch(() => {});
  }
  clients.clear();
}
