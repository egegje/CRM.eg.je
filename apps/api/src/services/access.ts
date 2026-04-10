import { prisma, type User } from "@crm/db";
import { Forbidden, NotFound } from "../errors.js";

/**
 * Returns the list of mailbox IDs the user can access, or null if the user
 * has full access (owner/admin role).
 */
export async function accessibleMailboxIds(user: User): Promise<string[] | null> {
  // Owner sees everything
  if (user.role === "owner") return null;
  // Admin and manager: only mailboxes with explicit access grant.
  // No grants = no access (empty array).
  const rows = await prisma.userMailbox.findMany({
    where: { userId: user.id },
    select: { mailboxId: true },
  });
  return rows.map((r) => r.mailboxId);
}

/** Throws if the user cannot access the given message. Returns the message if OK. */
export async function assertMessageAccess<T extends { mailboxId: string }>(user: User, msg: T | null): Promise<T> {
  if (!msg) throw new NotFound();
  if (user.role === "owner") return msg;
  const rows = await prisma.userMailbox.findMany({
    where: { userId: user.id, mailboxId: msg.mailboxId },
    select: { mailboxId: true },
  });
  if (!rows.length) throw new Forbidden("no access to this mailbox");
  return msg;
}
