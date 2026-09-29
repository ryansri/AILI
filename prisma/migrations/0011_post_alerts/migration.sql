-- CreateTable
CREATE TABLE "Touch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'comment',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Touch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Touch_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable (added in place: rebuilding Person or Workspace would cascade-delete on Turso)
ALTER TABLE "Person" ADD COLUMN "alerts" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Person" ADD COLUMN "alertsAt" DATETIME;
ALTER TABLE "Person" ADD COLUMN "alertsOpenedAt" DATETIME;
ALTER TABLE "Person" ADD COLUMN "alertsLaterAt" DATETIME;
ALTER TABLE "Workspace" ADD COLUMN "alertsNudge" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Workspace" ADD COLUMN "alertsPerDay" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Workspace" ADD COLUMN "touchesToConnect" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Workspace" ADD COLUMN "alertsNudgedOn" TEXT;

-- CreateIndex
CREATE INDEX "Touch_personId_idx" ON "Touch"("personId");
