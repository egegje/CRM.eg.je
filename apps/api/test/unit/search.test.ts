import { describe, it, expect } from "vitest";
import { buildWhere, messageListOrderBy } from "../../src/services/search.js";

describe("buildWhere", () => {
  it("excludes deleted by default", () => {
    expect(buildWhere({}).deletedAt).toBeNull();
  });
  it("returns trash filter when trash=true", () => {
    const w = buildWhere({ trash: true });
    expect(w.deletedAt).toEqual({ not: null });
  });
  it("filters unread", () => {
    expect(buildWhere({ status: "unread" }).isRead).toBe(false);
  });
  it("filters read", () => {
    expect(buildWhere({ status: "read" }).isRead).toBe(true);
  });
  it("forwards folderId/mailboxId; fromAddr matches fromAddr OR fromName", () => {
    const w = buildWhere({ folderId: "f1", mailboxId: "m1", fromAddr: "alice" });
    expect(w.folderId).toBe("f1");
    expect(w.mailboxId).toBe("m1");
    // fromAddr filter searches both address and display-name columns so the
    // user can find "alice@x" by typing "alice" or by typing "Alice Cooper".
    const ands = (w.AND as Array<{ OR: unknown[] }>) ?? [];
    expect(ands).toHaveLength(1);
    expect(ands[0].OR).toEqual([
      { fromAddr: { contains: "alice", mode: "insensitive" } },
      { fromName: { contains: "alice", mode: "insensitive" } },
    ]);
  });
  it("combines to-recipient match across toAddrs and ccAddrs (original + lowercase)", () => {
    const w = buildWhere({ to: "Bob@Example.Com" });
    const ands = (w.AND as Array<{ OR: unknown[] }>) ?? [];
    expect(ands).toHaveLength(1);
    expect(ands[0].OR).toEqual([
      { toAddrs: { has: "Bob@Example.Com" } },
      { toAddrs: { has: "bob@example.com" } },
      { ccAddrs: { has: "Bob@Example.Com" } },
      { ccAddrs: { has: "bob@example.com" } },
    ]);
  });
  it("folderKind overrides folderId when a specific kind is set", () => {
    const w = buildWhere({ folderKind: "sent", folderId: "f1" });
    expect(w.folder).toEqual({ kind: "sent" });
    expect(w.folderId).toBeUndefined();
  });
  it("builds date range", () => {
    const from = new Date("2026-01-01");
    const to = new Date("2026-02-01");
    const w = buildWhere({ dateFrom: from, dateTo: to });
    expect(w.receivedAt).toEqual({ gte: from, lte: to });
  });
});

describe("messageListOrderBy", () => {
  it("inbox view sorts by receivedAt desc only", () => {
    expect(messageListOrderBy(false)).toEqual([{ receivedAt: "desc" }]);
  });

  it("sent/drafts view sorts by sentAt desc (nulls last) then receivedAt desc", () => {
    // Inline sorting on a sent folder produced interleaved date-group headers
    // when receivedAt jittered vs sentAt; the two-key orderBy keeps groups
    // contiguous and tolerates rows that pre-date the sentAt column.
    expect(messageListOrderBy(true)).toEqual([
      { sentAt: { sort: "desc", nulls: "last" } },
      { receivedAt: "desc" },
    ]);
  });
});
