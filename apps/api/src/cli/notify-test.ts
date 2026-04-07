import { prisma } from "@crm/db";
import { notifyNewMail } from "../services/notifier.js";

const m = await prisma.message.findFirst({
  where: { bodyText: { not: null } },
  include: { mailbox: true },
  orderBy: { receivedAt: "desc" },
});

if (!m) {
  console.error("no messages in db");
  process.exit(1);
}

console.log("notifying for:", m.subject);
await notifyNewMail(m, m.mailbox);
console.log("done");
process.exit(0);
