-- AlterTable
ALTER TABLE "Touch" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Touch" ADD COLUMN "text" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Touch" ADD COLUMN "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Touch_workspaceId_externalId_key" ON "Touch"("workspaceId", "externalId");
