import { beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_LIMIT, HoldError, getBudget, holdForADay, spend } from "./budget";

let store: Record<string, unknown> = {};
vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: store[key] }),
      set: async (patch: Record<string, unknown>) => {
        store = { ...store, ...patch };
      },
    },
  },
});

describe("daily LinkedIn limit", () => {
  beforeEach(() => {
    store = {};
  });

  it("counts each request and stops at the limit", async () => {
    for (let i = 0; i < DAILY_LIMIT; i++) await spend();
    expect((await getBudget()).used).toBe(DAILY_LIMIT);
    await expect(spend()).rejects.toBeInstanceOf(HoldError);
  });

  it("starts again on a new day", async () => {
    store.budget = { day: "Mon Jan 01 2001", used: DAILY_LIMIT };
    await spend();
    expect((await getBudget()).used).toBe(1);
  });

  it("rests a full day after LinkedIn pushes back, even on a new day", async () => {
    await holdForADay();
    const err = await spend().catch((e) => e);
    expect(err).toBeInstanceOf(HoldError);
    expect(err.until).toBeGreaterThan(Date.now() + 23 * 3600_000);
    store.budget = { ...(store.budget as object), day: "Mon Jan 01 2001" };
    await expect(spend()).rejects.toBeInstanceOf(HoldError);
  });
});
