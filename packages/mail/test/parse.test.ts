import { describe, it, expect } from "vitest";
import { parseRaw } from "../src/parse.js";

const RAW = Buffer.from(
  [
    "From: a@x.test",
    "To: b@y.test",
    "Subject: hi",
    "Message-Id: <1@x.test>",
    "Content-Type: text/plain",
    "",
    "hello",
    "",
  ].join("\r\n"),
);

describe("parseRaw", () => {
  it("extracts headers + body", async () => {
    const p = await parseRaw(RAW);
    expect(p.from).toBe("a@x.test");
    expect(p.to).toEqual(["b@y.test"]);
    expect(p.subject).toBe("hi");
    expect(p.text?.trim()).toBe("hello");
    expect(p.messageId).toBe("<1@x.test>");
  });
});
