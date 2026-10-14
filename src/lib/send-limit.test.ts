import { describe, expect, it } from "vitest";
import { ceilingFor, countUsage, isReplyAt, limitProblem } from "./send-limit";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-14T01:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("replies to people who wrote back", () => {
  it("is a reply when they wrote in the last 14 days, before it", () => {
    expect(isReplyAt([ago(3 * DAY)], now)).toBe(true);
    expect(isReplyAt([ago(15 * DAY)], now)).toBe(false);
    expect(isReplyAt([new Date(now.getTime() + 60_000)], now)).toBe(false);
    expect(isReplyAt([], now)).toBe(false);
  });

  it("splits a day's messages into new ones and replies", () => {
    const used = countUsage(
      [
        { personId: "a", at: now },
        { personId: "a", at: now },
        { personId: "b", at: now },
        { personId: "c", at: ago(60 * 60_000) },
      ],
      [
        { personId: "a", at: ago(DAY) },
        // c wrote after the message to them: that one was new.
        { personId: "c", at: ago(30 * 60_000) },
      ],
    );
    expect(used).toEqual({ fresh: 2, replies: 2, total: 4 });
  });
});

describe("the daily cap", () => {
  it("stops new messages at the cap but lets replies through", () => {
    const used = { fresh: 20, replies: 5, total: 25 };
    expect(limitProblem(used, 1, false, 20)).toMatch(/Daily cap of 20 new messages reached/);
    expect(limitProblem(used, 1, true, 20)).toBeNull();
    expect(limitProblem({ fresh: 19, replies: 0, total: 19 }, 1, false, 20)).toBeNull();
    // A sequence of 3 needs room for all 3.
    expect(limitProblem({ fresh: 18, replies: 0, total: 18 }, 3, false, 20)).not.toBeNull();
  });

  it("stops everything, replies too, at the ceiling", () => {
    expect(ceilingFor(20)).toBe(60);
    expect(ceilingFor(80)).toBe(80);
    expect(limitProblem({ fresh: 20, replies: 40, total: 60 }, 1, true, 20)).toMatch(/60 messages today/);
    expect(limitProblem({ fresh: 10, replies: 49, total: 59 }, 1, true, 20)).toBeNull();
  });

  it("says pick another day when scheduling", () => {
    expect(limitProblem({ fresh: 20, replies: 0, total: 20 }, 1, false, 20, true)).toMatch(/Pick another day/);
  });
});
