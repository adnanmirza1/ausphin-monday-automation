-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "account" TEXT NOT NULL DEFAULT 'pty',
    "candidateName" TEXT NOT NULL,
    "candidateEmail" TEXT NOT NULL DEFAULT '',
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "description" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "stripeInvoiceId" TEXT,
    "stripeUrl" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'stripe',
    "requestedById" TEXT,
    "approvedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Invoice_orgId_idx" ON "Invoice"("orgId");
