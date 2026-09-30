import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";

/*
 * Where post images and PDFs are kept until they are published. On Vercel
 * that is Vercel Blob (BLOB_READ_WRITE_TOKEN, set when a Blob store is
 * connected to the project). On a computer without it, a local folder, so
 * development and tests work. On Vercel without Blob, uploads are off and
 * the page says how to turn them on.
 *
 * A Blob store is either public or private (chosen when it is made). Both
 * work: AILI tries public, falls back to private, and reads private files
 * with the token, never through a public link.
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

/** Private store files live on a ….private.blob.vercel-storage.com address. */
function accessOf(url: string): "public" | "private" {
  try {
    return new URL(url).hostname.includes(".private.") ? "private" : "public";
  } catch {
    return "public";
  }
}

export function isPrivateBlob(url: string): boolean {
  return !url.startsWith(LOCAL) && accessOf(url) === "private";
}

// Learned from the first upload: the store takes private files only.
let storeAccess: "public" | "private" = "public";

/** Saves a file in the Blob store, under the post's folder. Returns its url. */
export async function saveBlob(postId: string, name: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+/, "").slice(-80) || "file";
  const pathname = `posts/${postId}/${contentType === "application/pdf" && !/\.pdf$/i.test(safe) ? `${safe}.pdf` : safe}`;
  const body = Buffer.from(bytes);
  const save = (access: "public" | "private") => put(pathname, body, { access, contentType, addRandomSuffix: true });
  try {
    return (await save(storeAccess)).url;
  } catch (first) {
    const other = storeAccess === "public" ? "private" : "public";
    try {
      const { url } = await save(other);
      storeAccess = other;
      return url;
    } catch {
      console.error("Blob upload failed", first);
      throw new Error(`File storage said no: ${first instanceof Error ? first.message : "unknown error"}`);
    }
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
  const gone = new Error("The image could not be read from storage. Add it again.");
  if (isPrivateBlob(url)) {
    const blob = await get(url, { access: "private" });
    if (!blob || blob.statusCode !== 200) throw gone;
    return new Uint8Array(await new Response(blob.stream).arrayBuffer());
  }
  const res = await fetch(url);
  if (!res.ok) throw gone;
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
