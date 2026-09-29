import { describe, expect, it } from "vitest";
import { planScore } from "./plan-score";

const row = (day: string, status: "posted" | "missed" | "scheduled" | "planned" | "skipped", late = false) => ({ day, status, late });

describe("planScore", () => {
  const today = "2026-09-29";

  it("counts this month's rows that went out on their day", () => {
    const s = planScore(
      [
        row("2026-08-31", "posted"),
        row("2026-09-01", "posted"),
        row("2026-09-02", "missed"),
        row("2026-09-03", "posted", true),
        row("2026-09-04", "posted"),
        row("2026-09-05", "skipped"),
        row("2026-09-29", "scheduled"),
        row("2026-09-30", "planned"),
      ],
      today,
    );
    expect(s.onTime).toBe(2);
    expect(s.due).toBe(4);
  });

  it("keeps the streak and the best run, with late counting as a miss", () => {
    const s = planScore(
      [
        row("2026-09-01", "posted"),
        row("2026-09-02", "posted"),
        row("2026-09-03", "posted"),
        row("2026-09-04", "posted", true),
        row("2026-09-05", "posted"),
        row("2026-09-06", "posted"),
      ],
      today,
    );
    expect(s.streak).toBe(2);
    expect(s.best).toBe(3);
    expect(s.recent).toEqual(["ok", "ok", "ok", "bad", "ok", "ok"]);
  });

  it("counts today only once it is out", () => {
    expect(planScore([row(today, "scheduled")], today).due).toBe(0);
    expect(planScore([row(today, "posted")], today)).toMatchObject({ due: 1, onTime: 1, streak: 1 });
  });
});
