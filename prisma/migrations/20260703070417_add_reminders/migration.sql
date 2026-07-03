-- CreateTable
CREATE TABLE "ReminderRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dateColumnId" TEXT NOT NULL,
    "offsets" TEXT NOT NULL DEFAULT '[30,21,14,7,5,3,2,1]',
    "notifyDepartmentId" TEXT,
    "message" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderRule_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReminderRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_ruleId_itemId_offsetDays_key" ON "ReminderLog"("ruleId", "itemId", "offsetDays");
