-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GeneratedDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedDocument_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GeneratedDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GeneratedDocument" ("createdAt", "html", "id", "itemId", "name", "templateId") SELECT "createdAt", "html", "id", "itemId", "name", "templateId" FROM "GeneratedDocument";
DROP TABLE "GeneratedDocument";
ALTER TABLE "new_GeneratedDocument" RENAME TO "GeneratedDocument";
CREATE INDEX "GeneratedDocument_itemId_idx" ON "GeneratedDocument"("itemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
