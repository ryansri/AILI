import { describe, expect, it } from "vitest";
import { chatUrl, postsUrl } from "./profile-url";

describe("postsUrl", () => {
  it("finds their activity page from any form of the profile link", () => {
    const want = "https://www.linkedin.com/in/simonjoyce/recent-activity/all/";
    expect(postsUrl("https://www.linkedin.com/in/simonjoyce")).toBe(want);
    expect(postsUrl("https://www.linkedin.com/in/simonjoyce/")).toBe(want);
    expect(postsUrl("https://au.linkedin.com/in/simonjoyce/details/experience/?trk=x")).toBe(want);
  });

  it("gives nothing for links that are not a person's profile", () => {
    expect(postsUrl("")).toBeNull();
    expect(postsUrl("https://www.linkedin.com/company/emotive")).toBeNull();
    expect(postsUrl("https://example.com/in/simon")).toBeNull();
  });
});

describe("chatUrl", () => {
  it("opens the chat on LinkedIn, or their profile when AILI has no chat yet", () => {
    expect(chatUrl("2-ZmY3YjE0==", "https://www.linkedin.com/in/sarah")).toBe("https://www.linkedin.com/messaging/thread/2-ZmY3YjE0==/");
    expect(chatUrl(undefined, "https://www.linkedin.com/in/sarah")).toBe("https://www.linkedin.com/in/sarah");
  });
});
