-- AlterTable
ALTER TABLE "Post" ADD COLUMN "slotDay" TEXT;

-- CreateTable
CREATE TABLE "Rhythm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "days" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "everyWeeks" INTEGER NOT NULL DEFAULT 1,
    "anchor" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Rhythm_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'post',
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AILI',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Idea_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable (written by hand: Prisma's version rebuilt the Workspace table,
-- which on a live database risks cascading deletes)
ALTER TABLE "Workspace" ADD COLUMN "timeZoneAuto" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Workspace" ADD COLUMN "runwayAlertDays" INTEGER NOT NULL DEFAULT 3;


-- CreateIndex
CREATE UNIQUE INDEX "Rhythm_workspaceId_kind_key" ON "Rhythm"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "Idea_workspaceId_createdAt_idx" ON "Idea"("workspaceId", "createdAt");

