-- Consolidated delta since 0_init. Fully idempotent: a no-op on the existing
-- (already-synced) production database, and complete for a fresh database.
-- Covers: EmailMessage, Form, ConnectedEmailAccount, DocTemplateVersion,
-- ConnectedDocuSignAccount, DocuSignEnvelope tables; DocuGen columns on
-- DocTemplate; Organization.emailSenders; User.avatarUrl; BoardView.type;
-- Automation.position; Board/Environment archive + Board.formSlug.

-- ── New tables ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ConnectedDocuSignAccount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL DEFAULT '',
    "baseUri" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectedDocuSignAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DocuSignEnvelope" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL DEFAULT '',
    "envelopeId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'created',
    "recipientEmail" TEXT NOT NULL DEFAULT '',
    "recipientName" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "signedFileUrl" TEXT NOT NULL DEFAULT '',
    "statusColumnId" TEXT,
    "signedColumnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocuSignEnvelope_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConnectedEmailAccount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectedEmailAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Form" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "desc" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" TEXT NOT NULL DEFAULT '{}',
    "slug" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DocTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "docxUrl" TEXT NOT NULL DEFAULT '',
    "docxName" TEXT NOT NULL DEFAULT '',
    "mapping" TEXT NOT NULL DEFAULT '{}',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailMessage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "itemId" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "status" TEXT NOT NULL DEFAULT 'sent',
    "fromEmail" TEXT NOT NULL DEFAULT '',
    "toEmail" TEXT NOT NULL DEFAULT '',
    "ccEmail" TEXT NOT NULL DEFAULT '',
    "bccEmail" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "attachments" TEXT NOT NULL DEFAULT '[]',
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- ── New columns on existing tables ───────────────────────────────────────────
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "emailSenders" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "Environment" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Board" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Board" ADD COLUMN IF NOT EXISTS "formSlug" TEXT;
ALTER TABLE "BoardView" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'table';
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "reference" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "viewName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "employer" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "folder" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "docxUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "docxName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "placeholders" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "mapping" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "outputFormat" TEXT NOT NULL DEFAULT 'docx';
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "outputColumnId" TEXT;
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "DocTemplate" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Automation" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "ConnectedDocuSignAccount_orgId_key" ON "ConnectedDocuSignAccount"("orgId");
CREATE INDEX IF NOT EXISTS "DocuSignEnvelope_orgId_idx" ON "DocuSignEnvelope"("orgId");
CREATE INDEX IF NOT EXISTS "DocuSignEnvelope_itemId_idx" ON "DocuSignEnvelope"("itemId");
CREATE INDEX IF NOT EXISTS "DocuSignEnvelope_envelopeId_idx" ON "DocuSignEnvelope"("envelopeId");
CREATE INDEX IF NOT EXISTS "ConnectedEmailAccount_userId_idx" ON "ConnectedEmailAccount"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ConnectedEmailAccount_orgId_email_key" ON "ConnectedEmailAccount"("orgId", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "Form_slug_key" ON "Form"("slug");
CREATE INDEX IF NOT EXISTS "Form_boardId_idx" ON "Form"("boardId");
CREATE INDEX IF NOT EXISTS "DocTemplate_boardId_idx" ON "DocTemplate"("boardId");
CREATE INDEX IF NOT EXISTS "DocTemplateVersion_templateId_idx" ON "DocTemplateVersion"("templateId");
CREATE INDEX IF NOT EXISTS "EmailMessage_itemId_idx" ON "EmailMessage"("itemId");
CREATE INDEX IF NOT EXISTS "EmailMessage_orgId_idx" ON "EmailMessage"("orgId");

-- ── Foreign keys (idempotent via duplicate_object guard) ─────────────────────
DO $$ BEGIN
  ALTER TABLE "ConnectedDocuSignAccount" ADD CONSTRAINT "ConnectedDocuSignAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DocuSignEnvelope" ADD CONSTRAINT "DocuSignEnvelope_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DocuSignEnvelope" ADD CONSTRAINT "DocuSignEnvelope_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ConnectedEmailAccount" ADD CONSTRAINT "ConnectedEmailAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ConnectedEmailAccount" ADD CONSTRAINT "ConnectedEmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Form" ADD CONSTRAINT "Form_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DocTemplateVersion" ADD CONSTRAINT "DocTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
