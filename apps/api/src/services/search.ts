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

/** Build a SQL fragment for scoped text search */
export function buildSearchCondition(q: string, searchIn: SearchIn = "all"): string {
  // Escape single quotes for SQL safety
  const escaped = q.replace(/'/g, "''");
  const like = `'%${escaped}%'`;
  switch (searchIn) {
    case "subject":
      return `"subject" ILIKE ${like}`;
    case "body":
      return `"bodyText" ILIKE ${like}`;
    case "from":
      return `("fromAddr" ILIKE ${like} OR "fromName" ILIKE ${like})`;
    case "to":
      return `array_to_string("toAddrs", ',') ILIKE ${like}`;
    case "all":
    default:
      return `("fts" @@ plainto_tsquery('simple', '${escaped}') OR "fromName" ILIKE ${like})`;
  }
}
