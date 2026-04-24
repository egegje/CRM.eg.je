/**
 * The "рандомно меняет почту" bug came from PATCH /messages dropping the
 * mailboxId field at zod validation — the schema didn't list it, so the
 * backend silently ignored the change and the draft stayed on the old
 * mailbox. These tests pin the accepted shape so a careless schema edit
 * can't silently re-introduce the regression.
 */
import { describe, it, expect } from "vitest";
import { MessagePatch } from "../../src/schemas/message.js";

describe("MessagePatch schema", () => {
  it("accepts mailboxId so drafts can be migrated between mailboxes", () => {
    const parsed = MessagePatch.parse({ mailboxId: "mb_pluton" });
    expect(parsed.mailboxId).toBe("mb_pluton");
  });

  it("accepts all fields the compose form sends together", () => {
    const parsed = MessagePatch.parse({
      mailboxId: "mb_pluton",
      to: ["a@x.com"],
      cc: [],
      subject: "hello",
      bodyText: "body",
      personaId: "persona1",
    });
    expect(parsed.mailboxId).toBe("mb_pluton");
    expect(parsed.to).toEqual(["a@x.com"]);
    expect(parsed.personaId).toBe("persona1");
  });

  it("allows personaId=null to clear a previously-set persona", () => {
    const parsed = MessagePatch.parse({ personaId: null });
    expect(parsed.personaId).toBeNull();
  });

  it("rejects invalid email addresses in to/cc", () => {
    expect(() => MessagePatch.parse({ to: ["not-an-email"] })).toThrow();
    expect(() => MessagePatch.parse({ cc: ["still bad"] })).toThrow();
  });

  it("strips unknown fields instead of blowing up", () => {
    const parsed = MessagePatch.parse({
      mailboxId: "mb_pluton",
      notARealField: "ignored",
    } as unknown as Parameters<typeof MessagePatch.parse>[0]);
    expect(parsed.mailboxId).toBe("mb_pluton");
    expect((parsed as Record<string, unknown>).notARealField).toBeUndefined();
  });

  it("empty object is valid (no-op PATCH)", () => {
    expect(MessagePatch.parse({})).toEqual({});
  });
});
