import type { Prisma } from "@crm/db";

export type SearchIn = "all" | "subject" | "body" | "from" | "to";
export type FolderKind = "all" | "inbox" | "sent" | "drafts";

export type Filters = {
  folderId?: string;
  mailboxId?: string;
  fromAddr?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: "read" | "unread" | "all";
  trash?: boolean;
  searchIn?: SearchIn;
  folderKind?: FolderKind;
};

export function buildWhere(f: Filters): Prisma.MessageWhereInput {
  const w: Prisma.MessageWhereInput = f.trash ? { deletedAt: { not: null } } : { deletedAt: null };
  // folderKind overrides folderId when set to a specific kind
  if (f.folderKind && f.folderKind !== "all") {
    w.folder = { kind: f.folderKind };
  } else if (f.folderKind !== "all" && f.folderId) {
    w.folderId = f.folderId;
  }
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

/** Build Prisma WHERE for scoped text search (safe from SQL injection) */
export function buildSearchWhere(q: string, searchIn: SearchIn = "all"): Prisma.MessageWhereInput {
  const contains = q;
  const mode = "insensitive" as const;
  switch (searchIn) {
    case "subject":
      return { subject: { contains, mode } };
    case "body":
      return { bodyText: { contains, mode } };
    case "from":
      return { OR: [{ fromAddr: { contains, mode } }, { fromName: { contains, mode } }] };
    case "to":
      return { toAddrs: { has: q } };
    case "all":
    default:
      return { OR: [
        { subject: { contains, mode } },
        { bodyText: { contains, mode } },
        { fromAddr: { contains, mode } },
        { fromName: { contains, mode } },
      ] };
  }
}
