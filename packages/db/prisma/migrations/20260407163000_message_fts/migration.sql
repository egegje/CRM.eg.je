ALTER TABLE "Message"
  ADD COLUMN "fts" tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce("subject",'') || ' ' || coalesce("bodyText",''))
  ) STORED;
CREATE INDEX "Message_fts_idx" ON "Message" USING GIN ("fts");
