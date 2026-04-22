import { prisma, type User } from "@crm/db";
import { Forbidden, NotFound } from "../errors.js";

/**
 * Returns the list of mailbox IDs the user can access.
 * Same rule for every role (owner, admin, manager): only what's in UserMailbox.
 * No rows = no access. Returns the array (never null) so callers always filter.
 */
export async function accessibleMailboxIds(user: User): Promise<string[]> {
  const rows = await prisma.userMailbox.findMany({
    where: { userId: user.id },
    select: { mailboxId: true },
  });
  return rows.map((r) => r.mailboxId);
}

/** Throws if the user cannot access the given message. Returns the message if OK. */
export async function assertMessageAccess<T extends { mailboxId: string }>(user: User, msg: T | null): Promise<T> {
  if (!msg) throw new NotFound();
  const row = await prisma.userMailbox.findFirst({
    where: { userId: user.id, mailboxId: msg.mailboxId },
    select: { mailboxId: true },
  });
  if (!row) throw new Forbidden("no access to this mailbox");
  return msg;
}
