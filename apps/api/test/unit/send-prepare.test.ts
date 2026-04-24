/**
 * Guards the seam that caused today's empty-emails incident. The /send
 * route and the scheduled-send worker both delegate attachment + persona
 * loading to prepareSendPayload — these tests pin the contract so either
 * caller would loudly break if someone accidentally drops html / attachments
 * / signature from the outbound payload again.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { randomBytes } from "node:crypto";

// The crypto module is used inside prepareSendPayload via decrypt(). Seed
// the key before anything imports it so encrypt/decrypt round-trip works.
const { setKey, encrypt } = await import("../../src/crypto.js");
beforeAll(() => setKey(randomBytes(32)));

// Stub fs.readFile so we don't touch disk — each test hands prepareSendPayload
// a map of storagePath -> bytes.
const readFileMock = vi.fn();
vi.mock("node:fs/promises", async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, readFile: (...args: unknown[]) => readFileMock(...args) };
});

// Stub the Prisma client. The helper only touches two models
// (persona.findUnique, attachment.findMany) so a thin fake covers it.
const prismaMock = {
  persona: { findUnique: vi.fn() },
  attachment: { findMany: vi.fn() },
};
vi.mock("@crm/db", () => ({ prisma: prismaMock }));

const { prepareSendPayload } = await import("../../src/services/send-prepare.js");

type Draft = Parameters<typeof prepareSendPayload>[0];

function makeMailbox() {
  return {
    id: "mb1",
    email: "sender@example.com",
    smtpHost: "smtp.example.com",
    smtpPort: 465,
    imapHost: "imap.example.com",
    imapPort: 993,
    encryptedAppPassword: encrypt("smtp-password", "sender@example.com"),
    signature: null,
    displayName: "Sender",
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Draft["mailbox"];
}

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  const base = {
    id: "msg1",
    mailboxId: "mb1",
    mailbox: makeMailbox(),
    folderId: "drafts1",
    isDraft: true,
    fromAddr: "",
    toAddrs: ["recipient@example.com"],
    ccAddrs: [],
    subject: "hello",
    bodyText: "body",
    bodyHtml: null,
    personaId: null,
    senderUserId: null,
    messageId: null,
    receivedAt: new Date(),
    sentAt: null,
    isRead: false,
    isStarred: false,
    deletedAt: null,
    aiSummary: null,
    aiActions: null,
    aiPriority: null,
    imapUid: null,
    fromName: null,
    lastCommentAt: null,
    category: null,
  } as unknown as Draft;
  return { ...base, ...overrides };
}

describe("prepareSendPayload", () => {
  beforeEach(() => {
    prismaMock.persona.findUnique.mockReset();
    prismaMock.attachment.findMany.mockReset();
    readFileMock.mockReset();
  });

  it("passes through text/html/recipients and decrypts SMTP credentials", async () => {
    prismaMock.persona.findUnique.mockResolvedValue(null);
    prismaMock.attachment.findMany.mockResolvedValue([]);
    const draft = makeDraft({
      toAddrs: ["a@x.com", "b@x.com"],
      ccAddrs: ["cc@x.com"],
      subject: "hello",
      bodyText: "plain",
      bodyHtml: "<p>rich</p>",
    });
    const { ctx, payload } = await prepareSendPayload(draft);
    expect(payload.to).toEqual(["a@x.com", "b@x.com"]);
    expect(payload.cc).toEqual(["cc@x.com"]);
    expect(payload.subject).toBe("hello");
    expect(payload.text).toBe("plain");
    expect(payload.html).toBe("<p>rich</p>");
    expect(payload.from).toBe("sender@example.com");
    expect(ctx.decrypt(draft.mailbox.encryptedAppPassword)).toBe("smtp-password");
  });

  it("reads attachment files and attaches them to the payload", async () => {
    prismaMock.persona.findUnique.mockResolvedValue(null);
    prismaMock.attachment.findMany.mockResolvedValue([
      { id: "a1", filename: "doc.pdf", mime: "application/pdf", storagePath: "/tmp/a1", size: 3 },
      { id: "a2", filename: "img.png", mime: "image/png", storagePath: "/tmp/a2", size: 4 },
    ]);
    readFileMock.mockImplementation(async (p: string) => Buffer.from(p === "/tmp/a1" ? "PDF" : "PNGZ"));
    const { payload } = await prepareSendPayload(makeDraft());
    expect(payload.attachments).toHaveLength(2);
    expect(payload.attachments![0]).toEqual({
      filename: "doc.pdf",
      content: Buffer.from("PDF"),
      contentType: "application/pdf",
    });
    expect(payload.attachments![1].filename).toBe("img.png");
  });

  it("omits attachments entirely when the draft has none", async () => {
    prismaMock.persona.findUnique.mockResolvedValue(null);
    prismaMock.attachment.findMany.mockResolvedValue([]);
    const { payload } = await prepareSendPayload(makeDraft());
    expect(payload.attachments).toBeUndefined();
  });

  it("throws loudly when a DB attachment has no storagePath", async () => {
    prismaMock.persona.findUnique.mockResolvedValue(null);
    prismaMock.attachment.findMany.mockResolvedValue([
      { id: "a1", filename: "ghost.pdf", mime: "application/pdf", storagePath: null, size: 1 },
    ]);
    await expect(prepareSendPayload(makeDraft())).rejects.toThrow(/missing storagePath/);
  });

  it("throws when the attachment file is gone from disk", async () => {
    prismaMock.persona.findUnique.mockResolvedValue(null);
    prismaMock.attachment.findMany.mockResolvedValue([
      { id: "a1", filename: "doc.pdf", mime: "application/pdf", storagePath: "/tmp/missing", size: 1 },
    ]);
    readFileMock.mockRejectedValue(new Error("ENOENT"));
    await expect(prepareSendPayload(makeDraft())).rejects.toThrow();
  });

  it("pulls the per-persona signature when personaId is set", async () => {
    prismaMock.persona.findUnique.mockResolvedValue({ signature: "-- Ollie, CRO" });
    prismaMock.attachment.findMany.mockResolvedValue([]);
    const draft = makeDraft({ personaId: "p1" } as Partial<Draft>);
    const { payload } = await prepareSendPayload(draft);
    expect(payload.signatureOverride).toBe("-- Ollie, CRO");
    expect(prismaMock.persona.findUnique).toHaveBeenCalledWith({
      where: { id: "p1" },
      select: { signature: true },
    });
  });

  it("leaves signatureOverride undefined when no personaId is set", async () => {
    prismaMock.persona.findUnique.mockResolvedValue(null);
    prismaMock.attachment.findMany.mockResolvedValue([]);
    const { payload } = await prepareSendPayload(makeDraft());
    expect(payload.signatureOverride).toBeUndefined();
    expect(prismaMock.persona.findUnique).not.toHaveBeenCalled();
  });
});
