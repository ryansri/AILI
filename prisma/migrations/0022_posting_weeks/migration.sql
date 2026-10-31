-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "postingWeek" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Workspace" ADD COLUMN "postingSince" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PostingWeek" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "monday" TEXT NOT NULL,
    "personalDays" TEXT NOT NULL DEFAULT '',
    "companyDays" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "personalImpressions" INTEGER,
    "companyImpressions" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PostingWeek_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PostingWeek_workspaceId_monday_key" ON "PostingWeek"("workspaceId", "monday");
