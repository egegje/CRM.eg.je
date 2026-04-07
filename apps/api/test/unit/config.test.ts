import { describe, it, expect } from "vitest";
import { loadConfig } from "../../src/config.js";

const base = {
  DATABASE_URL: "postgresql://x",
  REDIS_URL: "redis://x",
  CRM_ENC_KEY: Buffer.alloc(32).toString("base64"),
  SESSION_SECRET: Buffer.alloc(32).toString("base64"),
  ATTACHMENT_DIR: "/tmp/a",
  PORT: "3001",
  NODE_ENV: "test" as const,
};

describe("config", () => {
  it("parses env into typed config", () => {
    const cfg = loadConfig(base);
    expect(cfg.port).toBe(3001);
    expect(cfg.encKey.length).toBe(32);
  });

  it("rejects short enc key", () => {
    expect(() => loadConfig({ ...base, CRM_ENC_KEY: "short" })).toThrow();
  });
});
