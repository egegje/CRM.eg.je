import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

let KEY: Buffer | null = null;

export function setKey(k: Buffer): void {
  if (k.length !== 32) throw new Error("CRM_ENC_KEY must be 32 bytes");
  KEY = k;
}

function key(): Buffer {
  if (!KEY) throw new Error("encryption key not set");
  return KEY;
}

export function encrypt(plaintext: string, aad: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]);
}

export function decrypt(blob: Buffer, aad: string): string {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(blob.length - 16);
  const ct = blob.subarray(12, blob.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
