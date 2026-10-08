import { describe, expect, it } from "vitest";
import { lastWeekRows, moveDayFor, weekSquares } from "./plan-weeks";
import type { EntryStatus } from "./plan";

const row = (id: string, day: string, status: EntryStatus, channel = "Personal") => ({ id, day, status, channel });
// Thu 8 Oct 2026; last week is Mon 28 Sep to Sun 4 Oct.
const today = "2026-10-08";

describe("weekSquares", () => {
  it("one square per post in day order, with what went out", () => {
    const w = weekSquares([row("c", "2026-10-02", "missed"), row("a", "2026-09-28", "posted"), row("b", "2026-09-30", "skipped")]);
    expect(w.squares).toEqual(["ok", "skipped", "missed"]);
    expect(w).toMatchObject({ out: 1, live: 2, missed: 1, skipped: 1 });
  });
});

describe("lastWeekRows", () => {
  it("is Monday to Sunday before this week", () => {
    const rows = [row("a", "2026-09-27", "posted"), row("b", "2026-09-28", "posted"), row("c", "2026-10-04", "missed"), row("d", "2026-10-05", "planned")];
    expect(lastWeekRows(rows, today).map((r) => r.id)).toEqual(["b", "c"]);
  });
});

describe("moveDayFor", () => {
  it("picks the first free day on that page from today, else today", () => {
    const missed = row("m", "2026-09-29", "missed", "Company");
    const rows = [missed, row("x", "2026-10-08", "planned", "Company"), row("y", "2026-10-09", "planned", "Personal")];
    expect(moveDayFor(missed, rows, today)).toBe("2026-10-09");
    const full = ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"].map((d, i) => row(`f${i}`, d, "planned", "Company"));
    expect(moveDayFor(missed, [missed, ...full], today)).toBe(today);
  });
});
