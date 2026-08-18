-- AI Hub: Vibe (SentimentScore), AI Agents (AgentDefinition/AgentRun),
-- AI Notetaker (NotetakerSession). Idempotent per this repo's convention.
CREATE TABLE IF NOT EXISTS "SentimentScore" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sentiment" TEXT NOT NULL DEFAULT 'neutral',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL DEFAULT '',
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "error" TEXT NOT NULL DEFAULT '',
    "sourceKind" TEXT NOT NULL DEFAULT 'updates',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentimentScore_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SentimentScore_itemId_idx" ON "SentimentScore"("itemId");

CREATE TABLE IF NOT EXISTS "AgentDefinition" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL DEFAULT '',
    "allowedTools" TEXT NOT NULL DEFAULT '[]',
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDefinition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AgentDefinition_orgId_idx" ON "AgentDefinition"("orgId");

CREATE TABLE IF NOT EXISTS "AgentRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "input" TEXT NOT NULL DEFAULT '',
    "steps" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'planning',
    "error" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AgentRun_agentId_idx" ON "AgentRun"("agentId");

CREATE TABLE IF NOT EXISTS "NotetakerSession" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "itemId" TEXT,
    "createdById" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "sourceKind" TEXT NOT NULL DEFAULT 'text',
    "audioUrl" TEXT NOT NULL DEFAULT '',
    "audioName" TEXT NOT NULL DEFAULT '',
    "rawText" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "actionItems" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotetakerSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NotetakerSession_orgId_idx" ON "NotetakerSession"("orgId");
CREATE INDEX IF NOT EXISTS "NotetakerSession_itemId_idx" ON "NotetakerSession"("itemId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SentimentScore_itemId_fkey') THEN
        ALTER TABLE "SentimentScore" ADD CONSTRAINT "SentimentScore_itemId_fkey"
            FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentDefinition_orgId_fkey') THEN
        ALTER TABLE "AgentDefinition" ADD CONSTRAINT "AgentDefinition_orgId_fkey"
            FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentRun_agentId_fkey') THEN
        ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentId_fkey"
            FOREIGN KEY ("agentId") REFERENCES "AgentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotetakerSession_orgId_fkey') THEN
        ALTER TABLE "NotetakerSession" ADD CONSTRAINT "NotetakerSession_orgId_fkey"
            FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotetakerSession_itemId_fkey') THEN
        ALTER TABLE "NotetakerSession" ADD CONSTRAINT "NotetakerSession_itemId_fkey"
            FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
