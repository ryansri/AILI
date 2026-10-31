import { describe, expect, it } from "vitest";
import { entryState } from "./plan";
import {
  buildWeek,
  channelLine,
  channelOf,
  DEFAULT_USUAL_WEEK,
  nextWeekReminder,
  parseUsualWeek,
  reminderText,
  rhythms,
  weekLabel,
  type DayItem,
  type SavedWeek,
} from "./posting-weeks";

const usual = DEFAULT_USUAL_WEEK; // Personal Mon–Wed, company page Tue, Thu, Fri
const since = "2026-11-02";
const live = (day: string, channel: DayItem["channel"] = "personal"): DayItem => ({ day, channel, state: "live", title: "Out" });
const sched = (day: string, channel: DayItem["channel"] = "personal"): DayItem => ({ day, channel, state: "scheduled", title: "Soon" });

describe("usual week", () => {
  it("falls back to the default for nothing or junk, and keeps good values", () => {
    expect(parseUsualWeek("")).toEqual(DEFAULT_USUAL_WEEK);
    expect(parseUsualWeek("{nope")).toEqual(DEFAULT_USUAL_WEEK);
    expect(parseUsualWeek(JSON.stringify({ personal: { days: [5, 1, 1, 9], time: "08:00" }, company: { days: [], time: "bad" } }))).toEqual({
      personal: { days: [1, 5], time: "08:00" },
      company: { days: [], time: "12:15" },
    });
  });

  it("reads a plan row's channel as profile or company page", () => {
    expect(channelOf("")).toBe("personal");
    expect(channelOf("Personal")).toBe("personal");
    expect(channelOf("Company page")).toBe("company");
    expect(channelOf("Newsletter")).toBeNull();
  });
});

describe("a week", () => {
  it("uses the usual week from the day it starts, and what went out before", () => {
    const before = buildWeek("2026-10-26", undefined, usual, since, ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"].map((d) => live(d)), "2026-10-31");
    expect(before.source).toBe("went out");
    expect(before.channels.personal.days).toEqual([1, 2, 3, 4, 5]);
    expect(before.when).toBe("this");
    expect(channelLine(before, "personal")).toEqual({ text: "5 of 5 out or scheduled ✓", tone: "good" });
    expect(before.channels.company.total).toBe(0);

    const next = buildWeek("2026-11-02", undefined, usual, since, [sched("2026-11-02"), sched("2026-11-03"), sched("2026-11-04")], "2026-10-31");
    expect(next.source).toBe("usual");
    expect(next.when).toBe("next");
    expect(channelLine(next, "personal")).toEqual({ text: "3 of 3 scheduled ✓", tone: "good" });
    expect(next.channels.company.slots.map((s) => s.state)).toEqual(["empty", "empty", "empty"]);
    expect(channelLine(next, "company")).toEqual({ text: "0 of 3 · 3 to go", tone: "warn" });
  });

  it("takes a week's own days and note, and shows an extra day that went out", () => {
    const saved: SavedWeek = { monday: "2026-11-16", personalDays: "1,2,3,4", companyDays: "2,4,5", note: "Lead magnet week", personalImpressions: null, companyImpressions: null };
    const w = buildWeek("2026-11-16", saved, usual, since, [live("2026-11-21")], "2026-11-23");
    expect(w.source).toBe("set");
    expect(w.note).toBe("Lead magnet week");
    expect(w.channels.personal.total).toBe(4);
    const sat = w.channels.personal.slots.find((s) => s.day === "2026-11-21")!;
    expect(sat).toMatchObject({ planned: false, state: "live" });
    // Past, nothing went out on the 4 planned days: all missed; the Saturday extra doesn't count toward the 4.
    expect(w.channels.personal.done).toBe(0);
    expect(channelLine(w, "personal")).toEqual({ text: "0 of 4 went out", tone: "bad" });
  });

  it("marks a passed day with nothing out as missed, and a draft as written", () => {
    const w = buildWeek("2026-11-02", undefined, usual, since, [{ day: "2026-11-04", channel: "personal", state: "written", title: "Draft" }], "2026-11-03");
    expect(w.channels.personal.slots.map((s) => s.state)).toEqual(["missed", "empty", "written"]);
    expect(channelLine(w, "personal")).toEqual({ text: "0 of 3 · 1 missed · 2 to go", tone: "bad" });
  });
});

describe("the Friday reminder", () => {
  const next = buildWeek("2026-11-02", undefined, usual, since, [sched("2026-11-02"), sched("2026-11-03"), sched("2026-11-04")], "2026-10-30");
  it("waits for Friday, then names what next week still needs", () => {
    expect(nextWeekReminder(next, "2026-10-29")).toBeNull();
    const short = nextWeekReminder(next, "2026-10-30")!;
    expect(reminderText(short)).toBe("Next week: Company page 0 of 3 scheduled.");
  });
  it("says nothing once every day is scheduled", () => {
    const ready = buildWeek("2026-11-02", undefined, usual, since, [
      ...["2026-11-02", "2026-11-03", "2026-11-04"].map((d) => sched(d)),
      ...["2026-11-03", "2026-11-05", "2026-11-06"].map((d) => sched(d, "company")),
    ], "2026-10-31");
    expect(nextWeekReminder(ready, "2026-10-31")).toBeNull();
  });
});

describe("comparing rhythms", () => {
  it("groups past weeks by days a week and averages the impressions typed in", () => {
    const five = (monday: string, impressions: number | null) =>
      buildWeek(monday, { monday, personalDays: "1,2,3,4,5", companyDays: "", note: "", personalImpressions: impressions, companyImpressions: null }, usual, since, [], "2026-12-01");
    const three = buildWeek("2026-11-02", { monday: "2026-11-02", personalDays: "1,2,3", companyDays: "", note: "", personalImpressions: 900, companyImpressions: null }, usual, since, ["2026-11-02", "2026-11-03", "2026-11-04"].map((d) => live(d)), "2026-12-01");
    const r = rhythms([five("2026-10-19", 1000), five("2026-10-26", null), three]);
    expect(r).toEqual([
      expect.objectContaining({ channel: "personal", days: 3, weeks: 1, posts: 3, typed: 1, avgImpressions: 900, perPost: 300 }),
      expect.objectContaining({ channel: "personal", days: 5, weeks: 2, posts: 0, typed: 1, avgImpressions: 1000, perPost: null }),
    ]);
  });
});

describe("posted by hand", () => {
  const clock = { today: "2026-11-01", warnDays: 3, timeZone: "Australia/Sydney" };
  it("shows a company post scheduled on LinkedIn for a later day as scheduled, then posted", () => {
    const later = { day: "2026-11-05", kind: "post" as const, skipped: false, postedAt: "2026-11-05T01:15:00.000Z" };
    expect(entryState(later, clock).status).toBe("scheduled");
    expect(entryState(later, { ...clock, today: "2026-11-05" }).status).toBe("posted");
  });
});

it("labels a week", () => {
  expect(weekLabel("2026-10-26")).toBe("26 Oct – 1 Nov");
  expect(weekLabel("2026-11-02")).toBe("2 – 8 Nov");
});
