import { describe, expect, it } from "vitest";
import { myPictureFromSync, repliesToNotify, sameBody, splitHeadline, validatePayload, firstMessage, shouldAskLead } from "./helper-sync";

describe("splitHeadline", () => {
  it("splits role and company on ' at '", () => {
    expect(splitHeadline("Founder at Acme Agency")).toEqual({ headline: "Founder", company: "Acme Agency" });
    expect(splitHeadline("COO @ Farouk Digital")).toEqual({ headline: "COO", company: "Farouk Digital" });
  });
  it("takes the company from the first segment of a long headline", () => {
    expect(
      splitHeadline("Director & COO at Unique IT Solution | Enterprise Software & Cloud Solutions | Building & Scaling B2B SaaS"),
    ).toEqual({ headline: "Director & COO", company: "Unique IT Solution" });
  });
  it("leaves other headlines alone", () => {
    expect(splitHeadline("Helping agencies scale")).toEqual({ headline: "Helping agencies scale", company: "" });
    expect(splitHeadline("Helping agencies scale | Speaker")).toEqual({ headline: "Helping agencies scale", company: "" });
    expect(splitHeadline("")).toEqual({ headline: "", company: "" });
  });
});

describe("sameBody", () => {
  it("ignores whitespace differences only", () => {
    expect(sameBody("Hi  there\n", "Hi there")).toBe(true);
    expect(sameBody("Hi there", "Hi there!")).toBe(false);
  });
});

describe("validatePayload", () => {
  it("accepts a well-formed payload and drops junk entries", () => {
    const out = validatePayload({
      memberUrn: "urn:li:fsd_profile:ME",
      conversations: [
        {
          id: "2-abc",
          lastActivityAt: 1,
          participants: [{ urn: "urn:li:fsd_profile:ME", name: "Me" }, { urn: "urn:li:fsd_profile:A", name: "Ann" }, { bad: true }],
          messages: [{ id: "urn:li:msg_message:1", senderUrn: "urn:li:fsd_profile:A", body: "hi", sentAt: 1 }, { nope: 1 }],
        },
        { id: 5 },
      ],
    });
    expect(out?.conversations).toHaveLength(1);
    expect(out?.conversations[0].participants).toHaveLength(2);
    expect(out?.conversations[0].messages).toHaveLength(1);
  });
  it("rejects payloads without a member urn", () => {
    expect(validatePayload({ conversations: [] })).toBeNull();
    expect(validatePayload(null)).toBeNull();
  });
});

describe("myPictureFromSync", () => {
  const base = { memberUrn: "urn:li:fsd_profile:ME", displayName: "Ryan Sri" };
  it("takes your photo from the conversations you are in", () => {
    const payload = {
      ...base,
      conversations: [
        { id: "c1", lastActivityAt: 1, messages: [], participants: [{ urn: "urn:li:fsd_profile:ME", name: "Ryan Sri" }, { urn: "urn:li:fsd_profile:X", name: "X", pictureUrl: "https://media.licdn.com/x.jpg" }] },
        { id: "c2", lastActivityAt: 1, messages: [], participants: [{ urn: "urn:li:fsd_profile:ME", name: "Ryan Sri", pictureUrl: "https://media.licdn.com/me.jpg" }] },
      ],
    };
    expect(myPictureFromSync(payload)).toBe("https://media.licdn.com/me.jpg");
  });

  it("ignores photos from anywhere but LinkedIn's image host", () => {
    const payload = {
      ...base,
      conversations: [{ id: "c1", lastActivityAt: 1, messages: [], participants: [{ urn: "urn:li:fsd_profile:ME", name: "Ryan Sri", pictureUrl: "https://evil.example.com/me.jpg" }] }],
    };
    expect(myPictureFromSync(payload)).toBeNull();
  });
});

describe("repliesToNotify", () => {
  const now = 1_800_000_000_000;
  const HOUR = 60 * 60 * 1000;
  it("keeps recent replies, newest first, and drops old history", () => {
    const out = repliesToNotify(
      [
        { personId: "a", name: "A", body: "old", sentAt: now - 3 * 24 * HOUR },
        { personId: "b", name: "B", body: "earlier", sentAt: now - 2 * HOUR },
        { personId: "c", name: "C", body: "just now", sentAt: now - 60_000 },
      ],
      now,
    );
    expect(out.map((r) => r.name)).toEqual(["C", "B"]);
  });
});

describe("asking whether a new conversation is a lead", () => {
  const me = "urn:li:member:me";
  const them = "urn:li:member:them";
  const now = Date.UTC(2026, 8, 28, 12);

  it("finds who wrote first, whatever order the messages come in", () => {
    const msgs = [
      { senderUrn: them, sentAt: now - 1000 },
      { senderUrn: me, sentAt: now - 5000 },
    ];
    expect(firstMessage(msgs, me)).toEqual({ direction: "out", sentAt: now - 5000 });
    expect(firstMessage([], me)).toBeNull();
  });

  it("asks only when you wrote first, in the last 3 days", () => {
    expect(shouldAskLead({ direction: "out", sentAt: now - 60_000 }, now)).toBe(true);
    expect(shouldAskLead({ direction: "out", sentAt: now - 4 * 86400_000 }, now)).toBe(false);
    expect(shouldAskLead({ direction: "in", sentAt: now - 60_000 }, now)).toBe(false);
    expect(shouldAskLead(null, now)).toBe(false);
  });
});
