import { prisma, type User } from "@crm/db";
import { Forbidden, NotFound } from "../errors.js";

/**
 * Returns the list of mailbox IDs the user can access, or null for "see all".
 *
 * Rules:
 *   - Admin / manager: strictly what's in UserMailbox. No rows = no access.
 *   - Owner: same UserMailbox table, but if owner has zero rows we treat it
 *     as "see everything" (default state, nothing was ever configured).
 *     Once owner saves any subset, that subset becomes their personal view.
 */
export async function accessibleMailboxIds(user: User): Promise<string[] | null> {
  const rows = await prisma.userMailbox.findMany({
    where: { userId: user.id },
    select: { mailboxId: true },
  });
  if (user.role === "owner" && rows.length === 0) return null;
  return rows.map((r) => r.mailboxId);
}

/** Throws if the user cannot access the given message. Returns the message if OK. */
export async function assertMessageAccess<T extends { mailboxId: string }>(user: User, msg: T | null): Promise<T> {
  if (!msg) throw new NotFound();
  const rows = await prisma.userMailbox.findMany({
    where: { userId: user.id },
    select: { mailboxId: true },
  });
  if (user.role === "owner" && rows.length === 0) return msg;
  if (!rows.some((r) => r.mailboxId === msg.mailboxId)) throw new Forbidden("no access to this mailbox");
  return msg;
}
