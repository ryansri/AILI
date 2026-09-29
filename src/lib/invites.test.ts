import { describe, expect, it } from "vitest";
import { memberIdOf, needsConnect, planNetwork, requestStats, waitingDays, type NetworkInvite, type NetworkPerson } from "./invites";

const now = new Date("2026-09-29T10:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86400000);

const person = (over: Partial<NetworkPerson>): NetworkPerson => ({ id: "p", lead: true, connection: "", ...over });
const jaimes = person({ id: "jaimes", linkedinUrn: "urn:li:fsd_profile:ACoAAJaimes1", publicId: "jaimesleggett" });
const laura = person({ id: "laura", publicId: "laura-mahony" });
const simon = person({ id: "simon", linkedinUrn: "urn:li:fsd_profile:ACoAASimon22", connection: "yes" });
const other = person({ id: "other", lead: false, linkedinUrn: "urn:li:fsd_profile:ACoAAOther33" });
const people = [jaimes, laura, simon, other];

describe("who needs a request", () => {
  const base = { connection: "" as "" | "yes" | "no", conversationId: undefined as string | undefined, messages: [], connectedAt: undefined as string | undefined };
  it("is anyone LinkedIn says you are not connected with", () => {
    expect(needsConnect({ ...base, connection: "no", conversationId: "c1" })).toBe(true);
    expect(needsConnect({ ...base, connection: "yes" })).toBe(false);
  });
  it("is, when AILI does not know, someone you have never talked to or connected with", () => {
    expect(needsConnect(base)).toBe(true);
    expect(needsConnect({ ...base, conversationId: "c1" })).toBe(false);
    expect(needsConnect({ ...base, connectedAt: "2026-09-01T00:00:00Z" })).toBe(false);
  });
});

describe("member ids", () => {
  it("reads the id from any profile urn", () => {
    expect(memberIdOf("urn:li:fsd_profile:ACoAAJaimes1")).toBe("ACoAAJaimes1");
    expect(memberIdOf("urn:li:fs_miniProfile:ACoAAJaimes1")).toBe("ACoAAJaimes1");
    expect(memberIdOf("")).toBe("");
    expect(memberIdOf("urn:li:x:a b")).toBe("");
  });
});

describe("what the helper saw on LinkedIn", () => {
  const sent: NetworkInvite = { id: "i1", personId: "jaimes", status: "sent", invitationId: "7001", sentAt: ago(2) };

  it("marks a request accepted when they show up in your connections", () => {
    const changes = planNetwork(people, [sent], { connections: [{ memberId: "ACoAAJaimes1", connectedAt: ago(0.1).getTime() }] }, now);
    expect(changes).toEqual([{ kind: "accepted", personId: "jaimes", inviteId: "i1", at: ago(0.1), notify: true }]);
  });

  it("notes people you were already connected with, without a notice", () => {
    const changes = planNetwork(people, [], { connections: [{ memberId: "x", publicId: "Laura-Mahony" }, { memberId: "ACoAASimon22" }] }, now);
    // Simon is known to be connected already; Laura matched by /in/ address.
    expect(changes).toEqual([{ kind: "connected", personId: "laura", at: now }]);
  });

  it("picks up requests sent on LinkedIn itself, for leads only", () => {
    const changes = planNetwork(
      people,
      [],
      {
        sent: [
          { memberId: "ACoAAJaimes1", invitationId: "7002", sharedSecret: "s", sentAt: ago(1).getTime(), message: "Hi Jaimes" },
          { memberId: "ACoAAOther33", invitationId: "7003" },
        ],
      },
      now,
    );
    expect(changes).toEqual([{ kind: "found", personId: "jaimes", invitationId: "7002", sharedSecret: "s", sentAt: ago(1), note: "Hi Jaimes" }]);
  });

  it("fills in LinkedIn's ids for a request sent from AILI", () => {
    const fresh = { ...sent, invitationId: null };
    const changes = planNetwork(people, [fresh], { sent: [{ memberId: "ACoAAJaimes1", invitationId: "7004", sharedSecret: "t" }] }, now);
    expect(changes).toEqual([{ kind: "found", personId: "jaimes", inviteId: "i1", invitationId: "7004", sharedSecret: "t", sentAt: ago(2), note: "" }]);
    // Already known: nothing to do.
    expect(planNetwork(people, [sent], { sent: [{ memberId: "ACoAAJaimes1", invitationId: "7001" }] }, now)).toEqual([]);
  });

  it("lets a request go once it is no longer waiting, but only from a full list", () => {
    expect(planNetwork(people, [sent], { sent: [], sentComplete: true }, now)).toEqual([{ kind: "gone", personId: "jaimes", inviteId: "i1" }]);
    expect(planNetwork(people, [sent], { sent: [], sentComplete: false }, now)).toEqual([]);
    // Just sent: LinkedIn may not list it yet.
    expect(planNetwork(people, [{ ...sent, sentAt: new Date(now.getTime() - 60000) }], { sent: [], sentComplete: true }, now)).toEqual([]);
  });

  it("prefers accepted over still listed", () => {
    const changes = planNetwork(people, [sent], { connections: [{ memberId: "ACoAAJaimes1" }], sent: [{ memberId: "ACoAAJaimes1" }], sentComplete: true }, now);
    expect(changes.map((c) => c.kind)).toEqual(["accepted"]);
  });
});

describe("request stats", () => {
  it("counts the last 30 days, the rate with and without a note, and old ones", () => {
    const iso = (d: number) => ago(d).toISOString();
    const s = requestStats(
      [
        { status: "accepted", note: "Hi", sentAt: iso(3) },
        { status: "accepted", note: "", sentAt: iso(5) },
        { status: "sent", note: "Hi", sentAt: iso(2) },
        { status: "sent", note: "", sentAt: iso(25) },
        { status: "withdrawn", note: "", sentAt: iso(10) },
        { status: "sent", note: "", sentAt: iso(40) },
        { status: "queued", note: "Hi" },
        { status: "failed", note: "", sentAt: iso(1) },
      ],
      21,
      now,
    );
    expect(s).toMatchObject({ sent: 5, accepted: 2, waiting: 3, stale: 2 });
    expect(s.rate).toBeCloseTo(0.4);
    expect(s.withNote).toEqual({ sent: 2, rate: 0.5 });
    expect(s.withoutNote.sent).toBe(3);
    expect(waitingDays(iso(24), now)).toBe(24);
  });
});
