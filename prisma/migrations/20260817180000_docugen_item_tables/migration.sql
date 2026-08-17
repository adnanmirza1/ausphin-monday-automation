-- DocuGen "Item tables" — mirrors the Subitem tables mechanism: a template
-- can repeat a table row once per SELECTED column of the current item via
-- a {{#item_fields}}...{{/item_fields}} loop tag, with configurable columns.
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "hasItemTableLoop" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "itemTableColumns" TEXT NOT NULL DEFAULT '[]';
