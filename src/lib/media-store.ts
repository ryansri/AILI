import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del } from "@vercel/blob";

/*
 * Where post images and PDFs are kept until they are published. On Vercel
 * that is Vercel Blob (BLOB_READ_WRITE_TOKEN, set when a Blob store is
 * connected to the project). On a computer without it, a local folder, so
 * development and tests work. On Vercel without Blob, uploads are off and
 * the page says how to turn them on.
 */

export type MediaStore = "blob" | "local" | "off";

export function mediaStore(): MediaStore {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  return process.env.VERCEL ? "off" : "local";
}

const LOCAL_DIR = path.join(process.cwd(), ".data", "media");
const LOCAL = "local:";

/** A blob this store may use: in a Vercel Blob store, under this post's folder. */
export function isOwnBlobUrl(url: string, postId: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com") && u.pathname.startsWith(`/posts/${postId}/`);
  } catch {
    return false;
  }
}

/** Saves a file in the local folder (development). Returns its stored url. */
export async function saveLocal(id: string, bytes: Uint8Array): Promise<string> {
  await mkdir(LOCAL_DIR, { recursive: true });
  const name = id.replace(/[^a-zA-Z0-9_-]/g, "");
  await writeFile(path.join(LOCAL_DIR, name), bytes);
  return `${LOCAL}${name}`;
}

/** The file's bytes, to send to LinkedIn or show on the page. */
export async function readMedia(url: string): Promise<Uint8Array> {
  if (url.startsWith(LOCAL)) return new Uint8Array(await readFile(path.join(LOCAL_DIR, url.slice(LOCAL.length))));
  const res = await fetch(url);
  if (!res.ok) throw new Error("The image could not be read from storage. Add it again.");
  return new Uint8Array(await res.arrayBuffer());
}

/** Deletes the file from storage. A file that is already gone is fine. */
export async function removeFile(url: string): Promise<void> {
  if (url.startsWith(LOCAL)) {
    await unlink(path.join(LOCAL_DIR, url.slice(LOCAL.length))).catch(() => {});
    return;
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) await del(url).catch(() => {});
}

export function isLocal(url: string): boolean {
  return url.startsWith(LOCAL);
}
