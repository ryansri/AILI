-- AlterTable (added columns, so the Workspace table is not rebuilt)
ALTER TABLE "Workspace" ADD COLUMN "goalPosts" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Workspace" ADD COLUMN "goalRequests" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "Workspace" ADD COLUMN "goalMessages" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Workspace" ADD COLUMN "goalComments" INTEGER NOT NULL DEFAULT 15;
