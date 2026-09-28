-- AlterTable
ALTER TABLE "Person" ADD COLUMN "draft" TEXT;
ALTER TABLE "Person" ADD COLUMN "draftAt" DATETIME;
ALTER TABLE "Person" ADD COLUMN "draftSource" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "linkedinPostExpires" DATETIME;
ALTER TABLE "Workspace" ADD COLUMN "linkedinPostName" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "linkedinPostRefresh" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "linkedinPostToken" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "linkedinPostUrn" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "timeZone" TEXT;

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'post',
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledAt" DATETIME,
    "publishedAt" DATETIME,
    "linkedinUrn" TEXT,
    "error" TEXT,
    "source" TEXT NOT NULL DEFAULT 'AILI',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Post_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiClient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "redirectUris" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AiCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codeHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AiGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "accessHash" TEXT NOT NULL,
    "accessExpires" DATETIME NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "refreshExpires" DATETIME NOT NULL,
    "lastUsedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiGrant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppState" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Post_status_scheduledAt_idx" ON "Post"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Post_workspaceId_status_idx" ON "Post"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AiCode_codeHash_key" ON "AiCode"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "AiGrant_accessHash_key" ON "AiGrant"("accessHash");

-- CreateIndex
CREATE UNIQUE INDEX "AiGrant_refreshHash_key" ON "AiGrant"("refreshHash");

-- CreateIndex
CREATE INDEX "AiGrant_workspaceId_idx" ON "AiGrant"("workspaceId");

