"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { FileText, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { cannotAdd, IMAGE_TYPES, MAX_IMAGES, mediaKindOf, PDF_TYPE, type MediaKind, type MediaView } from "@/lib/media";
import { attachMedia, orderMedia, removeMedia } from "@/lib/client-actions";

/*
 * Images and PDF carousels on a post. Files go from the browser straight to
 * storage (Vercel Blob, or a local folder in development), are sent to
 * LinkedIn with the post, and are deleted from AILI the day after it is
 * published. LinkedIn keeps its own copy.
 */

export type MediaStoreMode = "blob" | "local" | "off";

type Mode = "text" | "images" | "pdf";

const modeOf = (media: MediaView[]): Mode =>
  media.length === 0 ? "text" : media.some((m) => m.kind === "document") ? "pdf" : "images";

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** A file name that is safe in a storage path; a PDF keeps its .pdf ending. */
function storedName(file: File): string {
  const name = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+/, "").slice(-80) || "file";
  return file.type === PDF_TYPE && !/\.pdf$/i.test(name) ? `${name}.pdf` : name;
}

/** Files this size or smaller go through AILI (Vercel takes up to 4.5 MB); bigger ones straight to Blob. */
const THROUGH_AILI_MAX = 4 * 1024 * 1024;

/** Gives up on an upload that has not finished in time, instead of saying "Adding" for ever. */
function timeLimit(file: File) {
  const controller = new AbortController();
  const ms = 60_000 + (file.size / (1024 * 1024)) * 10_000;
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function uploadFile(postId: string, file: File, store: MediaStoreMode) {
  const limit = timeLimit(file);
  try {
    if (store === "blob" && file.size > THROUGH_AILI_MAX) {
      const send = (access: "public" | "private") =>
        upload(`posts/${postId}/${storedName(file)}`, file, {
          access,
          handleUploadUrl: "/api/media/upload",
          clientPayload: JSON.stringify({ postId }),
          contentType: file.type,
          multipart: file.size > 20 * 1024 * 1024,
          abortSignal: limit.signal,
        });
      // The Blob store is public or private; try the other when one is refused.
      const blob = await send("public").catch((err) => {
        if (limit.signal.aborted) throw err;
        return send("private");
      });
      await attachMedia(postId, { url: blob.url, name: file.name, contentType: file.type, size: file.size });
      return;
    }
    const res = await fetch(`/api/media/file?postId=${encodeURIComponent(postId)}&name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "content-type": file.type },
      body: file,
      signal: limit.signal,
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That file did not upload.");
  } catch (err) {
    if (limit.signal.aborted) throw new Error(`${file.name} took too long to upload. Check your internet and try again.`);
    console.error("Upload failed", err);
    throw err;
  } finally {
    limit.done();
  }
}

/** The "Images or carousel" part of a post: pick, add, order and remove its files. */
export function MediaPanel({ postId, media, store }: { postId: string; media: MediaView[]; store: MediaStoreMode }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>(() => modeOf(media));
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  // The order while dragging; the page's order the rest of the time.
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const has = modeOf(media);
  const shown = mode === "text" && has !== "text" ? has : mode;
  const byId = new Map(media.map((m) => [m.id, m]));
  const list = order ? order.map((id) => byId.get(id)).filter((m): m is MediaView => Boolean(m)) : media;

  async function add(files: File[]) {
    if (files.length === 0 || busy) return;
    const current: { kind: MediaKind }[] = media.map((m) => ({ kind: m.kind }));
    let added = 0;
    try {
      for (const [i, file] of files.entries()) {
        const why = cannotAdd(current, { contentType: file.type, size: file.size });
        if (why) {
          toast.error(`${file.name}: ${why}`);
          continue;
        }
        setBusy(files.length > 1 ? `Adding ${i + 1} of ${files.length}` : "Adding");
        await uploadFile(postId, file, store);
        current.push({ kind: mediaKindOf(file.type)! });
        added++;
        if (mediaKindOf(file.type) === "document") setMode("pdf");
        else setMode("images");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That file did not upload.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
      if (added) router.refresh();
    }
  }

  async function remove(id: string) {
    setBusy("Removing");
    try {
      await removeMedia(id);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  }

  async function saveOrder(ids: string[]) {
    try {
      await orderMedia(postId, ids);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setOrder(null);
    }
  }

  function dragOnto(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = (order ?? media.map((m) => m.id)).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId) + (list.findIndex((m) => m.id === dragId) < list.findIndex((m) => m.id === targetId) ? 1 : 0), 0, dragId);
    setOrder(ids);
  }

  const modes: { key: Mode; label: string }[] = [
    { key: "text", label: "Text only" },
    { key: "images", label: "Images" },
    { key: "pdf", label: "PDF carousel" },
  ];
  const full = shown === "pdf" ? media.length >= 1 : media.length >= MAX_IMAGES;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Images or carousel</div>
      <div role="radiogroup" aria-label="Images or carousel" className="flex self-start rounded-lg bg-muted p-0.5">
        {modes.map((m) => {
          // Files of one kind are on the post: remove them to switch.
          const locked = has !== "text" && m.key !== has;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={shown === m.key}
              disabled={locked}
              title={locked ? `Remove the ${has === "pdf" ? "PDF" : "images"} first` : undefined}
              onClick={() => setMode(m.key)}
              className={cn(
                "h-7 rounded-md px-3 text-md transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                shown === m.key ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {shown !== "text" && store === "off" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-md leading-relaxed text-amber-900">
          Adding images needs file storage, which is not turned on yet. In Vercel, open this project, go to Storage,
          create a Blob store and connect it, then redeploy.
        </p>
      )}

      {list.length > 0 && (
        <ol className="flex flex-wrap gap-2.5" aria-label={shown === "pdf" ? "PDF carousel" : "Images, in order"}>
          {list.map((m, i) => (
            <li
              key={m.id}
              draggable={list.length > 1 && !busy}
              onDragStart={(e) => {
                setDragId(m.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                dragOnto(m.id);
              }}
              onDragEnd={() => {
                const ids = order;
                setDragId(null);
                if (ids && ids.join() !== media.map((x) => x.id).join()) void saveOrder(ids);
                else setOrder(null);
              }}
              className={cn(
                "relative overflow-hidden rounded-lg border bg-muted",
                m.kind === "image" ? "size-[92px]" : "flex h-[92px] w-[220px] items-center gap-2.5 px-3",
                list.length > 1 && "cursor-grab",
                dragId === m.id && "opacity-50",
              )}
            >
              {m.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.src} alt={m.name} className="size-full object-cover" draggable={false} />
              ) : (
                <>
                  <FileText className="size-6 shrink-0 text-red-600" />
                  <span className="flex min-w-0 flex-col text-xs">
                    <span className="truncate font-medium text-foreground">{m.name}</span>
                    <span className="text-muted-foreground">{sizeLabel(m.size)} · each page is a slide</span>
                  </span>
                </>
              )}
              {m.kind === "image" && (
                <span className="absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-2xs font-bold text-background">
                  {i + 1}
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove ${m.name}`}
                disabled={Boolean(busy)}
                onClick={() => void remove(m.id)}
                className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-background text-foreground shadow"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ol>
      )}

      {shown !== "text" && store !== "off" && !full && (
        <label
          onDragOver={(e) => {
            if (dragId || !e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            if (dragId) return;
            e.preventDefault();
            setOver(false);
            void add(Array.from(e.dataTransfer.files));
          }}
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed bg-background px-4 py-3.5 text-md text-muted-foreground transition-colors hover:border-foreground/30",
            over && "border-foreground/50 bg-muted",
            busy && "pointer-events-none opacity-70",
          )}
        >
          {busy ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <ImagePlus className="size-5 shrink-0" />}
          <span>
            {busy ? (
              `${busy}…`
            ) : (
              <>
                <b className="font-semibold text-foreground">Drop {shown === "pdf" ? "the PDF" : "images"} here</b> or click to
                choose. Download {shown === "pdf" ? "it" : "them"} from Claude first.
              </>
            )}
          </span>
          <input
            ref={input}
            type="file"
            className="sr-only"
            multiple={shown === "images"}
            accept={shown === "pdf" ? PDF_TYPE : IMAGE_TYPES.join(",")}
            onChange={(e) => void add(Array.from(e.target.files ?? []))}
          />
        </label>
      )}

      {shown !== "text" && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {shown === "pdf"
            ? "One PDF, up to 100 MB. Each page becomes a slide people swipe through."
            : `1 to ${MAX_IMAGES} images, JPG, PNG or GIF, up to 10 MB each.${list.length > 1 ? " Drag to change the order." : ""}`}
          <br />
          AILI keeps them until the post is out, then deletes them the next day. LinkedIn keeps its copy.
        </p>
      )}
    </div>
  );
}

/** The post's images or PDF in the LinkedIn preview, or a note once AILI has deleted them. */
export function MediaPreview({ media }: { media: MediaView[] }) {
  if (media.length === 0) return null;
  if (media.some((m) => m.removedAt)) {
    const pdf = media.some((m) => m.kind === "document");
    const n = media.length;
    return (
      <div className="rounded-lg border-[1.5px] border-dashed bg-muted/50 px-4 py-3.5 text-md text-muted-foreground">
        {pdf ? "PDF carousel" : `${n} ${n === 1 ? "image" : "images"}`} · removed from AILI after publishing, still on LinkedIn
      </div>
    );
  }
  const pdf = media.find((m) => m.kind === "document");
  if (pdf) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3.5">
        <FileText className="size-8 shrink-0 text-red-600" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-md font-medium">{pdf.name}</span>
          <span className="text-xs text-muted-foreground">PDF carousel · people swipe through its pages on LinkedIn</span>
        </span>
      </div>
    );
  }
  // Like LinkedIn: one image full width; two side by side; three or more as one big and two small, +N on the last.
  const shown = media.slice(0, 3);
  const more = media.length - shown.length;
  return (
    <div
      className={cn(
        "grid gap-0.5 overflow-hidden rounded-lg",
        shown.length === 2 && "grid-cols-2",
        shown.length === 3 && "h-[300px] grid-cols-[2fr_1fr] grid-rows-2",
      )}
    >
      {shown.map((m, i) => (
        <div key={m.id} className={cn("relative bg-muted", shown.length === 3 && i === 0 && "row-span-2", shown.length === 2 && "aspect-square")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={m.src}
            alt={m.name}
            className={cn("size-full object-cover", shown.length === 1 && "max-h-[480px] object-contain")}
          />
          {more > 0 && i === shown.length - 1 && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-semibold text-white">+{more}</span>
          )}
        </div>
      ))}
    </div>
  );
}
