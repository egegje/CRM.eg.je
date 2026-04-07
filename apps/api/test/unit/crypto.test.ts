import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt, setKey } from "../../src/crypto.js";

beforeAll(() => setKey(randomBytes(32)));

describe("crypto", () => {
  it("round-trips a string", () => {
    const blob = encrypt("hunter2", "user@mail.ru");
    expect(decrypt(blob, "user@mail.ru")).toBe("hunter2");
  });

  it("rejects wrong AAD", () => {
    const blob = encrypt("hunter2", "user@mail.ru");
    expect(() => decrypt(blob, "evil@mail.ru")).toThrow();
  });

  it("produces different ciphertexts for same plaintext", () => {
    const a = encrypt("x", "u@m");
    const b = encrypt("x", "u@m");
    expect(a.equals(b)).toBe(false);
  });
});
