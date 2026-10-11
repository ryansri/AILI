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
    // It checks in every 15 minutes, so 20 minutes is still fine.
    expect(syncLine({ ...base, lastSeenAt: new Date(now.getTime() - 20 * 60_000).toISOString() }, now).tone).toBe("ok");
    const line = syncLine({ ...base, lastSeenAt: new Date(now.getTime() - 40 * 60_000).toISOString() }, now);
    expect(line).toMatchObject({ tone: "warn", title: "Last synced 40m ago.", detail: "Open Chrome to get the latest." });
  });

  it("names the problem and the fix", () => {
    expect(syncLine({ ...base, state: "logged_out" }, now).title).toBe("LinkedIn is logged out.");
    expect(syncLine({ ...base, outdated: true }, now).title).toBe("The helper is out of date.");
    const paused = syncLine({ ...base, pausedUntil: new Date(now.getTime() + 7.5 * 60_000).toISOString() }, now);
    expect(paused).toMatchObject({ title: "The helper is resting.", detail: "LinkedIn asked it to slow down. Back in 8 min." });
    const limit = "The helper made its 200 LinkedIn requests for today. It picks up again tomorrow.";
    const day = syncLine({ ...base, error: limit, pausedUntil: new Date(now.getTime() + 10 * 3600_000).toISOString() }, now);
    expect(day.detail).toBe(`${limit} Back in 10 hours.`);
    expect(syncLine({ ...base, state: "error", error: "Could not reach AILI." }, now).detail).toBe("Could not reach AILI.");
  });

  it("is calm overnight, when the helper leaves LinkedIn alone", () => {
    expect(syncLine({ ...base, state: "resting" }, now)).toMatchObject({ tone: "ok", title: "Resting until 7 am." });
  });
});
