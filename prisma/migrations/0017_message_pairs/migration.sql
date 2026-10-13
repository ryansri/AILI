-- AlterTable
ALTER TABLE "Outbox" ADD COLUMN "afterId" TEXT;
ALTER TABLE "Outbox" ADD COLUMN "delayMinutes" INTEGER;

