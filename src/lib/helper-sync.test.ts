import { describe, expect, it } from "vitest";
import { sameBody, splitHeadline, validatePayload } from "./helper-sync";

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
