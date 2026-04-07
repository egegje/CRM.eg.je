import type { Prisma } from "@crm/db";

export type Filters = {
  folderId?: string;
  mailboxId?: string;
  fromAddr?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: "read" | "unread" | "all";
};

export function buildWhere(f: Filters): Prisma.MessageWhereInput {
  const w: Prisma.MessageWhereInput = { deletedAt: null };
  if (f.folderId) w.folderId = f.folderId;
  if (f.mailboxId) w.mailboxId = f.mailboxId;
  if (f.fromAddr) w.fromAddr = { contains: f.fromAddr, mode: "insensitive" };
  if (f.dateFrom || f.dateTo) {
    w.receivedAt = {};
    if (f.dateFrom) (w.receivedAt as Prisma.DateTimeFilter).gte = f.dateFrom;
    if (f.dateTo) (w.receivedAt as Prisma.DateTimeFilter).lte = f.dateTo;
  }
  if (f.status === "read") w.isRead = true;
  if (f.status === "unread") w.isRead = false;
  return w;
}
