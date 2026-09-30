/*
 * Images and PDF carousels on posts: what LinkedIn takes, and the rules for
 * adding them. A post has text only, 1 to 20 images, or one PDF (LinkedIn
 * shows a PDF as a swipeable carousel). Shared by the page and the server.
 */

export type MediaKind = "image" | "document";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif"];
export const PDF_TYPE = "application/pdf";
export const MAX_IMAGES = 20;
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const PDF_MAX_BYTES = 100 * 1024 * 1024;

/** One file on a post, as the page shows it. */
export interface MediaView {
  id: string;
  kind: MediaKind;
  name: string;
  size: number;
  /** Where the page loads it from; gone once the file is deleted. */
  src?: string;
  /** Deleted from AILI after publishing (LinkedIn keeps its copy). */
  removedAt?: string;
}

/** Image or PDF from a file's type, or null when LinkedIn won't take it. */
export function mediaKindOf(contentType: string): MediaKind | null {
  if (IMAGE_TYPES.includes(contentType)) return "image";
  if (contentType === PDF_TYPE) return "document";
  return null;
}

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * Why this file can't be added to a post that already has `current`, or
 * null when it can. Images and a PDF don't mix, and there's one PDF at most.
 */
export function cannotAdd(current: { kind: MediaKind }[], file: { contentType: string; size: number }): string | null {
  const kind = mediaKindOf(file.contentType);
  if (!kind) return "LinkedIn takes JPG, PNG or GIF images, or one PDF.";
  if (kind === "image" && file.size > IMAGE_MAX_BYTES) return `Images can be up to ${mb(IMAGE_MAX_BYTES)}.`;
  if (kind === "document" && file.size > PDF_MAX_BYTES) return `A PDF can be up to ${mb(PDF_MAX_BYTES)}.`;
  if (kind === "image" && current.some((m) => m.kind === "document")) return "This post has a PDF carousel. Remove it to add images.";
  if (kind === "document" && current.some((m) => m.kind === "image")) return "This post has images. Remove them to add a PDF carousel.";
  if (kind === "document" && current.length > 0) return "A post can have one PDF carousel.";
  if (kind === "image" && current.length >= MAX_IMAGES) return `A post can have up to ${MAX_IMAGES} images.`;
  return null;
}

/** The day after a post is published, its files leave AILI's storage. */
export const KEEP_AFTER_PUBLISH_MS = 24 * 60 * 60 * 1000;

export function dueForCleanup(publishedAt: Date | null | undefined, now: Date): boolean {
  return Boolean(publishedAt && now.getTime() - publishedAt.getTime() >= KEEP_AFTER_PUBLISH_MS);
}
