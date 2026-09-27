import { describe, expect, it } from "vitest";
import { syncLine } from "./sync-status";
import type { HelperStatus } from "./types";

const now = new Date("2026-09-27T10:00:00Z");
const base: HelperStatus = {
  connected: true,
  state: "ok",
  lastSeenAt: new Date(now.getTime() - 60_000).toISOString(),
  outdated: false,
  importing: false,
  imported: 0,
};

describe("syncLine", () => {
  it("is grey before the helper has ever checked in", () => {
    expect(syncLine({ ...base, lastSeenAt: undefined, state: "never" }, now)).toMatchObject({ tone: "off", title: "Not syncing." });
  });

  it("is quiet when all is well", () => {
    expect(syncLine(base, now)).toEqual({ tone: "ok", title: "Synced 1m ago" });
  });

  it("shows the import count while importing", () => {
    expect(syncLine({ ...base, importing: true, imported: 45 }, now)).toEqual({ tone: "busy", title: "Importing", detail: "45 so far" });
  });

  it("says sync stopped when the helper has gone quiet", () => {
    const line = syncLine({ ...base, lastSeenAt: new Date(now.getTime() - 12 * 60_000).toISOString() }, now);
    expect(line).toMatchObject({ tone: "warn", title: "Sync stopped 12m ago." });
  });

  it("names the problem and the fix", () => {
    expect(syncLine({ ...base, state: "logged_out" }, now).title).toBe("LinkedIn is logged out.");
    expect(syncLine({ ...base, outdated: true }, now).title).toBe("The helper is out of date.");
    const paused = syncLine({ ...base, pausedUntil: new Date(now.getTime() + 7.5 * 60_000).toISOString() }, now);
    expect(paused.detail).toBe("Resumes in 8 min.");
    expect(syncLine({ ...base, state: "error", error: "Could not reach AILI." }, now).detail).toBe("Could not reach AILI.");
  });
});
