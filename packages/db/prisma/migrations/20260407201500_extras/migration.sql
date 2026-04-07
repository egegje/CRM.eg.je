CREATE TABLE IF NOT EXISTS "Snooze" (id text PRIMARY KEY, "messageId" text NOT NULL UNIQUE, "snoozeUntil" timestamptz NOT NULL, notified boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS "Snooze_until_idx" ON "Snooze"("snoozeUntil") WHERE notified = false;
CREATE TABLE IF NOT EXISTS "SmartFolder" (id text PRIMARY KEY, "ownerId" text NOT NULL, name text NOT NULL, query jsonb NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "PasswordReset" (id text PRIMARY KEY, "userId" text NOT NULL, token text NOT NULL UNIQUE, "expiresAt" timestamptz NOT NULL, used boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now());
