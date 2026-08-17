-- DocuGen "Subitem tables" (client requirement — mirrors monday.com's
-- DocuGen app menu): lets a template repeat a table row once per subitem
-- via a {{#subitems}}...{{/subitems}} loop tag, with configurable columns.
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "hasSubitemsLoop" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "subitemColumns" TEXT NOT NULL DEFAULT '[]';
