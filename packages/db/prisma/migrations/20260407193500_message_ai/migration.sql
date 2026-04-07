-- Already applied via direct ALTER; prisma migrate resolve marks it.
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "aiSummary" text;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "aiActions" text[];
