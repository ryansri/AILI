-- The content plan becomes rows the user brings in (PlanEntry). Saved ideas
-- become plan rows without a day; posts put in a plan day become rows linked
-- to them. The rhythm and ideas tables go.

-- CreateTable
CREATE TABLE "PlanEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "day" TEXT,
    "time" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'post',
    "topic" TEXT NOT NULL,
    "pillar" TEXT NOT NULL DEFAULT '',
    "goal" TEXT NOT NULL DEFAULT '',
    "hook" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "postId" TEXT,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "postedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'AILI',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanEntry_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanEntry_postId_key" ON "PlanEntry"("postId");

-- CreateIndex
CREATE INDEX "PlanEntry_workspaceId_day_idx" ON "PlanEntry"("workspaceId", "day");

-- Ideas become rows with no day yet.
INSERT INTO "PlanEntry" ("id", "workspaceId", "kind", "topic", "source", "createdAt", "updatedAt")
SELECT "id", "workspaceId", "kind", "text", "source", "createdAt", CURRENT_TIMESTAMP FROM "Idea";

-- Posts and articles put in a plan day keep their place.
INSERT INTO "PlanEntry" ("id", "workspaceId", "day", "kind", "topic", "postId", "source", "createdAt", "updatedAt")
SELECT 'p' || lower(hex(randomblob(12))), "workspaceId", "slotDay", "kind",
       CASE
         WHEN "kind" = 'article' AND "title" <> '' THEN "title"
         WHEN instr("body", char(10)) > 0 THEN substr("body", 1, min(instr("body", char(10)) - 1, 200))
         ELSE substr("body", 1, 200)
       END,
       "id", "source", "createdAt", CURRENT_TIMESTAMP
FROM "Post" WHERE "slotDay" IS NOT NULL;

-- DropTable
DROP TABLE "Idea";

-- DropTable
DROP TABLE "Rhythm";
