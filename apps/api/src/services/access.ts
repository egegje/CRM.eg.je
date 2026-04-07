import { prisma, type User } from "@crm/db";

/**
 * Returns the list of mailbox IDs the user can access, or null if the user
 * has full access (owner/admin role).
 */
export async function accessibleMailboxIds(user: User): Promise<string[] | null> {
  if (user.role === "owner" || user.role === "admin") return null;
  const rows = await prisma.userMailbox.findMany({
    where: { userId: user.id },
    select: { mailboxId: true },
  });
  return rows.map((r) => r.mailboxId);
}
