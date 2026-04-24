/**
 * ACL is the load-bearing wall for multi-tenant mailbox access. Every role
 * (owner included) is gated by UserMailbox rows, and these tests pin that
 * contract: no row = no access, even for owners. Guards against regressions
 * that would leak mail across users once we scale past a few seats.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = {
  userMailbox: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
};
vi.mock("@crm/db", () => ({ prisma: prismaMock }));

const { accessibleMailboxIds, assertMessageAccess } = await import(
  "../../src/services/access.js"
);

beforeEach(() => {
  prismaMock.userMailbox.findMany.mockReset();
  prismaMock.userMailbox.findFirst.mockReset();
});

describe("accessibleMailboxIds", () => {
  it("returns only mailbox IDs that have a UserMailbox row for the user", async () => {
    prismaMock.userMailbox.findMany.mockResolvedValue([
      { mailboxId: "mb1" },
      { mailboxId: "mb2" },
    ]);
    const ids = await accessibleMailboxIds({ id: "u1" } as Parameters<typeof accessibleMailboxIds>[0]);
    expect(ids).toEqual(["mb1", "mb2"]);
    expect(prismaMock.userMailbox.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: { mailboxId: true },
    });
  });

  it("returns an empty array when the user has no mailbox rows — even for owners", async () => {
    prismaMock.userMailbox.findMany.mockResolvedValue([]);
    const ids = await accessibleMailboxIds({ id: "owner1", role: "owner" } as Parameters<typeof accessibleMailboxIds>[0]);
    expect(ids).toEqual([]);
  });
});

describe("assertMessageAccess", () => {
  it("throws NotFound when the message itself is null", async () => {
    await expect(
      assertMessageAccess({ id: "u1" } as Parameters<typeof assertMessageAccess>[0], null),
    ).rejects.toThrow();
    expect(prismaMock.userMailbox.findFirst).not.toHaveBeenCalled();
  });

  it("throws Forbidden when the user has no UserMailbox row for the message's mailbox", async () => {
    prismaMock.userMailbox.findFirst.mockResolvedValue(null);
    await expect(
      assertMessageAccess(
        { id: "u1" } as Parameters<typeof assertMessageAccess>[0],
        { mailboxId: "mb_other" },
      ),
    ).rejects.toThrow(/no access/i);
    expect(prismaMock.userMailbox.findFirst).toHaveBeenCalledWith({
      where: { userId: "u1", mailboxId: "mb_other" },
      select: { mailboxId: true },
    });
  });

  it("returns the message when the user has a matching UserMailbox row", async () => {
    prismaMock.userMailbox.findFirst.mockResolvedValue({ mailboxId: "mb1" });
    const msg = { mailboxId: "mb1", id: "m1" };
    const ok = await assertMessageAccess(
      { id: "u1" } as Parameters<typeof assertMessageAccess>[0],
      msg,
    );
    expect(ok).toBe(msg);
  });
});
