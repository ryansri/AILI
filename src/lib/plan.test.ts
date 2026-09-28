import { describe, expect, it } from "vitest";
import {
  addDays,
  buildPlan,
  mondayOf,
  onTimeShare,
  runwayOf,
  slotsBetween,
  streakOf,
  weekStats,
  weekday,
  type PlanItem,
  type RhythmRule,
} from "./plan";

const TZ = "Australia/Sydney";
const posts: RhythmRule = { kind: "post", days: [2, 3, 4], time: "09:00", everyWeeks: 1, anchor: "2026-09-28", enabled: true };
const articles: RhythmRule = { kind: "article", days: [5], time: "10:00", everyWeeks: 2, anchor: "2026-09-28", enabled: true };
// Monday 28 Sep 2026, 8:00 in Sydney.
const NOW = new Date("2026-09-27T22:00:00Z");

const item = (over: Partial<PlanItem> & Pick<PlanItem, "id">): PlanItem => ({
  kind: "post",
  status: "draft",
  title: "",
  body: "x",
  ...over,
});

describe("days", () => {
  it("knows weekdays and Mondays", () => {
    expect(weekday("2026-09-28")).toBe(1);
    expect(weekday("2026-10-04")).toBe(7);
    expect(mondayOf("2026-10-02")).toBe("2026-09-28");
    expect(addDays("2026-09-30", 2)).toBe("2026-10-02");
  });
});

describe("slots", () => {
  it("turns the rhythm into slots in the user's time zone", () => {
    const slots = slotsBetween([posts, articles], "2026-09-28", "2026-10-11", TZ);
    expect(slots.map((s) => `${s.kind}:${s.day}`)).toEqual([
      "post:2026-09-29",
      "post:2026-09-30",
      "post:2026-10-01",
      "article:2026-10-02",
      "post:2026-10-06",
      "post:2026-10-07",
      "post:2026-10-08",
      // No article on 9 Oct: every other week.
    ]);
    // 9:00 in Sydney (UTC+10 until 4 Oct).
    expect(slots[0].at).toBe("2026-09-28T23:00:00.000Z");
    // After daylight saving starts on 4 Oct, 9:00 is UTC+11.
    expect(slots[4].at).toBe("2026-10-05T22:00:00.000Z");
  });

  it("ignores a rule that is switched off", () => {
    expect(slotsBetween([{ ...posts, enabled: false }], "2026-09-28", "2026-10-04", TZ)).toEqual([]);
  });
});

describe("plan", () => {
  const items = [
    item({ id: "a", status: "published", scheduledAt: "2026-09-21T23:00:00Z", publishedAt: "2026-09-21T23:00:05Z", slotDay: "2026-09-22" }),
    item({ id: "b", status: "published", slotDay: "2026-09-23", publishedAt: "2026-09-24T01:00:00Z" }),
    item({ id: "c", status: "scheduled", scheduledAt: "2026-09-28T23:00:00Z" }),
    item({ id: "d", status: "draft", slotDay: "2026-09-30" }),
    item({ id: "e", kind: "article", status: "draft", slotDay: "2026-10-02" }),
    item({ id: "f", status: "published", publishedAt: "2026-09-27T02:00:00Z" }),
  ];
  const plan = buildPlan([posts, articles], items, "2026-09-21", "2026-10-04", TZ, NOW);
  const state = (day: string, kind = "post") => plan.slots.find((s) => s.day === day && s.kind === kind);

  it("gives every slot one state", () => {
    expect(state("2026-09-22")).toMatchObject({ state: "published", late: false });
    expect(state("2026-09-23")).toMatchObject({ state: "published", late: true });
    expect(state("2026-09-24")?.state).toBe("missed");
    expect(state("2026-09-29")?.state).toBe("scheduled");
    expect(state("2026-09-30")?.state).toBe("draft");
    expect(state("2026-10-01")?.state).toBe("empty");
    expect(state("2026-10-02", "article")?.state).toBe("draft");
  });

  it("keeps posts no slot asked for as extras", () => {
    expect(plan.extra.map((i) => i.id)).toEqual(["f"]);
  });

  it("measures runway to the first slot that needs work", () => {
    const upcoming = plan.slots.filter((s) => s.day >= "2026-09-28");
    const runway = runwayOf(upcoming, "2026-09-28", "2026-10-04", NOW);
    // Tue is scheduled, Wed is only a draft: covered until Tuesday.
    expect(runway).toMatchObject({ until: "2026-09-29", days: 2, complete: false });
    expect(runway.next?.day).toBe("2026-09-30");
  });

  it("says when today's slot is already open", () => {
    const open = buildPlan([posts], [], "2026-09-29", "2026-10-04", TZ, new Date("2026-09-28T20:00:00Z"));
    expect(runwayOf(open.slots, "2026-09-29", "2026-10-04", new Date("2026-09-28T20:00:00Z"))).toMatchObject({ until: null, days: 0 });
  });

  it("counts weeks, the streak and on-time share", () => {
    const stats = weekStats(plan, ["2026-09-21", "2026-09-28"], TZ);
    expect(stats[0]).toMatchObject({ planned: 3, onTime: 1, late: 1, missed: 1, extra: 1 });
    expect(stats[1]).toMatchObject({ planned: 4, scheduled: 2 });
    // Last week: 3 planned, 2 in slots plus 1 extra went out.
    expect(streakOf(stats)).toBe(1);
    expect(onTimeShare(stats)).toBeCloseTo(1 / 3);
  });

  it("breaks the streak on a short week", () => {
    const short = [
      { week: "a", planned: 3, onTime: 3, late: 0, missed: 0, scheduled: 0, extra: 0 },
      { week: "b", planned: 3, onTime: 1, late: 0, missed: 2, scheduled: 0, extra: 0 },
      { week: "c", planned: 3, onTime: 3, late: 0, missed: 0, scheduled: 0, extra: 0 },
      { week: "now", planned: 3, onTime: 0, late: 0, missed: 0, scheduled: 3, extra: 0 },
    ];
    expect(streakOf(short)).toBe(1);
  });
});
