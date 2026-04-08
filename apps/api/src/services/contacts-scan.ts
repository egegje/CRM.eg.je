import { ImapFlow } from "imapflow";
import { prisma } from "@crm/db";
import { decrypt } from "../crypto.js";

/**
 * One-shot historical contacts scan. For every enabled mailbox, walks
 * the entire INBOX (envelope-only — no body, no attachments) and
 * upserts every From/To/Cc address into the Contact table.
 *
 * Unlike sync.ts which only persists messages from lastUid forward,
 * this touches every UID and never writes Message rows.
 */
export async function scanAllContacts(): Promise<{ scanned: number; contacts: number }> {
  const mailboxes = await prisma.mailbox.findMany({ where: { enabled: true } });
  const ownEmails = new Set(mailboxes.map((m) => m.email.toLowerCase()));
  const seen = new Map<string, { name: string; count: number }>();
  let scanned = 0;

  for (const m of mailboxes) {
    let client: ImapFlow | null = null;
    try {
      const pass = decrypt(m.encryptedAppPassword, m.email);
      client = new ImapFlow({
        host: m.imapHost,
        port: m.imapPort,
        secure: m.imapPort === 993,
        auth: { user: m.email, pass },
        logger: false,
      });
      await client.connect();
      await client.mailboxOpen("INBOX");
      // Fetch envelope-only for every UID. cheap.
      for await (const msg of client.fetch({ uid: "1:*" }, { uid: true, envelope: true })) {
        scanned++;
        const env = msg.envelope;
        if (!env) continue;
        const addrs: { name?: string; address?: string }[] = [
          ...(env.from || []),
          ...(env.to || []),
          ...(env.cc || []),
        ];
        for (const a of addrs) {
          if (!a.address) continue;
          const email = a.address.toLowerCase().trim();
          if (!email || ownEmails.has(email)) continue;
          const ex = seen.get(email);
          if (ex) {
            ex.count++;
            if (!ex.name && a.name) ex.name = a.name;
          } else {
            seen.set(email, { name: a.name || "", count: 1 });
          }
        }
      }
    } catch (e) {
      console.error(`contacts scan failed for ${m.email}:`, (e as Error).message);
    } finally {
      if (client) await client.logout().catch(() => {});
    }
  }

  // Bulk upsert
  for (const [email, info] of seen) {
    await prisma.contact
      .upsert({
        where: { email },
        create: { email, name: info.name, useCount: info.count, lastUsedAt: new Date() },
        update: { useCount: { increment: info.count } },
      })
      .catch(() => {});
  }

  return { scanned, contacts: seen.size };
}
