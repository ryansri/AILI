import { describe, expect, it } from "vitest";
import {
  addDays,
  countStatuses,
  entryState,
  mondayOf,
  needsYou,
  onTimeSoFar,
  pillarBalance,
  pillarColours,
  planSpan,
  realDay,
  rhythmDays,
  statusLabel,
  weekday,
  type EntryFacts,
  type EntryPost,
  type PlanClock,
} from "./plan";

const TZ = "Australia/Sydney";
// Monday 28 Sep 2026 in Sydney, warnings 3 days ahead.
const CLOCK: PlanClock = { today: "2026-09-28", warnDays: 3, timeZone: TZ };

const post = (over: Partial<EntryPost>): EntryPost => ({ id: "p", status: "draft", title: "", body: "Text", ...over });
const row = (over: Partial<EntryFacts>): EntryFacts => ({ kind: "post", skipped: false, ...over });

describe("days", () => {
  it("knows weekdays, Mondays and real days", () => {
    expect(weekday("2026-09-28")).toBe(1);
    expect(weekday("2026-10-04")).toBe(7);
    expect(mondayOf("2026-10-02")).toBe("2026-09-28");
    expect(addDays("2026-09-30", 2)).toBe("2026-10-02");
    expect(realDay("2026-02-29")).toBe(false);
    expect(realDay("2028-02-29")).toBe(true);
  });
});

describe("a row's status", () => {
  it("is planned, and needs writing once its day is within the warning window", () => {
    expect(entryState(row({ day: "2026-10-05" }), CLOCK)).toEqual({ status: "planned", due: false, late: false });
    expect(entryState(row({ day: "2026-10-01" }), CLOCK)).toMatchObject({ status: "planned", due: true });
    expect(entryState(row({ day: "2026-09-28" }), CLOCK)).toMatchObject({ status: "planned", due: true });
    // Warnings off.
    expect(entryState(row({ day: "2026-09-29" }), { ...CLOCK, warnDays: 0 })).toMatchObject({ due: false });
    // No day yet.
    expect(entryState(row({}), CLOCK)).toMatchObject({ status: "planned", due: false });
  });

  it("is written once its post has text; a post due soon is not scheduled yet", () => {
    expect(entryState(row({ day: "2026-10-10", post: post({}) }), CLOCK)).toMatchObject({ status: "written", due: false });
    const soon = entryState(row({ day: "2026-09-30", post: post({}) }), CLOCK);
    expect(soon).toMatchObject({ status: "written", due: true });
    expect(statusLabel("post", soon)).toBe("Not scheduled");
    // An empty draft is still only planned.
    expect(entryState(row({ day: "2026-10-10", post: post({ body: "  " }) }), CLOCK)).toMatchObject({ status: "planned" });
  });

  it("does not nag about an article, which the user publishes in LinkedIn", () => {
    const a = entryState(row({ kind: "article", day: "2026-09-29", post: post({ title: "T", body: "Long" }) }), CLOCK);
    expect(a).toMatchObject({ status: "written", due: false });
    expect(statusLabel("article", a)).toBe("Written, publish in LinkedIn");
  });

  it("is scheduled while its post waits to go out", () => {
    const s = entryState(row({ day: "2026-09-29", post: post({ status: "scheduled", scheduledAt: "2026-09-28T23:00:00Z" }) }), CLOCK);
    expect(s).toEqual({ status: "scheduled", due: false, late: false });
  });

  it("is posted when published, late when it went out after its day", () => {
    // 9:00 on Tue 29 Sep in Sydney.
    const onTime = row({ day: "2026-09-29", post: post({ status: "published", publishedAt: "2026-09-28T23:00:00Z" }) });
    expect(entryState(onTime, CLOCK)).toEqual({ status: "posted", due: false, late: false });
    // 8:00 on Wed 30 Sep in Sydney, though still 29 Sep in UTC.
    const late = row({ day: "2026-09-29", post: post({ status: "published", publishedAt: "2026-09-29T22:00:00Z" }) });
    expect(entryState(late, CLOCK)).toMatchObject({ status: "posted", late: true });
    expect(statusLabel("post", entryState(late, CLOCK))).toBe("Posted late");
  });

  it("is posted when marked by hand, even with nothing written in AILI", () => {
    expect(entryState(row({ day: "2026-09-25", postedAt: "2026-09-25T01:00:00Z" }), CLOCK)).toMatchObject({ status: "posted", late: false });
  });

  it("is missed once its day passed with nothing out, unless skipped", () => {
    expect(entryState(row({ day: "2026-09-27" }), CLOCK)).toMatchObject({ status: "missed" });
    expect(entryState(row({ day: "2026-09-27", post: post({ status: "failed" }) }), CLOCK)).toMatchObject({ status: "missed" });
    expect(entryState(row({ day: "2026-09-27", skipped: true }), CLOCK)).toMatchObject({ status: "skipped" });
  });
});

describe("the plan as a whole", () => {
  const rows = [
    { day: "2026-09-22", pillar: "Sales", kind: "post" as const, status: "posted" as const, due: false, late: false },
    { day: "2026-09-23", pillar: "Story", kind: "post" as const, status: "posted" as const, due: false, late: true },
    { day: "2026-09-24", pillar: "Sales", kind: "post" as const, status: "missed" as const, due: false, late: false },
    { day: "2026-09-01", pillar: "Sales", kind: "post" as const, status: "missed" as const, due: false, late: false },
    { day: "2026-09-25", pillar: "", kind: "post" as const, status: "skipped" as const, due: false, late: false },
    { day: "2026-09-28", pillar: "Wins", kind: "post" as const, status: "scheduled" as const, due: false, late: false },
    { day: "2026-09-30", pillar: "Wins", kind: "post" as const, status: "written" as const, due: true, late: false },
    { day: "2026-10-01", pillar: "Sales", kind: "post" as const, status: "planned" as const, due: true, late: false },
    { day: "2026-09-29", pillar: "Story", kind: "article" as const, status: "planned" as const, due: true, late: false },
    { day: "2026-10-20", pillar: "Story", kind: "post" as const, status: "planned" as const, due: false, late: false },
    { pillar: "Sales", kind: "post" as const, status: "planned" as const, due: false, late: false },
  ];

  it("counts statuses of rows with a day", () => {
    expect(countStatuses(rows)).toEqual({ posted: 2, missed: 2, scheduled: 1, written: 1, planned: 3, skipped: 1, total: 9 });
  });

  it("knows the span and which day of it today is", () => {
    expect(planSpan(rows, "2026-09-28")).toEqual({ first: "2026-09-01", last: "2026-10-20", length: 50, dayOf: 28 });
    expect(planSpan(rows, "2026-08-01")?.dayOf).toBe(0);
    expect(planSpan([], "2026-09-28")).toBeNull();
  });

  it("counts what went out on its day, not holding today's scheduled one against it", () => {
    expect(onTimeSoFar(rows, "2026-09-28")).toEqual({ onTime: 1, due: 4 });
  });

  it("spreads rows over pillars", () => {
    const b = pillarBalance(rows);
    expect(b.map((x) => [x.pillar, x.count])).toEqual([
      ["Sales", 4],
      ["Story", 3],
      ["Wins", 2],
    ]);
    expect(b[0].share).toBeCloseTo(4 / 9);
    const c = pillarColours(["Wins", "Sales", "Story", "Sales"]);
    expect(c).toEqual({ Sales: "blue", Story: "violet", Wins: "emerald" });
  });

  it("lists what needs the user: recent misses, then things to write and schedule", () => {
    const n = needsYou(rows, "2026-09-28");
    // The miss on 1 Sep is too old to nag about.
    expect(n.missed.map((r) => r.day)).toEqual(["2026-09-24"]);
    expect(n.toWrite.map((r) => r.day)).toEqual(["2026-09-29", "2026-10-01"]);
    expect(n.toSchedule.map((r) => r.day)).toEqual(["2026-09-30"]);
  });

  it("turns a weekly rhythm into days", () => {
    expect(rhythmDays("2026-09-30", 2, [2, 4])).toEqual(["2026-10-01", "2026-10-06", "2026-10-08"]);
    expect(rhythmDays("2026-09-28", 4, [5], 2)).toEqual(["2026-10-02", "2026-10-16"]);
  });
});
