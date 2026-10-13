import { describe, expect, it } from "vitest";
import { isLate, schedulePresets, scheduleProblem, sendLabel, shortSendLabel, untilLabel } from "./schedule";
import { wallTimeToDate } from "./time-zone";

const TZ = "Australia/Sydney";
const at = (wall: string) => wallTimeToDate(wall, TZ)!;
// Tue 13 Oct 2026, 2:00 pm in Sydney.
const now = at("2026-10-13T14:00");

describe("scheduleProblem", () => {
  it("takes a time in the day, ahead of now", () => {
    expect(scheduleProblem(at("2026-10-14T09:00"), TZ, now)).toBeNull();
    expect(scheduleProblem(at("2026-10-14T20:59"), TZ, now)).toBeNull();
  });

  it("refuses night times, the past and far off", () => {
    expect(scheduleProblem(at("2026-10-14T06:30"), TZ, now)).toMatch(/7 am and 9 pm/);
    expect(scheduleProblem(at("2026-10-14T21:00"), TZ, now)).toMatch(/7 am and 9 pm/);
    expect(scheduleProblem(at("2026-10-13T13:00"), TZ, now)).toMatch(/from now/);
    expect(scheduleProblem(at("2027-01-20T09:00"), TZ, now)).toMatch(/next 60 days/);
    expect(scheduleProblem(new Date("nope"), TZ, now)).toMatch(/Pick a day/);
  });
});

describe("schedulePresets", () => {
  it("offers tomorrow and next Monday at 9 am where you are", () => {
    const [tomorrow, monday] = schedulePresets(TZ, now);
    expect(sendLabel(tomorrow.at, TZ)).toBe("Wed 14 Oct, 9:00 am");
    expect(sendLabel(monday.at, TZ)).toBe("Mon 19 Oct, 9:00 am");
  });

  it("skips to the Monday after when tomorrow is Monday", () => {
    const sunday = at("2026-10-18T10:00");
    expect(sendLabel(schedulePresets(TZ, sunday)[1].at, TZ)).toBe("Mon 26 Oct, 9:00 am");
    const monday = at("2026-10-19T10:00");
    expect(sendLabel(schedulePresets(TZ, monday)[1].at, TZ)).toBe("Mon 26 Oct, 9:00 am");
  });
});

describe("timing", () => {
  it("is late two hours past its time", () => {
    expect(isLate(at("2026-10-13T12:30"), now)).toBe(false);
    expect(isLate(at("2026-10-13T11:30"), now)).toBe(true);
  });

  it("labels the list short within the week", () => {
    expect(shortSendLabel(at("2026-10-14T09:00"), TZ, now)).toBe("Wed 9:00 am");
    expect(shortSendLabel(at("2026-10-28T09:00"), TZ, now)).toBe("Wed 28 Oct");
  });
});

describe("untilLabel", () => {
  it("counts down in plain words", () => {
    const t = new Date("2026-10-13T03:00:00Z");
    const at = (ms: number) => new Date(t.getTime() + ms);
    expect(untilLabel(at(5 * 60_000), t)).toBe("in 5 min");
    expect(untilLabel(at(90_000), t)).toBe("in 2 min");
    expect(untilLabel(at(61_000), t)).toBe("in 2 min");
    expect(untilLabel(at(60_000), t)).toBe("in 1 min");
    expect(untilLabel(at(20_000), t)).toBe("in under a minute");
    expect(untilLabel(at(-5_000), t)).toBe("any moment now");
    expect(untilLabel(at(3 * 3_600_000), t)).toBe("in 3 h");
    expect(untilLabel(at(2 * 86_400_000), t)).toBeNull();
  });
});
