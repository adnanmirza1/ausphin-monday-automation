-- Generalized third-party OAuth connection table (GitHub is the first
-- provider; Jira/Slack/Gmail/etc. reuse this same table going forward).
-- Idempotent per this repo's established convention (IF NOT EXISTS guards)
-- since prior migrations have hit partial-apply states in production.
CREATE TABLE IF NOT EXISTS "ConnectedIntegration" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountLabel" TEXT NOT NULL DEFAULT '',
    "accountMeta" TEXT NOT NULL DEFAULT '{}',
    "scope" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConnectedIntegration_orgId_provider_key"
    ON "ConnectedIntegration"("orgId", "provider");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ConnectedIntegration_orgId_fkey'
    ) THEN
        ALTER TABLE "ConnectedIntegration"
            ADD CONSTRAINT "ConnectedIntegration_orgId_fkey"
            FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
