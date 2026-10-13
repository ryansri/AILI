import { describe, expect, it } from "vitest";
import { buildProgress, funnelOf, previousSpan, spanFor, type Events } from "./progress";
import { wallTimeToDate } from "./time-zone";

const TZ = "Australia/Sydney";
const t = (wall: string) => wallTimeToDate(wall, TZ)!;
const empty = (): Events => ({ posts: [], requests: [], messagesOut: [], messagesIn: [], firstIn: [], accepted: [], comments: [], stages: [] });
const goals = { posts: 5, requests: 50, messages: 30, comments: 15 };
// Thursday 15 Oct 2026, 3 pm in Sydney.
const now = t("2026-10-15T15:00");

describe("spans", () => {
  it("runs Monday to Sunday and month to month, where you are", () => {
    const week = spanFor("week", now, TZ);
    expect([week.first, week.last, week.label]).toEqual(["2026-10-12", "2026-10-18", "Mon 12 – Sun 18 Oct"]);
    expect(week.start.getTime()).toBe(t("2026-10-12T00:00").getTime());
    expect(previousSpan(week, TZ).label).toBe("Mon 5 – Sun 11 Oct");
    expect(spanFor("week", t("2026-10-01T10:00"), TZ).label).toBe("Mon 28 Sep – Sun 4 Oct");
    const month = spanFor("month", now, TZ);
    expect([month.first, month.last, month.label]).toEqual(["2026-10-01", "2026-10-31", "October"]);
    expect(previousSpan(month, TZ).label).toBe("September");
  });
});

describe("buildProgress", () => {
  it("counts the week, compares with the same point last week, and says it plainly", () => {
    const e = empty();
    e.messagesOut = Array.from({ length: 30 }, (_, i) => ({ at: t(`2026-10-1${2 + (i % 3)}T10:00`), personId: `p${i % 12}` }));
    e.messagesOut.push({ at: t("2026-10-06T10:00"), personId: "old" }); // last Tuesday: before this point last week
    e.messagesOut.push({ at: t("2026-10-10T10:00"), personId: "old" }); // last Saturday: after it
    e.requests = Array.from({ length: 12 }, () => t("2026-10-13T09:00"));
    e.posts = [t("2026-10-12T08:00"), t("2026-10-14T08:00")];
    e.messagesIn = [
      { at: t("2026-10-14T11:00"), personId: "p1", name: "Priya Kaur", body: "What does a pilot look like?" },
      { at: t("2026-10-14T12:00"), personId: "p1", name: "Priya Kaur", body: "And the price?" },
    ];
    e.accepted = [{ at: t("2026-10-13T16:00"), personId: "p9", name: "Amy Locke" }];
    e.stages = [{ at: t("2026-10-15T09:00"), personId: "p3", name: "Simon Joyce", stage: "call" }];
    const p = buildProgress({ period: "week", now, timeZone: TZ, events: e, goals, plannedLeft: 2 });

    expect(p.counts).toMatchObject({ messages: 30, requests: 12, posts: 2, replied: 1, accepted: 1, calls: 1, messaged: 12 });
    expect(p.before.messages).toBe(1);
    const g = Object.fromEntries(p.goals.map((x) => [x.key, x]));
    expect(g.messages).toMatchObject({ state: "met", note: "Goal met · +29 vs this time last week" });
    expect(g.requests.state).toBe("behind");
    expect(p.daysLeft).toBe(3);
    expect(p.buckets.map((b) => b.messages)).toEqual([10, 10, 10, 0, 0, 0, 0]);
    expect(p.buckets.map((b) => b.future)).toEqual([false, false, false, false, true, true, true]);
    expect(p.wins.map((w) => w.kind)).toEqual(["call", "reply", "accepted"]);
    expect(p.wins[1].text).toBe("Priya Kaur: And the price?");
    expect(p.recap.title).toBe("Your week so far");
    expect(p.recap.text).toBe(
      "Goal met for messages (30). Behind on connection requests (12 of 50) and comments on leads' posts (0 of 15), with 3 days left. " +
        "On track for posts. 2 more posts planned. 1 person wrote back, 1 more than this time last week. 1 request accepted. Simon Joyce booked a call.",
    );
  });

  it("calls it your week from Friday afternoon, and is kind to an empty one", () => {
    const friday = t("2026-10-16T14:00");
    const p = buildProgress({ period: "week", now: friday, timeZone: TZ, events: empty(), goals, plannedLeft: 0 });
    expect(p.recap.title).toBe("Your week");
    expect(p.recap.text).toMatch(/^Nothing yet this week/);
  });

  it("scales goals to the month and says when it is behind for the time gone", () => {
    const e = empty();
    e.requests = Array.from({ length: 61 }, () => t("2026-10-05T09:00"));
    const p = buildProgress({ period: "month", now, timeZone: TZ, events: e, goals, plannedLeft: 0 });
    const req = p.goals.find((g) => g.key === "requests")!;
    expect(req.goal).toBe(221); // 50 a week, 31 days
    expect(req.state).toBe("behind");
    expect(req.note).toMatch(/^Behind: 28% with 4\d% of the month gone$/);
    expect(p.buckets.map((b) => b.label)).toEqual(["28 Sep", "5 Oct", "12 Oct", "19 Oct", "26 Oct"]);
    expect(p.buckets.map((b) => b.requests)).toEqual([0, 61, 0, 0, 0]);
    expect(p.recap.title).toBe("October so far");
  });

  it("hides a goal set to 0", () => {
    const p = buildProgress({ period: "week", now, timeZone: TZ, events: empty(), goals: { ...goals, comments: 0 }, plannedLeft: 0 });
    expect(p.goals.map((g) => g.key)).toEqual(["posts", "requests", "messages"]);
  });
});

describe("funnelOf", () => {
  it("counts how far each person got", () => {
    const f = funnelOf([
      { accepted: true, messaged: true, replied: true, stage: "call" },
      { accepted: true, messaged: true, replied: false, stage: "connected" },
      { accepted: false, messaged: false, replied: false, stage: "requested" },
      { accepted: true, messaged: true, replied: true, stage: "won" },
    ]);
    expect(f).toEqual({ sent: 4, accepted: 3, messaged: 3, replied: 2, calls: 2, deals: 1 });
  });
});
