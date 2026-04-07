import { z } from "zod";

const Schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  CRM_ENC_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(1),
  ATTACHMENT_DIR: z.string().min(1),
  PORT: z.coerce.number().int().nonnegative(),
  NODE_ENV: z.enum(["development", "test", "production"]),
});

export type Config = {
  databaseUrl: string;
  redisUrl: string;
  encKey: Buffer;
  sessionSecret: Buffer;
  attachmentDir: string;
  port: number;
  env: "development" | "test" | "production";
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const p = Schema.parse(env);
  const encKey = Buffer.from(p.CRM_ENC_KEY, "base64");
  if (encKey.length !== 32) throw new Error("CRM_ENC_KEY must be base64(32)");
  const sessionSecret = Buffer.from(p.SESSION_SECRET, "base64");
  if (sessionSecret.length !== 32) throw new Error("SESSION_SECRET must be base64(32)");
  return {
    databaseUrl: p.DATABASE_URL,
    redisUrl: p.REDIS_URL,
    encKey,
    sessionSecret,
    attachmentDir: p.ATTACHMENT_DIR,
    port: p.PORT,
    env: p.NODE_ENV,
  };
}
