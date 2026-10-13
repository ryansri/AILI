-- AlterTable
ALTER TABLE "Outbox" ADD COLUMN "heldReason" TEXT;
ALTER TABLE "Outbox" ADD COLUMN "sendAt" DATETIME;

