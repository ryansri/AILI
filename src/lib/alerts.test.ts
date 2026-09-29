import { describe, expect, it } from "vitest";
import { alertsQueue, nudgeDue, warmupOf } from "./alerts";
import type { Person } from "./types";

const TZ = "Australia/Sydney";
// 10:00 on Tue 29 Sep in Sydney.
const now = new Date("2026-09-29T00:00:00Z");

function person(id: string, over: Partial<Person> = {}): Person {
  return {
    id,
    name: id,
    headline: "",
    jobTitle: "",
    company: "",
    linkedinUrl: `https://www.linkedin.com/in/${id}`,
    source: "manual",
    stage: "warming",
    tagIds: [],
    notes: "",
    messages: [],
    pending: [],
    createdAt: "2026-09-01T00:00:00Z",
    ...over,
  };
}

describe("post alerts list", () => {
  it("puts decision makers first, then leads warming up, then the newest", () => {
    const q = alertsQueue(
      [
        person("coo", { jobTitle: "COO" }),
        person("ceo", { jobTitle: "CEO" }),
        person("talking", { jobTitle: "Owner", stage: "conversation" }),
        person("newer", { createdAt: "2026-09-20T00:00:00Z" }),
      ],
      5,
      TZ,
      now,
    );
    expect(q.next.map((p) => p.id)).toEqual(["ceo", "talking", "newer", "coo"]);
    expect(q.left).toBe(4);
  });

  it("counts today's done against the day's number, and leaves out done, later and others", () => {
    const q = alertsQueue(
      [
        person("done", { alerts: "on", alertsAt: "2026-09-28T23:30:00Z" }), // 9:30 today in Sydney
        person("yesterday", { alerts: "on", alertsAt: "2026-09-27T23:30:00Z" }),
        person("nobell", { alerts: "impossible", alertsAt: "2026-09-28T22:00:00Z" }),
        person("later", { alertsLaterAt: "2026-09-28T23:00:00Z" }),
        person("laterYesterday", { alertsLaterAt: "2026-09-27T23:00:00Z" }),
        person("other", { lead: false }),
        person("nolink", { linkedinUrl: "" }),
        person("a"),
        person("b"),
      ],
      4,
      TZ,
      now,
    );
    expect(q.doneToday.map((p) => p.id)).toEqual(["done", "nobell"]);
    // Two slots left today; Later from yesterday is back, Later from today is not.
    expect(q.next).toHaveLength(2);
    expect(q.next.map((p) => p.id)).not.toContain("later");
    expect(alertsQueue([person("laterYesterday", { alertsLaterAt: "2026-09-27T23:00:00Z" })], 4, TZ, now).next).toHaveLength(1);
    expect(q.left).toBe(4);
  });
});

describe("the morning reminder", () => {
  it("goes once a day, after 9 am where you are, when on", () => {
    expect(nudgeDue({ alertsNudge: true, alertsNudgedOn: null }, TZ, now)).toBe(true);
    expect(nudgeDue({ alertsNudge: true, alertsNudgedOn: "2026-09-29" }, TZ, now)).toBe(false);
    expect(nudgeDue({ alertsNudge: false, alertsNudgedOn: null }, TZ, now)).toBe(false);
    // 8:00 in Sydney.
    expect(nudgeDue({ alertsNudge: true, alertsNudgedOn: "2026-09-28" }, TZ, new Date("2026-09-28T22:00:00Z"))).toBe(false);
  });
});

describe("warm-up", () => {
  it("counts comments until it is time to connect", () => {
    expect(warmupOf(["a", "b"], 3)).toEqual({ count: 2, ready: false });
    expect(warmupOf(["a", "b", "c"], 3)).toEqual({ count: 3, ready: true });
    expect(warmupOf(undefined, 3)).toEqual({ count: 0, ready: false });
  });
});
