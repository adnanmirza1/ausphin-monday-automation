-- Automation execution history: one row per automation run (may cover
-- several THEN-steps), so failures are queryable/visible instead of only
-- showing up as best-effort notes on an item's timeline.
CREATE TABLE IF NOT EXISTS "AutomationLog" (
    "id" TEXT NOT NULL,
    "automationId" TEXT,
    "automationName" TEXT NOT NULL DEFAULT '',
    "boardId" TEXT NOT NULL,
    "itemId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "error" TEXT NOT NULL DEFAULT '',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutomationLog_automationId_idx" ON "AutomationLog"("automationId");
CREATE INDEX IF NOT EXISTS "AutomationLog_boardId_idx" ON "AutomationLog"("boardId");
CREATE INDEX IF NOT EXISTS "AutomationLog_itemId_idx" ON "AutomationLog"("itemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AutomationLog_automationId_fkey'
  ) THEN
    ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_automationId_fkey"
      FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
