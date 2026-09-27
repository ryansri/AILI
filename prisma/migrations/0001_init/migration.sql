-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "dailyCap" INTEGER NOT NULL DEFAULT 20,
    "email" TEXT,
    "passwordHash" TEXT,
    "resetTokenHash" TEXT,
    "resetTokenExpires" DATETIME,
    "onboardedAt" DATETIME,
    "helperToken" TEXT,
    "helperLastSeenAt" DATETIME,
    "helperMemberUrn" TEXT,
    "helperImported" INTEGER NOT NULL DEFAULT 0,
    "helperImporting" BOOLEAN NOT NULL DEFAULT false,
    "helperPhase" TEXT,
    "helperPausedUntil" DATETIME,
    "helperError" TEXT,
    "leadsSortedAt" DATETIME,
    "helperName" TEXT,
    "helperPictureUrl" TEXT,
    "helperVersion" TEXT,
    "notifyReplies" BOOLEAN NOT NULL DEFAULT true,
    "helperState" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headline" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "linkedinUrl" TEXT NOT NULL DEFAULT '',
    "linkedinUrn" TEXT,
    "publicId" TEXT,
    "pictureUrl" TEXT NOT NULL DEFAULT '',
    "conversationId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "stage" TEXT NOT NULL DEFAULT 'warming',
    "lead" BOOLEAN NOT NULL DEFAULT true,
    "stageChangedAt" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" DATETIME,
    "requestedAt" DATETIME,
    "snoozedUntil" DATETIME,
    "archivedAt" DATETIME,
    "lastActionAt" DATETIME,
    "handledAt" DATETIME,
    "jobTitle" TEXT NOT NULL DEFAULT '',
    "profileCheckedAt" DATETIME,
    "profileEditedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Person_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Stage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Template_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'stone',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonTag" (
    "personId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("personId", "tagId"),
    CONSTRAINT "PersonTag_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL,
    "followUp" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "followUp" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" DATETIME,
    "sentAt" DATETIME,
    CONSTRAINT "Outbox_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Outbox_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_email_key" ON "Workspace"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_helperToken_key" ON "Workspace"("helperToken");

-- CreateIndex
CREATE INDEX "Person_workspaceId_stage_idx" ON "Person"("workspaceId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Person_workspaceId_linkedinUrn_key" ON "Person"("workspaceId", "linkedinUrn");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_workspaceId_key_key" ON "Stage"("workspaceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_workspaceId_label_key" ON "Tag"("workspaceId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Message_externalId_key" ON "Message"("externalId");

-- CreateIndex
CREATE INDEX "Message_personId_sentAt_idx" ON "Message"("personId", "sentAt");

-- CreateIndex
CREATE INDEX "Outbox_workspaceId_status_idx" ON "Outbox"("workspaceId", "status");

