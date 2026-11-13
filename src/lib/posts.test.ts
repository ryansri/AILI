import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// A throwaway copy of the local database (made by npm run dev or db:push), so the real one is untouched.
const source = join(process.cwd(), "prisma", "dev.db");
const hasDb = existsSync(source);
const dir = mkdtempSync(join(tmpdir(), "aili-posts-"));
if (hasDb) copyFileSync(source, join(dir, "test.db"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
delete process.env.TURSO_DATABASE_URL;
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret";

vi.mock("server-only", () => ({}));
const { db } = await import("./db");
const { seal } = await import("./secret-box");
const { publishPost, publishDuePosts, postFirstComment, postSecondComment, addSecondComment, addFirstComment, cancelFirstComment, cancelSecondComment } = await import("./posts");
const { cleanupPublishedMedia, deleteAllMedia, chunkReader, chunksOf } = await import("./media-server");
const { saveLocal, readMedia } = await import("./media-store");
const { PART_BYTES } = await import("./media");

type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];
let failComments = false;

function fakeLinkedIn() {
  calls = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    if (url.includes("/comments")) {
      return failComments
        ? new Response('{"message":"Not enough permissions"}', { status: 403 })
        : new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:comment:(urn:li:share:1,99)" } });
    }
    return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:1" } });
  });
}

async function workspace(delay: number) {
  return db.workspace.create({
    data: {
      name: "Test",
      initials: "T",
      firstCommentDelay: delay,
      linkedinPostToken: seal("tok"),
      linkedinPostUrn: "urn:li:person:abc",
      linkedinPostExpires: new Date(Date.now() + 30 * 86400000),
    },
  });
}

beforeEach(() => {
  failComments = false;
  fakeLinkedIn();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await db.$disconnect();
});

describe.skipIf(!hasDb)("first comment", () => {
  it("follows the post after the chosen delay", async () => {
    const w = await workspace(5);
    const post = await db.post.create({ data: { workspaceId: w.id, body: "Hello", firstComment: "Link: https://example.com" } });
    const published = await publishPost(w.id, post.id);
    expect(published.status).toBe("published");
    expect(published.commentStatus).toBe("pending");
    expect(published.commentAt!.getTime() - published.publishedAt!.getTime()).toBe(5 * 60_000);
    expect(calls).toHaveLength(1);

    // Not yet due.
    await publishDuePosts({ now: new Date(Date.now() + 60_000) });
    expect(calls).toHaveLength(1);

    await publishDuePosts({ now: new Date(Date.now() + 6 * 60_000) });
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe("https://api.linkedin.com/rest/socialActions/urn%3Ali%3Ashare%3A1/comments");
    expect(calls[1].body).toEqual({ actor: "urn:li:person:abc", object: "urn:li:share:1", message: { text: "Link: https://example.com" } });
    const after = await db.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(after.commentStatus).toBe("posted");

    // Never twice.
    await publishDuePosts({ now: new Date(Date.now() + 20 * 60_000) });
    expect(calls).toHaveLength(2);
  });

  it("goes straight away when the delay is 0", async () => {
    const w = await workspace(0);
    const post = await db.post.create({ data: { workspaceId: w.id, body: "Now", firstComment: "First!" } });
    await publishPost(w.id, post.id);
    expect(calls.map((c) => c.url.includes("/comments"))).toEqual([false, true]);
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).commentStatus).toBe("posted");
  });

  it("does nothing for a post without one", async () => {
    const w = await workspace(0);
    const post = await db.post.create({ data: { workspaceId: w.id, body: "Plain" } });
    const published = await publishPost(w.id, post.id);
    expect(published.commentStatus).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("says why when LinkedIn refuses, and can try again", async () => {
    const w = await workspace(0);
    failComments = true;
    const post = await db.post.create({ data: { workspaceId: w.id, body: "Post", firstComment: "Comment" } });
    const published = await publishPost(w.id, post.id);
    // The post itself is still published.
    expect(published.status).toBe("published");
    const failed = await db.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(failed.commentStatus).toBe("failed");
    expect(failed.commentError).toMatch(/does not let this app post comments/);

    failComments = false;
    await postFirstComment(w.id, post.id);
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).commentStatus).toBe("posted");
  });
});

describe.skipIf(!hasDb)("second comment", () => {
  const comments = () => calls.filter((c) => c.url.includes("/comments")).map((c) => (c.body.message as { text: string }).text);

  it("follows the first comment after its delay, once", async () => {
    const w = await workspace(0);
    const post = await db.post.create({ data: { workspaceId: w.id, body: "Hi", firstComment: "Link", secondComment: "What do you think?", secondDelay: 30 } });
    await publishPost(w.id, post.id);
    const after = await db.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(after.commentStatus).toBe("posted");
    expect(after.secondStatus).toBe("pending");
    expect(Math.round((after.secondAt!.getTime() - Date.now()) / 60_000)).toBe(30);
    expect(comments()).toEqual(["Link"]);

    await publishDuePosts({ now: new Date(Date.now() + 20 * 60_000) });
    expect(comments()).toEqual(["Link"]);
    await publishDuePosts({ now: new Date(Date.now() + 31 * 60_000) });
    expect(comments()).toEqual(["Link", "What do you think?"]);
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).secondStatus).toBe("posted");
    await publishDuePosts({ now: new Date(Date.now() + 90 * 60_000) });
    expect(comments()).toHaveLength(2);
  });

  it("waits while the first comment failed, and is set off once it goes", async () => {
    const w = await workspace(0);
    failComments = true;
    const post = await db.post.create({ data: { workspaceId: w.id, body: "Hi", firstComment: "Link", secondComment: "Second", secondDelay: 45 } });
    await publishPost(w.id, post.id);
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).secondStatus).toBeNull();
    await publishDuePosts({ now: new Date(Date.now() + 120 * 60_000) });
    failComments = false;
    await postFirstComment(w.id, post.id);
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).secondStatus).toBe("pending");
  });

  it("says why when LinkedIn refuses it, can try again, or be cancelled before it goes", async () => {
    const w = await workspace(0);
    const post = await db.post.create({ data: { workspaceId: w.id, body: "Hi", firstComment: "Link", secondComment: "Second" } });
    await publishPost(w.id, post.id);
    failComments = true;
    await publishDuePosts({ now: new Date(Date.now() + 50 * 60_000) });
    const failed = await db.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(failed.secondStatus).toBe("failed");
    expect(failed.secondError).toMatch(/does not let this app post comments/);
    failComments = false;
    await postSecondComment(w.id, post.id);
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).secondStatus).toBe("posted");
    await expect(cancelSecondComment(w.id, post.id)).rejects.toThrow(/already gone out/);

    const other = await db.post.create({ data: { workspaceId: w.id, body: "Hi", firstComment: "Link", secondComment: "Later" } });
    await publishPost(w.id, other.id);
    await cancelSecondComment(w.id, other.id);
    await publishDuePosts({ now: new Date(Date.now() + 90 * 60_000) });
    expect(comments()).not.toContain("Later");
  });
});

describe.skipIf(!hasDb)("a second comment on a live post", () => {
  it("posts it now or in some minutes, and never touches the first comment", async () => {
    const w = await workspace(0);
    const post = await db.post.create({ data: { workspaceId: w.id, body: "Live", firstComment: "Checklist: https://x.io" } });
    await publishPost(w.id, post.id);
    calls = [];
    const later = await addSecondComment(w.id, post.id, "Any questions?", 30);
    expect(later.secondStatus).toBe("pending");
    expect(Math.round((later.secondAt!.getTime() - Date.now()) / 60_000)).toBe(30);
    expect(calls).toHaveLength(0);
    await publishDuePosts({ now: new Date(Date.now() + 31 * 60_000) });
    expect(calls.map((c) => (c.body.message as { text: string }).text)).toEqual(["Any questions?"]);
    const after = await db.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(after).toMatchObject({ firstComment: "Checklist: https://x.io", commentStatus: "posted", secondStatus: "posted" });
    await expect(addSecondComment(w.id, post.id, "Again", 0)).rejects.toThrow(/already has a second comment/);

    const other = await db.post.create({ data: { workspaceId: w.id, body: "Live 2", firstComment: "Link" } });
    await publishPost(w.id, other.id);
    calls = [];
    expect((await addSecondComment(w.id, other.id, "Now please", 0)).secondStatus).toBe("posted");
    expect(calls).toHaveLength(1);
  });

  it("needs a first comment", async () => {
    const w = await workspace(0);
    const post = await db.post.create({ data: { workspaceId: w.id, body: "Bare" } });
    await publishPost(w.id, post.id);
    await expect(addSecondComment(w.id, post.id, "Hi", 30)).rejects.toThrow(/Add a first comment first/);
  });
});

describe.skipIf(!hasDb)("videos", () => {
  it("reads any range of a video kept in 4 MB pieces", async () => {
    const whole = new Uint8Array(PART_BYTES * 2 + 10).map((_, i) => i % 251);
    const parts = [
      await saveLocal(`vid-a-${Date.now()}`, whole.subarray(0, PART_BYTES)),
      await saveLocal(`vid-b-${Date.now()}`, whole.subarray(PART_BYTES, PART_BYTES * 2)),
      await saveLocal(`vid-c-${Date.now()}`, whole.subarray(PART_BYTES * 2)),
    ];
    expect(chunksOf({ url: parts[0], parts: JSON.stringify(parts) })).toEqual(parts);
    expect(chunksOf({ url: "local:x", parts: "" })).toEqual(["local:x"]);
    const read = chunkReader(parts);
    expect(Array.from(await read(0, 3))).toEqual(Array.from(whole.subarray(0, 4)));
    const across = await read(PART_BYTES - 2, PART_BYTES * 2 + 1);
    expect(across.length).toBe(PART_BYTES + 4);
    expect(Array.from(across.subarray(0, 6))).toEqual(Array.from(whole.subarray(PART_BYTES - 2, PART_BYTES + 4)));
    expect(Array.from(await read(PART_BYTES * 2, PART_BYTES * 2 + 9))).toEqual(Array.from(whole.subarray(PART_BYTES * 2)));
  });

  it("deletes the video from AILI as soon as the post is live, and keeps it when publishing fails", async () => {
    const w = await workspace(5);
    const pieces = [await saveLocal(`vid-p1-${Date.now()}`, new Uint8Array([0, 0, 0, 8, 102, 116, 121, 112]))];
    const post = await db.post.create({ data: { workspaceId: w.id, body: "Watch this" } });
    const m = await db.postMedia.create({
      data: { workspaceId: w.id, postId: post.id, kind: "video", url: pieces[0], parts: JSON.stringify(pieces), name: "clip.mp4", contentType: "video/mp4", size: 8 },
    });
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: typeof init.body === "string" ? JSON.parse(init.body) : {} });
      if (url.includes("initializeUpload"))
        return Response.json({ value: { video: "urn:li:video:V", uploadToken: "", uploadInstructions: [{ uploadUrl: "https://up.example/1", firstByte: 0, lastByte: 7 }] } });
      if (url.startsWith("https://up.example")) return new Response(null, { status: 200, headers: { etag: "e1" } });
      if (url.includes("finalizeUpload")) return new Response(null, { status: 200 });
      if (url.includes("/videos/")) return Response.json({ status: "AVAILABLE" });
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:1" } });
    });
    calls = [];
    await publishPost(w.id, post.id);
    expect(calls.map((c) => c.url.replace(/\?.*/, ""))).toContain("https://api.linkedin.com/rest/posts");
    expect((await db.postMedia.findUniqueOrThrow({ where: { id: m.id } })).deletedAt).not.toBeNull();
    await expect(readMedia(pieces[0])).rejects.toThrow();

    // LinkedIn refuses: the post failed, so the video stays to try again.
    const keep = [await saveLocal(`vid-k1-${Date.now()}`, new Uint8Array([0, 0, 0, 8, 102, 116, 121, 112]))];
    const failing = await db.post.create({ data: { workspaceId: w.id, body: "Again" } });
    const k = await db.postMedia.create({
      data: { workspaceId: w.id, postId: failing.id, kind: "video", url: keep[0], parts: JSON.stringify(keep), name: "clip.mp4", contentType: "video/mp4", size: 8 },
    });
    vi.stubGlobal("fetch", async () => new Response('{"message":"nope"}', { status: 500 }));
    await expect(publishPost(w.id, failing.id)).rejects.toThrow();
    expect((await db.postMedia.findUniqueOrThrow({ where: { id: k.id } })).deletedAt).toBeNull();
    expect((await readMedia(keep[0])).length).toBe(8);
  });
});

describe.skipIf(!hasDb)("post images", () => {
  async function postWithImage(workspaceId: string, data: { status: string; publishedAt?: Date }) {
    const post = await db.post.create({ data: { workspaceId, body: "With a picture", ...data } });
    const url = await saveLocal(`test-${post.id}`, new Uint8Array([1, 2, 3]));
    const media = await db.postMedia.create({
      data: { workspaceId, postId: post.id, kind: "image", url, name: "a.png", contentType: "image/png", size: 3 },
    });
    return { post, media };
  }

  it("deletes a published post's files the day after, and keeps the rest", async () => {
    const w = await workspace(0);
    const now = new Date();
    const old = await postWithImage(w.id, { status: "published", publishedAt: new Date(now.getTime() - 25 * 3600_000) });
    const fresh = await postWithImage(w.id, { status: "published", publishedAt: new Date(now.getTime() - 3600_000) });
    const failed = await postWithImage(w.id, { status: "failed" });

    await cleanupPublishedMedia(now);

    const gone = await db.postMedia.findUniqueOrThrow({ where: { id: old.media.id } });
    expect(gone.deletedAt).not.toBeNull();
    await expect(readMedia(old.media.url)).rejects.toThrow();
    for (const kept of [fresh, failed]) {
      expect((await db.postMedia.findUniqueOrThrow({ where: { id: kept.media.id } })).deletedAt).toBeNull();
      expect(await readMedia(kept.media.url)).toEqual(new Uint8Array([1, 2, 3]));
      await deleteAllMedia(kept.post.id);
      await expect(readMedia(kept.media.url)).rejects.toThrow();
    }
  });
});

describe.skipIf(!hasDb)("a first comment on a live post", () => {
  async function livePost(urn: string | null = "urn:li:share:1") {
    const w = await workspace(5);
    const post = await db.post.create({
      data: { workspaceId: w.id, body: "Hello", status: "published", publishedAt: new Date(), linkedinUrn: urn },
    });
    return { w, post };
  }

  it("posts it now", async () => {
    const { w, post } = await livePost();
    const saved = await addFirstComment(w.id, post.id, "Link: https://example.com", null);
    expect(saved.commentStatus).toBe("posted");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/comments");
    await expect(addFirstComment(w.id, post.id, "Another", null)).rejects.toThrow("already has a first comment");
  });

  it("posts it at the chosen time, which can change or be cancelled until then", async () => {
    const { w, post } = await livePost();
    const at = new Date(Date.now() + 60 * 60_000);
    await addFirstComment(w.id, post.id, "Later", at);
    await publishDuePosts({ now: new Date(Date.now() + 30 * 60_000) });
    expect(calls).toHaveLength(0);

    const later = new Date(Date.now() + 2 * 60 * 60_000);
    const moved = await addFirstComment(w.id, post.id, "Later still", later);
    expect(moved.commentAt?.getTime()).toBe(later.getTime());
    await publishDuePosts({ now: new Date(Date.now() + 3 * 60 * 60_000) });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ message: { text: "Later still" } });
    await expect(cancelFirstComment(w.id, post.id)).rejects.toThrow("already gone out");
  });

  it("cancels one not yet out", async () => {
    const { w, post } = await livePost();
    await addFirstComment(w.id, post.id, "Later", new Date(Date.now() + 60 * 60_000));
    await cancelFirstComment(w.id, post.id);
    const after = await db.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(after.commentStatus).toBeNull();
    expect(after.firstComment).toBe("");
  });

  it("says no for a post AILI did not publish", async () => {
    const { w, post } = await livePost(null);
    await expect(addFirstComment(w.id, post.id, "Hi", null)).rejects.toThrow("AILI did not publish this post");
  });
});
