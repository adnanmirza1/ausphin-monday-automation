-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Board" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "environmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "formEnabled" BOOLEAN NOT NULL DEFAULT false,
    "formTitle" TEXT NOT NULL DEFAULT '',
    "formDesc" TEXT NOT NULL DEFAULT '',
    "formConfig" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "Board_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Board" ("createdAt", "description", "environmentId", "id", "name", "position") SELECT "createdAt", "description", "environmentId", "id", "name", "position" FROM "Board";
DROP TABLE "Board";
ALTER TABLE "new_Board" RENAME TO "Board";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
