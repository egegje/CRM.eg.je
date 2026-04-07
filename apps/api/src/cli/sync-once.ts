import { ImapFlow } from "imapflow";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@crm/db";
import { parseRaw } from "@crm/mail";
import { loadConfig } from "../config.js";
import { setKey, decrypt } from "../crypto.js";

const cfg = loadConfig();
setKey(cfg.encKey);

const mailboxes = await prisma.mailbox.findMany({ where: { enabled: true } });
console.log(`syncing ${mailboxes.length} mailboxes...`);

let total = 0;
for (const m of mailboxes) {
  let pulled = 0;
  try {
    const pass = decrypt(m.encryptedAppPassword, m.email);
    const client = new ImapFlow({
      host: m.imapHost,
      port: m.imapPort,
      secure: m.imapPort === 993,
      auth: { user: m.email, pass },
      logger: false,
    });
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const inbox =
        (await prisma.folder.findFirst({ where: { mailboxId: m.id, kind: "inbox" } })) ??
        (await prisma.folder.create({
          data: { mailboxId: m.id, name: "INBOX", kind: "inbox" },
        }));

      const state = await prisma.syncState.upsert({
        where: { mailboxId: m.id },
        create: { mailboxId: m.id, lastUid: 0 },
        update: {},
      });

      let max = state.lastUid;
      for await (const msg of client.fetch(
        { uid: `${state.lastUid + 1}:*` },
        { source: true, uid: true, envelope: true, internalDate: true },
      )) {
        if (!msg.source) continue;
        // skip if we already have this messageId
        const parsed = await parseRaw(msg.source);
        if (parsed.messageId) {
          const exists = await prisma.message.findUnique({
            where: { messageId: parsed.messageId },
          });
          if (exists) {
            if (msg.uid > max) max = msg.uid;
            continue;
          }
        }
        const stripNul = (s: string | undefined) => s?.replace(/\u0000/g, "");
        const created = await prisma.message.create({
          data: {
            mailboxId: m.id,
            folderId: inbox.id,
            imapUid: msg.uid,
            messageId: parsed.messageId,
            fromAddr: stripNul(parsed.from) ?? "",
            toAddrs: parsed.to,
            ccAddrs: parsed.cc,
            subject: stripNul(parsed.subject) ?? "",
            bodyText: stripNul(parsed.text),
            bodyHtml: stripNul(parsed.html),
            receivedAt: parsed.date ?? msg.internalDate ?? new Date(),
            isRead: true, // backfill: don't flood the unread counter
          },
        });
        for (const a of parsed.attachments) {
          const cleaned = a.filename.replace(/[/\\]/g, "_");
          const buf = Buffer.from(cleaned, "utf8");
          const safe = buf.length > 200 ? buf.subarray(0, 200).toString("utf8") + "_" : cleaned;
          const dir = join(cfg.attachmentDir, m.id, created.id);
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
        pulled++;
        if (msg.uid > max) max = msg.uid;
      }
      if (max !== state.lastUid) {
        await prisma.syncState.update({ where: { mailboxId: m.id }, data: { lastUid: max } });
      }
    } finally {
      lock.release();
    }
    await client.logout();
    console.log(`  ${m.email}: +${pulled}`);
    total += pulled;
  } catch (e) {
    console.error(`  ${m.email}: ERROR`, (e as Error).message);
  }
}
console.log(`done, total ${total} messages`);
process.exit(0);
