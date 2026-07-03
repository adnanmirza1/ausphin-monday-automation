-- CreateTable
CREATE TABLE "Employer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Employer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CandidateTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'interview',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateTag_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CandidateTag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Employer_orgId_name_key" ON "Employer"("orgId", "name");

-- CreateIndex
CREATE INDEX "CandidateTag_itemId_idx" ON "CandidateTag"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateTag_employerId_itemId_key" ON "CandidateTag"("employerId", "itemId");
