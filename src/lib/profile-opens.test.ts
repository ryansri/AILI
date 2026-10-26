import { describe, expect, it } from "vitest";
import { openedLabel, openedState, profilePace, validProfilesPerHour } from "./profile-opens";

const TZ = "Australia/Sydney";
// Mon 26 Oct 2026, 11:00 am in Sydney (UTC+11).
const now = new Date("2026-10-26T00:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000);

describe("opened dots", () => {
  it("is blue today where you are, grey for 7 days, then gone", () => {
    expect(openedState(ago(30), TZ, now)).toBe("today");
    // 10:30 pm yesterday in Sydney: yesterday, even though it is the same UTC day.
    expect(openedState(new Date("2026-10-25T11:30:00Z"), TZ, now)).toBe("week");
    expect(openedState(ago(6 * 24 * 60), TZ, now)).toBe("week");
    expect(openedState(ago(8 * 24 * 60), TZ, now)).toBeNull();
    expect(openedState(undefined, TZ, now)).toBeNull();
  });

  it("says when", () => {
    expect(openedLabel(ago(55), TZ, now)).toBe("Opened today, 10:05 am");
    expect(openedLabel(ago(2 * 24 * 60), TZ, now)).toBe("Opened Sat 24 Oct");
  });
});

describe("profile pace", () => {
  it("counts today and the last hour", () => {
    const pace = profilePace([ago(5), ago(50), ago(90), ago(300)], 20, TZ, now);
    expect(pace).toEqual({ perHour: 20, today: 4, lastHour: 2 });
  });

  it("at the hourly number, says when the next one can start", () => {
    const times = [ago(50), ago(40), ago(30), ago(10)];
    const pace = profilePace(times, 3, TZ, now);
    expect(pace.lastHour).toBe(4);
    // Three of the last hour's opens must age out: the second oldest, 40 min ago, does at 20 min from now.
    expect(pace.nextAt).toBe(new Date(now.getTime() + 20 * 60_000).toISOString());
    expect(profilePace(times.slice(0, 2), 3, TZ, now).nextAt).toBeUndefined();
  });

  it("keeps the hourly number sensible", () => {
    expect(validProfilesPerHour(15)).toBe(15);
    expect(validProfilesPerHour(0)).toBe(1);
    expect(validProfilesPerHour(500)).toBe(60);
    expect(validProfilesPerHour("x")).toBe(20);
  });
});
