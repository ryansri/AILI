-- AlterTable
ALTER TABLE "Message" ADD COLUMN "templateId" TEXT;

-- AlterTable
ALTER TABLE "Outbox" ADD COLUMN "templateId" TEXT;

-- CreateIndex
CREATE INDEX "Message_templateId_idx" ON "Message"("templateId");

