-- Feature 1 (Subitems): self-relation on Item so a record can be nested
-- under an existing item as a subitem/endorsement instead of duplicating it.
-- Guarded (IF NOT EXISTS / duplicate-safe) so this migration can be re-run
-- safely against a database where a prior partial deploy already applied
-- some of these changes without recording the migration as complete.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
CREATE INDEX IF NOT EXISTS "Item_parentId_idx" ON "Item"("parentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Item_parentId_fkey'
  ) THEN
    ALTER TABLE "Item" ADD CONSTRAINT "Item_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Improvement 3: per-board display-label override for the built-in "Item" column.
ALTER TABLE "Board" ADD COLUMN IF NOT EXISTS "itemColumnName" TEXT NOT NULL DEFAULT '';
