import { describe, expect, it } from "vitest";
import { pickLookups, profileIdentity } from "./profile-lookup";
import type { Person } from "./types";

const now = new Date("2026-09-26T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (d: number) => new Date(now.getTime() - d * DAY);

function person(id: string, messages: Person["messages"]): Person {
  return {
    id,
    name: id,
    headline: "",
    jobTitle: "",
    company: "",
    linkedinUrl: "",
    source: "linkedin",
    stage: "conversation",
    tagIds: [],
    notes: "",
    pending: [],
    messages,
    pictureUrl: "https://media.licdn.com/dms/image/x",
  };
}

describe("pickLookups", () => {
  it("puts people who need you first, newest first, and skips old quiet ones", () => {
    const replied = person("replied", [{ id: "1", direction: "in", body: "hi", sentAt: ago(1).toISOString() }]);
    const olderReply = person("older", [{ id: "1", direction: "in", body: "hi", sentAt: ago(3).toISOString() }]);
    const waitingNew = person("new", [{ id: "1", direction: "out", body: "hi", sentAt: ago(1).toISOString() }]);
    const waitingOld = person("old", [{ id: "1", direction: "out", body: "hi", sentAt: ago(1).toISOString() }]);
    const picked = pickLookups(
      [
        { person: waitingOld, createdAt: ago(60) },
        { person: waitingNew, createdAt: ago(2) },
        { person: olderReply, createdAt: ago(60) },
        { person: replied, createdAt: ago(60) },
      ],
      now,
      10,
    );
    expect(picked.map((p) => p.id)).toEqual(["replied", "older", "new"]);
  });

  it("gets to everyone still without a photo, after those", () => {
    const quiet = { ...person("quiet", []), pictureUrl: undefined };
    const replied = person("replied", [{ id: "1", direction: "in", body: "hi", sentAt: ago(1).toISOString() }]);
    const newOne = person("new", []);
    const picked = pickLookups(
      [
        { person: quiet, createdAt: ago(90) },
        { person: newOne, createdAt: ago(2) },
        { person: replied, createdAt: ago(60) },
      ],
      now,
      10,
    );
    expect(picked.map((p) => p.id)).toEqual(["replied", "new", "quiet"]);
  });

  it("hands out at most the limit", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      person: person(`p${i}`, [{ id: "1", direction: "in" as const, body: "hi", sentAt: ago(1).toISOString() }]),
      createdAt: ago(1),
    }));
    expect(pickLookups(many, now)).toHaveLength(2);
  });
});

describe("profileIdentity", () => {
  it("prefers the public id, then the URN's id", () => {
    expect(profileIdentity({ publicId: "rachel-lounds", linkedinUrn: "urn:li:fsd_profile:ACo1" })).toBe("rachel-lounds");
    expect(profileIdentity({ linkedinUrn: "urn:li:fsd_profile:ACo1" })).toBe("ACo1");
    expect(profileIdentity({})).toBeNull();
  });
});
