import { prisma } from "@crm/db";
import { hashPassword } from "../auth.js";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? ""];
  }),
);

if (!args.email || !args.password) {
  console.error("usage: seed-owner --email=... --password=... [--name=...]");
  process.exit(1);
}

const u = await prisma.user.upsert({
  where: { email: args.email },
  update: {},
  create: {
    email: args.email,
    passwordHash: await hashPassword(args.password),
    name: args.name ?? "Owner",
    role: "owner",
  },
});
console.log("ok", u.id);
process.exit(0);
