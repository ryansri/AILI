import { describe, expect, it } from "vitest";
import { extractConversationId, extractProfileId, linkedInVariables, raw } from "./encode";
import { extractCurrentPosition, extractProfile, extractSentMessage, normalizeConversations, normalizeMessages, pictureFrom } from "./normalize";

function participant(convId: string, i: number, profileId: string, first: string, last: string, headline = "") {
  return {
    $type: "com.linkedin.messenger.MessagingParticipant",
    entityUrn: `urn:li:msg_messagingParticipant:${convId}_${i}`,
    hostIdentityUrn: `urn:li:fsd_profile:${profileId}`,
    participantType: {
      member: {
        firstName: { text: first },
        lastName: { text: last },
        headline: { text: headline },
        profileUrl: `https://www.linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}`,
        profilePicture: null,
      },
    },
  };
}

describe("encode", () => {
  it("encodes urn characters the way LinkedIn expects", () => {
    expect(linkedInVariables({ mailboxUrn: "urn:li:fsd_profile:ME", count: 20, flag: true, list: raw("List(A,B)") })).toBe(
      "(mailboxUrn:urn%3Ali%3Afsd_profile%3AME,count:20,flag:true,list:List(A,B))",
    );
  });
  it("pulls ids out of urns", () => {
    expect(extractConversationId("urn:li:msg_conversation:(urn:li:fsd_profile:ME,2-abc==)")).toBe("2-abc==");
    expect(extractProfileId("urn:li:msg_messagingParticipant:urn:li:fsd_profile:ABC")).toBe("ABC");
  });
});

describe("normalizeConversations", () => {
  it("builds one summary per conversation with both participants", () => {
    const raw = {
      included: [
        {
          $type: "com.linkedin.messenger.Conversation",
          entityUrn: "urn:li:msg_conversation:(urn:li:fsd_profile:ME,2-abc)",
          lastActivityAt: 1700000000000,
          "*conversationParticipants": ["urn:li:msg_messagingParticipant:2-abc_0", "urn:li:msg_messagingParticipant:2-abc_1"],
        },
        participant("2-abc", 0, "ME", "Ryan", "Sri"),
        participant("2-abc", 1, "SC", "Sarah", "Chen", "Ops Director at Bright Agency"),
      ],
    };
    const [conv] = normalizeConversations(raw);
    expect(conv.id).toBe("2-abc");
    expect(conv.lastActivityAt).toBe(1700000000000);
    expect(conv.participants).toEqual([
      { urn: "urn:li:fsd_profile:ME", name: "Ryan Sri", headline: undefined, publicId: "ryan-sri", pictureUrl: undefined },
      { urn: "urn:li:fsd_profile:SC", name: "Sarah Chen", headline: "Ops Director at Bright Agency", publicId: "sarah-chen", pictureUrl: undefined },
    ]);
  });
});

describe("normalizeMessages", () => {
  it("returns text messages oldest first, drops recalled ones, describes attachments", () => {
    const raw = {
      included: [
        participant("2-abc", 0, "ME", "Ryan", "Sri"),
        participant("2-abc", 1, "SC", "Sarah", "Chen"),
        {
          $type: "com.linkedin.messenger.Message",
          entityUrn: "urn:li:msg_message:2",
          "*sender": "urn:li:msg_messagingParticipant:2-abc_1",
          body: { text: "What does it cost?" },
          deliveredAt: 2000,
        },
        {
          $type: "com.linkedin.messenger.Message",
          entityUrn: "urn:li:msg_message:1",
          "*sender": "urn:li:msg_messagingParticipant:2-abc_0",
          body: { text: "Good to meet you" },
          deliveredAt: 1000,
        },
        {
          $type: "com.linkedin.messenger.Message",
          entityUrn: "urn:li:msg_message:3",
          "*sender": "urn:li:msg_messagingParticipant:2-abc_0",
          body: { text: "" },
          messageBodyRenderFormat: "RECALLED",
          deliveredAt: 3000,
        },
        {
          $type: "com.linkedin.messenger.Message",
          entityUrn: "urn:li:msg_message:4",
          "*sender": "urn:li:msg_messagingParticipant:2-abc_1",
          body: { text: "" },
          renderContent: [{ vectorImage: { artifacts: [] } }],
          deliveredAt: 4000,
        },
      ],
    };
    const msgs = normalizeMessages(raw);
    expect(msgs.map((m) => m.id)).toEqual(["urn:li:msg_message:1", "urn:li:msg_message:2", "urn:li:msg_message:4"]);
    expect(msgs[0].senderUrn).toBe("urn:li:fsd_profile:ME");
    expect(msgs[1].senderUrn).toBe("urn:li:fsd_profile:SC");
    expect(msgs[2].body).toBe("[Sent an image]");
  });
});

describe("extractSentMessage", () => {
  it("reads the created message from the usual response shapes", () => {
    expect(extractSentMessage({ value: { entityUrn: "urn:li:msg_message:9", deliveredAt: 5, conversationUrn: "urn:li:msg_conversation:(urn:li:fsd_profile:ME,2-x)" } })).toEqual({
      id: "urn:li:msg_message:9",
      sentAt: 5,
      conversationId: "2-x",
    });
    expect(extractSentMessage({ data: { value: { entityUrn: "urn:li:msg_message:9", deliveredAt: 5 } } })?.id).toBe("urn:li:msg_message:9");
    expect(extractSentMessage({ nope: true })).toBeNull();
  });
});

describe("extractCurrentPosition", () => {
  it("reads the dash profile shape, preferring the current, latest-started role", () => {
    const res = {
      data: {},
      included: [
        { $type: "com.linkedin.voyager.dash.identity.profile.Position", title: "Analyst", companyName: "Old Co", dateRange: { start: { year: 2015 }, end: { year: 2019 } } },
        { $type: "com.linkedin.voyager.dash.identity.profile.Position", title: "Advisor", companyName: "Side Co", dateRange: { start: { year: 2018, month: 3 } } },
        { $type: "com.linkedin.voyager.dash.identity.profile.Position", title: "Founder", companyName: "Lounds Consulting", dateRange: { start: { year: 2021, month: 6 } } },
        { $type: "com.linkedin.voyager.dash.identity.profile.Education", title: "MBA", schoolName: "RMIT", companyName: "RMIT" },
      ],
    };
    expect(extractCurrentPosition(res)).toEqual({ title: "Founder", company: "Lounds Consulting" });
  });

  it("reads the older positionGroups shape", () => {
    const res = {
      elements: [
        {
          positions: [
            { title: "Ops Director", companyName: "Bright Agency", timePeriod: { startDate: { year: 2022, month: 1 } } },
          ],
        },
        { positions: [{ title: "Manager", companyName: "Past Ltd", timePeriod: { startDate: { year: 2016 }, endDate: { year: 2021 } } }] },
      ],
    };
    expect(extractCurrentPosition(res)).toEqual({ title: "Ops Director", company: "Bright Agency" });
  });

  it("returns null when every role has ended or there are none", () => {
    expect(extractCurrentPosition({ included: [{ title: "X", companyName: "Y", dateRange: { start: { year: 2010 }, end: { year: 2012 } } }] })).toBeNull();
    expect(extractCurrentPosition({ included: [] })).toBeNull();
  });
});

describe("pictureFrom", () => {
  it("reads your photo from the /me mini profile, keyed or flat", () => {
    const vector = {
      rootUrl: "https://media.licdn.com/dms/image/abc/",
      artifacts: [
        { width: 100, fileIdentifyingUrlPathSegment: "100_100/photo.jpg" },
        { width: 400, fileIdentifyingUrlPathSegment: "400_400/photo.jpg" },
      ],
    };
    expect(pictureFrom(vector)).toBe("https://media.licdn.com/dms/image/abc/100_100/photo.jpg");
    expect(pictureFrom({ "com.linkedin.common.VectorImage": vector })).toBe("https://media.licdn.com/dms/image/abc/100_100/photo.jpg");
    expect(pictureFrom(undefined)).toBe("");
  });
});

describe("extractProfile", () => {
  it("reads the dash profile that matches the public id", () => {
    const res = {
      included: [
        { $type: "com.linkedin.voyager.dash.identity.profile.Profile", entityUrn: "urn:li:fsd_profile:OTHER", firstName: "Someone", lastName: "Else", publicIdentifier: "someone" },
        {
          $type: "com.linkedin.voyager.dash.identity.profile.Profile",
          entityUrn: "urn:li:fsd_profile:ACoAAB123",
          firstName: "Sarah",
          lastName: "Chen",
          headline: "Ops Director at Bright Agency",
          publicIdentifier: "sarahchen",
          profilePicture: {
            displayImageReference: {
              vectorImage: { rootUrl: "https://media.licdn.com/dms/image/", artifacts: [{ width: 100, fileIdentifyingUrlPathSegment: "abc_100" }] },
            },
          },
        },
      ],
    };
    expect(extractProfile(res, "SarahChen")).toEqual({
      urn: "urn:li:fsd_profile:ACoAAB123",
      name: "Sarah Chen",
      headline: "Ops Director at Bright Agency",
      pictureUrl: "https://media.licdn.com/dms/image/abc_100",
    });
  });

  it("reads the older mini profile shape", () => {
    const res = {
      included: [
        { $type: "com.linkedin.voyager.identity.shared.MiniProfile", entityUrn: "urn:li:fs_miniProfile:ACoAAC9", firstName: "Tom", lastName: "Whitfield", occupation: "CEO, Pixel Forge", publicIdentifier: "tomw" },
      ],
    };
    expect(extractProfile(res, "tomw")).toMatchObject({ urn: "urn:li:fsd_profile:ACoAAC9", name: "Tom Whitfield", headline: "CEO, Pixel Forge" });
  });

  it("returns null when nothing matches", () => {
    expect(extractProfile({ included: [] }, "x")).toBeNull();
  });
});
