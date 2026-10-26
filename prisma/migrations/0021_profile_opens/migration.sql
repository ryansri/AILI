-- AlterTable
ALTER TABLE "Person" ADD COLUMN "profileOpenedAt" DATETIME;
ALTER TABLE "Workspace" ADD COLUMN "profilesPerHour" INTEGER NOT NULL DEFAULT 20;
