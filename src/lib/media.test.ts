import { describe, expect, it } from "vitest";
import { cannotAdd, docTitleOf, dueForCleanup, mediaKindOf } from "./media";

const img = { contentType: "image/png", size: 1000 };
const pdf = { contentType: "application/pdf", size: 1000 };

describe("post media rules", () => {
  it("knows images from PDFs and refuses other files", () => {
    expect(mediaKindOf("image/jpeg")).toBe("image");
    expect(mediaKindOf("application/pdf")).toBe("document");
    expect(mediaKindOf("video/mp4")).toBeNull();
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
