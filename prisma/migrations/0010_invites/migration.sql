-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'aili',
    "invitationId" TEXT,
    "sharedSecret" TEXT,
    "claimedAt" DATETIME,
    "sentAt" DATETIME,
    "acceptedAt" DATETIME,
    "withdrawnAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invite_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable (added in place: rebuilding Person or Workspace would cascade-delete on Turso)
ALTER TABLE "Person" ADD COLUMN "connection" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Workspace" ADD COLUMN "inviteCap" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Workspace" ADD COLUMN "notifyAccepts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Workspace" ADD COLUMN "inviteStaleDays" INTEGER NOT NULL DEFAULT 21;
ALTER TABLE "Workspace" ADD COLUMN "networkCheckedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Invite_workspaceId_status_idx" ON "Invite"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Invite_personId_idx" ON "Invite"("personId");

-- Profile lookups now bring the photo too: look up once more the leads who have none.
UPDATE "Person" SET "profileCheckedAt" = NULL WHERE "pictureUrl" = '' AND "lead" = 1 AND "archivedAt" IS NULL;
