CREATE TABLE IF NOT EXISTS "AuditLog" (id text PRIMARY KEY, "userId" text, action text NOT NULL, details jsonb, ip text, "createdAt" timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);
