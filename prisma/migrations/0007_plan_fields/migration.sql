-- Channel, funnel, vertical and format become fields of a plan row (they were
-- kept in its notes). Rows imported before this get them from their notes the
-- next time the plan loads (see content-plan.ts).
ALTER TABLE "PlanEntry" ADD COLUMN "channel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PlanEntry" ADD COLUMN "funnel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PlanEntry" ADD COLUMN "vertical" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PlanEntry" ADD COLUMN "format" TEXT NOT NULL DEFAULT '';
