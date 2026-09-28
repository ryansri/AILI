import { describe, expect, it } from "vitest";
import { formatWhen, offsetLabel, parseWhen, toWallInput, wallTimeToDate } from "./time-zone";

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
