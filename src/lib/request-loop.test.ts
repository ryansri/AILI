import { describe, expect, it } from "vitest";
import { loopLine, requestLoop } from "./invites";
import type { InviteView } from "./types";

const now = new Date("2026-11-20T00:00:00Z");
const daysBefore = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const person = (invite: Partial<InviteView> | undefined, extra: { requestTries?: number; connection?: "yes" | "no" } = {}) => ({
  connection: extra.connection ?? "no",
  conversationId: undefined,
  messages: [],
  connectedAt: undefined,
  requestTries: extra.requestTries ?? 1,
  invite: invite ? ({ id: "i", note: "", error: "", source: "linkedin", createdAt: daysBefore(40), status: "sent", ...invite } as InviteView) : undefined,
});
const TZ = "Australia/Sydney";

describe("withdraw, wait, ask again", () => {
  it("waits, then says withdraw after 14 days", () => {
    expect(requestLoop(person({ status: "sent", sentAt: daysBefore(13) }), now)).toMatchObject({ step: "waiting", days: 13 });
    const old = requestLoop(person({ status: "sent", sentAt: daysBefore(17) }), now)!;
    expect(old.step).toBe("withdraw");
    expect(loopLine(old, TZ)).toEqual({ text: "Request sent 17 days ago · withdraw", tone: "amber" });
  });

  it("after you withdraw: LinkedIn's 3 weeks, then ask again", () => {
    const wait = requestLoop(person({ status: "withdrawn", sentAt: daysBefore(30), withdrawnAt: "2026-11-10T00:00:00Z" }), now)!;
    expect(wait.step).toBe("withdrawn");
    expect(loopLine(wait, TZ).text).toBe("Withdrawn 10 Nov · ask again 1 Dec");
    const ready = requestLoop(person({ status: "withdrawn", sentAt: daysBefore(40), withdrawnAt: daysBefore(21) }), now)!;
    expect(ready.step).toBe("ask_again");
    expect(loopLine(ready, TZ).tone).toBe("blue");
  });

  it("the second request waits as the 2nd try, and after it, lets go", () => {
    const second = requestLoop(person({ status: "sent", sentAt: daysBefore(2) }, { requestTries: 2 }), now)!;
    expect(loopLine(second, TZ)).toEqual({ text: "Request sent 2 days ago · 2nd try", tone: "plain" });
    const twice = requestLoop(person({ status: "withdrawn", sentAt: daysBefore(20), withdrawnAt: daysBefore(5) }, { requestTries: 2 }), now)!;
    expect(twice.step).toBe("let_go");
    expect(loopLine(twice, TZ)).toEqual({ text: "Asked twice · let it go", tone: "red" });
  });

  it("is nothing once they accept or you're connected, or before a request goes out", () => {
    expect(requestLoop(person({ status: "accepted", sentAt: daysBefore(20) }), now)).toBeNull();
    expect(requestLoop(person({ status: "sent", sentAt: daysBefore(20) }, { connection: "yes" }), now)).toBeNull();
    expect(requestLoop(person({ status: "queued" }), now)).toBeNull();
    expect(requestLoop(person(undefined), now)).toBeNull();
  });
});
