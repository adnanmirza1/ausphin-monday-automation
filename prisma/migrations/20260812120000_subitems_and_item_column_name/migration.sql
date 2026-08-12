-- Feature 1 (Subitems): self-relation on Item so a record can be nested
-- under an existing item as a subitem/endorsement instead of duplicating it.
ALTER TABLE "Item" ADD COLUMN     "parentId" TEXT;
CREATE INDEX "Item_parentId_idx" ON "Item"("parentId");
ALTER TABLE "Item" ADD CONSTRAINT "Item_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Improvement 3: per-board display-label override for the built-in "Item" column.
ALTER TABLE "Board" ADD COLUMN     "itemColumnName" TEXT NOT NULL DEFAULT '';
