import { prisma } from "@crm/db";
import { loadConfig } from "../config.js";
import { setKey, encrypt } from "../crypto.js";

setKey(loadConfig().encKey);

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? ""];
  }),
);

if (!args.email || !args["app-password"] || !args.name) {
  console.error("usage: seed-mailbox --email=... --app-password=... --name=...");
  process.exit(1);
}

const enc = encrypt(args["app-password"], args.email);
const m = await prisma.mailbox.upsert({
  where: { email: args.email },
  update: { encryptedAppPassword: enc, displayName: args.name, enabled: true },
  create: {
    email: args.email,
    displayName: args.name,
    encryptedAppPassword: enc,
  },
});

const existing = await prisma.folder.findFirst({
  where: { mailboxId: m.id, kind: "inbox" },
});
if (!existing) {
  await prisma.folder.create({
    data: { mailboxId: m.id, name: "INBOX", kind: "inbox" },
  });
}

console.log("ok", m.id);
process.exit(0);
