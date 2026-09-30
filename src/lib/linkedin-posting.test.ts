import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { publishLinkedInPost, linkedinAuthorizeUrl, linkedInPostUrl } = await import("./linkedin-posting");

type Call = { url: string; init: RequestInit };

function fakeLinkedIn(responses: Response[]) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return responses.shift() ?? new Response("", { status: 500 });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("LinkedIn posting", () => {
  it("publishes a post with the escaped text and returns its urn", async () => {
    const calls = fakeLinkedIn([new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:123" } })]);
    const urn = await publishLinkedInPost("tok", "urn:li:person:abc", "Pricing (per month) #AI");
    expect(urn).toBe("urn:li:share:123");
    expect(calls[0].url).toBe("https://api.linkedin.com/rest/posts");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["X-Restli-Protocol-Version"]).toBe("2.0.0");
    expect(headers["LinkedIn-Version"]).toMatch(/^\d{6}$/);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      author: "urn:li:person:abc",
      commentary: "Pricing \\(per month\\) {hashtag|\\#|AI}",
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",
    });
  });

  it("tries an older API version when LinkedIn says the version is not active", async () => {
    const calls = fakeLinkedIn([
      new Response('{"message":"Requested version 20260701 is not active"}', { status: 426 }),
      new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:9" } }),
    ]);
    expect(await publishLinkedInPost("tok", "urn:li:person:abc", "hi")).toBe("urn:li:share:9");
    const versions = calls.map((c) => (c.init.headers as Record<string, string>)["LinkedIn-Version"]);
    expect(Number(versions[1])).toBeLessThan(Number(versions[0]));
  });

  it("uses LINKEDIN_API_VERSION first when set", async () => {
    vi.stubEnv("LINKEDIN_API_VERSION", "202601");
    const calls = fakeLinkedIn([new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:1" } })]);
    await publishLinkedInPost("tok", "urn:li:person:abc", "hi");
    expect((calls[0].init.headers as Record<string, string>)["LinkedIn-Version"]).toBe("202601");
  });

  it("explains the errors people can act on", async () => {
    fakeLinkedIn([new Response("unauthorized", { status: 401 })]);
    await expect(publishLinkedInPost("tok", "urn:li:person:abc", "hi")).rejects.toMatchObject({ reconnect: true });
    fakeLinkedIn([new Response('{"message":"Content is a duplicate of urn:li:share:1"}', { status: 422 })]);
    await expect(publishLinkedInPost("tok", "urn:li:person:abc", "hi")).rejects.toThrow(/duplicate/);
  });

  it("uploads one image and posts it as the post's media", async () => {
    const calls = fakeLinkedIn([
      Response.json({ value: { uploadUrl: "https://upload.example/1", image: "urn:li:image:A" } }),
      new Response(null, { status: 201 }),
      Response.json({ status: "AVAILABLE" }),
      new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:7" } }),
    ]);
    const urn = await publishLinkedInPost("tok", "urn:li:person:abc", "hi", { kind: "images", images: [{ bytes: new Uint8Array([1, 2]) }] });
    expect(urn).toBe("urn:li:share:7");
    expect(calls[0].url).toBe("https://api.linkedin.com/rest/images?action=initializeUpload");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ initializeUploadRequest: { owner: "urn:li:person:abc" } });
    expect(calls[1]).toMatchObject({ url: "https://upload.example/1", init: { method: "PUT" } });
    expect(calls[2].url).toBe(`https://api.linkedin.com/rest/images/${encodeURIComponent("urn:li:image:A")}`);
    expect(JSON.parse(String(calls[3].init.body)).content).toEqual({ media: { id: "urn:li:image:A" } });
  });

  it("posts several images as a multi-image post, in order", async () => {
    const calls = fakeLinkedIn([
      Response.json({ value: { uploadUrl: "https://upload.example/1", image: "urn:li:image:A" } }),
      new Response(null, { status: 201 }),
      Response.json({ status: "AVAILABLE" }),
      Response.json({ value: { uploadUrl: "https://upload.example/2", image: "urn:li:image:B" } }),
      new Response(null, { status: 201 }),
      Response.json({ status: "AVAILABLE" }),
      new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:8" } }),
    ]);
    await publishLinkedInPost("tok", "urn:li:person:abc", "hi", {
      kind: "images",
      images: [{ bytes: new Uint8Array([1]) }, { bytes: new Uint8Array([2]), alt: "A chart" }],
    });
    expect(JSON.parse(String(calls[6].init.body)).content).toEqual({
      multiImage: { images: [{ id: "urn:li:image:A" }, { id: "urn:li:image:B", altText: "A chart" }] },
    });
  });

  it("posts a PDF as a document (LinkedIn's carousel)", async () => {
    const calls = fakeLinkedIn([
      Response.json({ value: { uploadUrl: "https://upload.example/d", document: "urn:li:document:D" } }),
      new Response(null, { status: 201 }),
      Response.json({ status: "AVAILABLE" }),
      new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:9" } }),
    ]);
    await publishLinkedInPost("tok", "urn:li:person:abc", "hi", { kind: "document", bytes: new Uint8Array([1]), title: "7 places" });
    expect(calls[0].url).toBe("https://api.linkedin.com/rest/documents?action=initializeUpload");
    expect(JSON.parse(String(calls[3].init.body)).content).toEqual({ media: { title: "7 places", id: "urn:li:document:D" } });
  });

  it("stops when LinkedIn cannot process a file", async () => {
    fakeLinkedIn([
      Response.json({ value: { uploadUrl: "https://upload.example/d", document: "urn:li:document:D" } }),
      new Response(null, { status: 201 }),
      Response.json({ status: "PROCESSING_FAILED" }),
    ]);
    await expect(
      publishLinkedInPost("tok", "urn:li:person:abc", "hi", { kind: "document", bytes: new Uint8Array([1]), title: "x" }),
    ).rejects.toThrow(/could not process the PDF/);
  });

  it("builds the consent link and post address", () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "cid");
    const url = new URL(linkedinAuthorizeUrl("https://aili.example.com/api/linkedin/callback", "st"));
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization");
    expect(url.searchParams.get("scope")).toBe("openid profile w_member_social");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(linkedInPostUrl("urn:li:share:5")).toBe("https://www.linkedin.com/feed/update/urn:li:share:5/");
  });
});
