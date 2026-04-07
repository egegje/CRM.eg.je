import { describe, it, expect } from "vitest";
import { buildWhere } from "../../src/services/search.js";

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
  it("forwards folderId/mailboxId/fromAddr", () => {
    const w = buildWhere({ folderId: "f1", mailboxId: "m1", fromAddr: "alice" });
    expect(w.folderId).toBe("f1");
    expect(w.mailboxId).toBe("m1");
    expect(w.fromAddr).toEqual({ contains: "alice", mode: "insensitive" });
  });
  it("builds date range", () => {
    const from = new Date("2026-01-01");
    const to = new Date("2026-02-01");
    const w = buildWhere({ dateFrom: from, dateTo: to });
    expect(w.receivedAt).toEqual({ gte: from, lte: to });
  });
});
