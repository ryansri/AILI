-- Written by hand as plain column additions: Prisma's version rebuilt the
-- Workspace table, which on a live database risks cascading deletes.

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "firstComment" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Post" ADD COLUMN "commentStatus" TEXT;
ALTER TABLE "Post" ADD COLUMN "commentAt" DATETIME;
ALTER TABLE "Post" ADD COLUMN "commentUrn" TEXT;
ALTER TABLE "Post" ADD COLUMN "commentError" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "firstCommentDelay" INTEGER NOT NULL DEFAULT 5;

-- CreateIndex
CREATE INDEX "Post_commentStatus_commentAt_idx" ON "Post"("commentStatus", "commentAt");
