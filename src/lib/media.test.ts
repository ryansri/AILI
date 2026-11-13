import { describe, expect, it } from "vitest";
import { cannotAdd, docTitleOf, dueForCleanup, looksLikeMp4, mediaKindOf, videoLengthProblem } from "./media";

const img = { contentType: "image/png", size: 1000 };
const pdf = { contentType: "application/pdf", size: 1000 };

describe("post media rules", () => {
  it("knows images from PDFs and refuses other files", () => {
    expect(mediaKindOf("image/jpeg")).toBe("image");
    expect(mediaKindOf("application/pdf")).toBe("document");
    expect(mediaKindOf("video/webm")).toBeNull();
    expect(cannotAdd([], { contentType: "image/webp", size: 1 })).toMatch(/JPG, PNG or GIF/);
  });

  it("takes up to 20 images, or one PDF, never both", () => {
    expect(cannotAdd([], img)).toBeNull();
    expect(cannotAdd(Array.from({ length: 19 }, () => ({ kind: "image" as const })), img)).toBeNull();
    expect(cannotAdd(Array.from({ length: 20 }, () => ({ kind: "image" as const })), img)).toMatch(/up to 20/);
    expect(cannotAdd([], pdf)).toBeNull();
    expect(cannotAdd([{ kind: "document" }], pdf)).toMatch(/one PDF/);
    expect(cannotAdd([{ kind: "image" }], pdf)).toMatch(/has images/);
    expect(cannotAdd([{ kind: "document" }], img)).toMatch(/PDF carousel/);
  });

  it("refuses files that are too big", () => {
    expect(cannotAdd([], { contentType: "image/png", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(cannotAdd([], { contentType: "application/pdf", size: 101 * 1024 * 1024 })).toMatch(/100 MB/);
  });

  it("clears files a day after the post is published, not before", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    expect(dueForCleanup(new Date("2026-10-01T12:00:00Z"), now)).toBe(true);
    expect(dueForCleanup(new Date("2026-10-01T13:00:00Z"), now)).toBe(false);
    expect(dueForCleanup(null, now)).toBe(false);
  });
});

describe("PDF title on LinkedIn", () => {
  it("uses the typed title, else the file name, never empty", () => {
    expect(docTitleOf({ title: "7 ways to save admin time", name: "Monday carousel.pdf" })).toBe("7 ways to save admin time");
    expect(docTitleOf({ title: "  ", name: "admin-time.PDF" })).toBe("admin-time");
    expect(docTitleOf({ name: "admin-time.pdf" })).toBe("admin-time");
  });
});

describe("videos", () => {
  const mp4 = { contentType: "video/mp4", size: 50 * 1024 * 1024 };
  it("takes one MP4 up to 200 MB, on its own", () => {
    expect(mediaKindOf("video/mp4")).toBe("video");
    expect(mediaKindOf("video/quicktime")).toBeNull();
    expect(cannotAdd([], mp4)).toBeNull();
    expect(cannotAdd([], { ...mp4, size: 201 * 1024 * 1024 })).toMatch(/up to 200 MB/);
    expect(cannotAdd([{ kind: "video" }], mp4)).toBe("A post can have one video.");
    expect(cannotAdd([{ kind: "image" }], mp4)).toBe("This post has images. Remove them to add a video.");
    expect(cannotAdd([{ kind: "video" }], { contentType: "application/pdf", size: 10 })).toBe("This post has a video. Remove it to add a PDF carousel.");
    expect(cannotAdd([{ kind: "document" }], { contentType: "image/png", size: 10 })).toBe("This post has a PDF carousel. Remove it to add images.");
  });

  it("knows an MP4 by its first bytes, and LinkedIn's length limits", () => {
    expect(looksLikeMp4(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]))).toBe(true);
    expect(looksLikeMp4(new TextEncoder().encode("%PDF-1.7 hello"))).toBe(false);
    expect(videoLengthProblem(2)).toMatch(/at least 3 seconds/);
    expect(videoLengthProblem(31 * 60)).toMatch(/up to 30 minutes/);
    expect(videoLengthProblem(90)).toBeNull();
    expect(docTitleOf({ name: "Demo clip.MP4" })).toBe("Demo clip");
  });
});
