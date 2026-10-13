import { describe, expect, it } from "vitest";
import { formatWhen, offsetLabel, parseWhen, toWallInput, wallTimeToDate, dayBounds } from "./time-zone";

describe("time zones", () => {
  it("reads a clock time in the user's zone", () => {
    // Sydney is UTC+10 on 30 Sep 2026 until daylight saving starts on 4 Oct.
    expect(wallTimeToDate("2026-09-30T09:00", "Australia/Sydney")?.toISOString()).toBe("2026-09-29T23:00:00.000Z");
    expect(wallTimeToDate("2026-10-05T09:00", "Australia/Sydney")?.toISOString()).toBe("2026-10-04T22:00:00.000Z");
  });

  it("keeps an exact time with an offset", () => {
    expect(parseWhen("2026-09-30T09:00:00+10:00", "America/New_York")?.toISOString()).toBe("2026-09-29T23:00:00.000Z");
    expect(parseWhen("2026-09-30T09:00:00Z", "Australia/Sydney")?.toISOString()).toBe("2026-09-30T09:00:00.000Z");
  });

  it("rejects what is not a time", () => {
    expect(parseWhen("next tuesday", "UTC")).toBeNull();
    expect(parseWhen("2026-09-30", "UTC")).toBeNull();
  });

  it("formats for people and for the time picker", () => {
    const d = new Date("2026-09-29T23:00:00Z");
    expect(formatWhen(d, "Australia/Sydney")).toBe("Wed 30 Sep, 9:00 am");
    expect(formatWhen(new Date("2026-09-30T04:30:00Z"), "Australia/Sydney")).toBe("Wed 30 Sep, 2:30 pm");
    expect(offsetLabel(d, "Australia/Sydney")).toBe("UTC+10:00");
    expect(toWallInput(d, "Australia/Sydney")).toBe("2026-09-30T09:00");
  });
});

describe("dayBounds", () => {
  it("runs midnight to midnight where you are, not on the server's UTC day", () => {
    // 10:55 am in Sydney is 11:55 pm the day before in UTC.
    const at = new Date("2026-10-13T23:55:00Z");
    const { start, end } = dayBounds(at, "Australia/Sydney");
    expect(start.toISOString()).toBe("2026-10-13T13:00:00.000Z"); // Wed 14 Oct, 00:00 in Sydney
    expect(end.toISOString()).toBe("2026-10-14T13:00:00.000Z");
    // Across the daylight saving change (4 Oct 2026 in Sydney) a day is 23 hours.
    const dst = dayBounds(new Date("2026-10-04T05:00:00Z"), "Australia/Sydney");
    expect((dst.end.getTime() - dst.start.getTime()) / 3_600_000).toBe(23);
  });
});
