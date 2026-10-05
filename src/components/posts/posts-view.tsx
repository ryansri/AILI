"use client";

import { createContext, useContext, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  Check,
  ExternalLink,
  FileText,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LinkedInPosting, PostView } from "@/lib/posts";
import { articleHtml, articlePlainText, wordCount } from "@/lib/article-html";
import { COMMENT_MAX_CHARS, delayLabel, POST_MAX_CHARS } from "@/lib/linkedin-text";
import { formatWhen, toWallInput, wallTimeToDate } from "@/lib/time-zone";
import {
  addFirstCommentToPost,
  cancelFirstCommentOnPost,
  deletePost,
  markArticlePublished,
  publishPostNow,
  retryFirstComment,
  savePost,
  schedulePost,
  unschedulePost,
} from "@/lib/client-actions";
import { useHelperPresence } from "@/hooks/use-helper-presence";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { MediaPanel, MediaPreview, type MediaStoreMode } from "./post-media";

/*
 * Posts: everything written here or in Claude or ChatGPT. Posts publish on
 * LinkedIn now or at a set time; articles open in LinkedIn's own editor,
 * because LinkedIn only lets people publish those themselves.
 */

type Tab = "scheduled" | "drafts" | "articles" | "published";
const TABS: { key: Tab; label: string }[] = [
  { key: "scheduled", label: "Scheduled" },
  { key: "drafts", label: "Drafts" },
  { key: "articles", label: "Articles" },
  { key: "published", label: "Published" },
];

function tabOf(p: PostView): Tab {
  if (p.status === "published") return "published";
  if (p.kind === "article") return "articles";
  if (p.status === "draft") return "drafts";
  return "scheduled";
}

/*
 * Times show in the account's time zone (Settings), passed from the server, so
 * the server and the browser print the same time.
 */
const ZoneContext = createContext("UTC");

function useWhen() {
  const zone = useContext(ZoneContext);
  return (iso: string | undefined) => (iso ? formatWhen(new Date(iso), zone) : "");
}

interface Editing {
  id?: string;
  kind: "post" | "article";
  title: string;
  body: string;
  firstComment: string;
  /** A new post or article written for a plan row: the row. */
  entryId?: string;
}

export function PostsView({
  posts,
  linkedin,
  authorName,
  authorInitials,
  timerRunning,
  commentDelay,
  timeZone,
  mediaStore,
  initialId,
  newDraft,
}: {
  posts: PostView[];
  linkedin: LinkedInPosting & { configured: boolean };
  authorName: string;
  authorInitials: string;
  timerRunning: boolean;
  /** Minutes between a post going live and its first comment. */
  commentDelay: number;
  /** The account's time zone, e.g. Australia/Sydney. */
  timeZone: string;
  /** Where post images go: Vercel Blob, a local folder (development), or nowhere yet. */
  mediaStore: MediaStoreMode;
  initialId?: string;
  /** Open the editor on a new post or article straight away, e.g. from an empty plan slot. */
  newDraft?: { kind: "post" | "article"; entryId?: string; title?: string; body?: string };
}) {
  const initial = posts.find((p) => p.id === initialId);
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { scheduled: 0, drafts: 0, articles: 0, published: 0 };
    for (const p of posts) c[tabOf(p)]++;
    return c;
  }, [posts]);
  const [tab, setTab] = useState<Tab>(
    newDraft
      ? newDraft.kind === "article"
        ? "articles"
        : "drafts"
      : initial
        ? tabOf(initial)
        : counts.scheduled
          ? "scheduled"
          : counts.drafts
            ? "drafts"
            : counts.articles
              ? "articles"
              : "scheduled",
  );
  const [selectedId, setSelectedId] = useState<string | undefined>(initial?.id);
  const [editing, setEditing] = useState<Editing | null>(
    newDraft
      ? { kind: newDraft.kind, title: newDraft.title ?? "", body: newDraft.body ?? "", firstComment: "", entryId: newDraft.entryId }
      : null,
  );

  const list = useMemo(() => {
    const inTab = posts.filter((p) => tabOf(p) === tab);
    const time = (p: PostView) =>
      new Date(
        tab === "scheduled" ? (p.scheduledAt ?? p.updatedAt) : tab === "published" ? (p.publishedAt ?? p.updatedAt) : p.updatedAt,
      ).getTime();
    return inTab.sort((a, b) => {
      // Failed ones first, so they get seen.
      if (tab === "scheduled" && (a.status === "failed") !== (b.status === "failed")) return a.status === "failed" ? -1 : 1;
      return tab === "scheduled" ? time(a) - time(b) : time(b) - time(a);
    });
  }, [posts, tab]);
  const selected = list.find((p) => p.id === selectedId) ?? list[0];

  function pick(t: Tab) {
    setTab(t);
    setSelectedId(undefined);
    setEditing(null);
  }

  return (
    <ZoneContext.Provider value={timeZone}>
    <div className="flex min-w-0 flex-1">
      <section aria-label="Posts" className="flex w-[400px] shrink-0 flex-col border-r">
        <div role="tablist" aria-label="Show" className="flex shrink-0 gap-1 border-b px-3 py-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => pick(t.key)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-md transition-colors",
                tab === t.key ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.label}
              <span className="text-xs font-normal text-muted-foreground">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <PostingStatus linkedin={linkedin} timerRunning={timerRunning} hasScheduled={counts.scheduled > 0} />
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {list.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(p.id);
                  setEditing(null);
                }}
                aria-current={selected?.id === p.id && !editing}
                className={cn(
                  "flex w-full flex-col gap-1.5 border-b px-4 py-3.5 text-left transition-colors hover:bg-muted/50",
                  selected?.id === p.id && !editing && "bg-muted/70 shadow-[inset_3px_0_0_var(--foreground)]",
                )}
              >
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <StatusChip post={p} />
                  {p.source !== "AILI" && (
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="size-3" />
                      From {p.source}
                    </span>
                  )}
                </span>
                <span className="line-clamp-2 text-md text-foreground">
                  {p.kind === "article" && <b className="font-semibold">{p.title}. </b>}
                  {p.kind === "article" ? articlePlainText(p.body).slice(0, 200) : p.body}
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && <EmptyList tab={tab} />}
        </ol>
      </section>

      <section aria-label="Post" className="flex min-w-0 flex-1 flex-col bg-sidebar">
        {editing ? (
          <Editor
            key={editing.id ?? `new-${editing.kind}`}
            editing={editing}
            media={posts.find((p) => p.id === editing.id)?.media ?? []}
            mediaStore={mediaStore}
            commentDelay={commentDelay}
            onDone={(id) => {
              // A new one lands in Drafts or Articles; show it there.
              if (id && !editing.id) setTab(editing.kind === "article" ? "articles" : "drafts");
              setEditing(null);
              if (id) setSelectedId(id);
            }}
          />
        ) : selected ? (
          <Detail
            key={selected.id}
            post={selected}
            linkedin={linkedin}
            authorName={authorName}
            authorInitials={authorInitials}
            commentDelay={commentDelay}
            mediaStore={mediaStore}
            onEdit={() =>
              setEditing({
                id: selected.id,
                kind: selected.kind,
                title: selected.title,
                body: selected.body,
                firstComment: selected.firstComment,
              })
            }
            onMoved={(t) => {
              setTab(t);
              setSelectedId(selected.id);
            }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="flex max-w-sm flex-col items-center gap-3 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-background text-muted-foreground">
                <Sparkles className="size-4" />
              </span>
              <p className="text-md font-semibold">Write posts in Claude or ChatGPT</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Ask for a post and a time, and it lands here, scheduled. Or click New to write one yourself.{" "}
                <Link href="/settings/connections" className="font-medium text-foreground underline underline-offset-2">
                  Connect Claude or ChatGPT
                </Link>
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
    </ZoneContext.Provider>
  );
}

function StatusChip({ post }: { post: PostView }) {
  const when = useWhen();
  const base = "inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium";
  if (post.kind === "article" && post.status !== "published") {
    return (
      <span className={cn(base, "bg-blue-50 text-blue-700")}>
        <FileText className="size-3" />
        Article · {wordCount(post.body).toLocaleString()} words
      </span>
    );
  }
  switch (post.status) {
    case "scheduled":
      if (post.overdue) {
        return (
          <span className={cn(base, "bg-red-50 text-red-700")}>
            <AlertCircle className="size-3" />
            Overdue · {when(post.scheduledAt)}
          </span>
        );
      }
      return (
        <span className={cn(base, "bg-amber-50 text-amber-700")} suppressHydrationWarning>
          <CalendarClock className="size-3" />
          {when(post.scheduledAt)}
        </span>
      );
    case "publishing":
      return (
        <span className={cn(base, "bg-muted text-muted-foreground")}>
          <Loader2 className="size-3 animate-spin" />
          Publishing
        </span>
      );
    case "failed":
      return (
        <span className={cn(base, "bg-red-50 text-red-700")}>
          <AlertCircle className="size-3" />
          Not published
        </span>
      );
    case "published":
      return (
        <span className={cn(base, "bg-emerald-50 text-emerald-700")} suppressHydrationWarning>
          <Check className="size-3" />
          {when(post.publishedAt)}
        </span>
      );
    default:
      return <span className={cn(base, "bg-muted text-muted-foreground")}>Draft</span>;
  }
}

function EmptyList({ tab }: { tab: Tab }) {
  const text: Record<Tab, string> = {
    scheduled: "Nothing scheduled. Schedule a draft, or ask Claude or ChatGPT to write and schedule one.",
    drafts: "No drafts.",
    articles: "No articles. Ask Claude or ChatGPT to write one and save it in AILI.",
    published: "Nothing published from AILI yet.",
  };
  return <p className="p-8 text-center text-xs leading-relaxed text-muted-foreground">{text[tab]}</p>;
}

/** One line under the tabs: can AILI publish, and is the timer running? */
function PostingStatus({
  linkedin,
  timerRunning,
  hasScheduled,
}: {
  linkedin: LinkedInPosting & { configured: boolean };
  timerRunning: boolean;
  hasScheduled: boolean;
}) {
  const dot = (ok: boolean) => <span className={cn("size-1.5 shrink-0 rounded-full", ok ? "bg-emerald-500" : "bg-amber-500")} />;
  const line = "flex shrink-0 items-center gap-2 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground";
  if (!linkedin.connected || linkedin.expired) {
    return (
      <div className={line}>
        {dot(false)}
        <span className="min-w-0 flex-1">
          {linkedin.expired ? "LinkedIn posting has expired. " : "To publish, connect LinkedIn posting. "}
          <Link href="/settings/connections" className="font-medium text-foreground underline underline-offset-2">
            {linkedin.expired ? "Reconnect" : "Connect"}
          </Link>
        </span>
      </div>
    );
  }
  const days = linkedin.daysLeft;
  const timerOk = timerRunning;
  return (
    <div className={line} suppressHydrationWarning>
      {dot(!hasScheduled || timerOk)}
      <span className="min-w-0 flex-1 truncate">
        LinkedIn: {linkedin.name ?? "connected"}
        {days !== undefined && days <= 60 ? ` · reconnect in ${days} ${days === 1 ? "day" : "days"}` : ""}
        {hasScheduled && !timerOk ? " · scheduled posts go out while Chrome is open" : ""}
      </span>
    </div>
  );
}

function Editor({
  editing,
  media,
  mediaStore,
  commentDelay,
  onDone,
}: {
  editing: Editing;
  media: PostView["media"];
  mediaStore: MediaStoreMode;
  commentDelay: number;
  onDone: (id?: string) => void;
}) {
  const [title, setTitle] = useState(editing.title);
  const [body, setBody] = useState(editing.body);
  const [firstComment, setFirstComment] = useState(editing.firstComment);
  const [pending, start] = useTransition();
  const isPost = editing.kind === "post";
  const over = isPost && (body.length > POST_MAX_CHARS || firstComment.length > COMMENT_MAX_CHARS);

  function save() {
    start(async () => {
      try {
        const id = await savePost({ id: editing.id, kind: editing.kind, title, body, firstComment, entryId: editing.entryId });
        toast.success(editing.id ? "Saved." : isPost ? "Saved in Drafts." : "Article saved.");
        onDone(id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not save.");
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-5">
        <span className="mr-auto text-md font-semibold">
          {editing.id ? "Edit" : "New"} {isPost ? "post" : "article"}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button size="sm" disabled={pending || over || !body.trim() || (!isPost && !title.trim())} onClick={save}>
          {pending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-y-auto p-8">
        <div className="flex w-full max-w-[600px] flex-col gap-3">
          {!isPost && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="article-title">Title</Label>
              <Input id="article-title" value={title} onChange={(e) => setTitle(e.target.value)} className="bg-background" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="post-body">{isPost ? "Post" : "Article"}</Label>
            <Textarea
              id="post-body"
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={isPost ? "What do you want to say?" : "Write the article. # for headings, - for lists, **bold**."}
              className={cn("min-h-[320px] bg-background text-md leading-relaxed", !isPost && "min-h-[440px]")}
            />
          </div>
          <p className={cn("text-right text-xs text-muted-foreground", body.length > POST_MAX_CHARS && isPost && "font-medium text-red-600")}>
            {isPost ? `${body.length.toLocaleString()} / ${POST_MAX_CHARS.toLocaleString()} characters` : `${wordCount(body).toLocaleString()} words`}
          </p>
          {isPost && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="first-comment">
                First comment <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="first-comment"
                value={firstComment}
                onChange={(e) => setFirstComment(e.target.value)}
                placeholder="A link or extra detail. LinkedIn shows posts with links further down, so links go here."
                className="min-h-[88px] bg-background text-md leading-relaxed"
              />
              <p className="flex justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  Posted {delayLabel(commentDelay).toLowerCase()} the post goes live.{" "}
                  <Link href="/settings/sending" className="underline underline-offset-2">
                    Change
                  </Link>
                </span>
                <span className={cn(firstComment.length > COMMENT_MAX_CHARS && "font-medium text-red-600")}>
                  {firstComment.length.toLocaleString()} / {COMMENT_MAX_CHARS.toLocaleString()}
                </span>
              </p>
            </div>
          )}
          {isPost &&
            (editing.id ? (
              <div className="mt-2">
                <MediaPanel postId={editing.id} media={media} store={mediaStore} />
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Images or a PDF carousel? Save first, then add them.</p>
            ))}
        </div>
      </div>
    </div>
  );
}

function defaultScheduleValue(post: PostView, zone: string): string {
  if (post.scheduledAt) return toWallInput(new Date(post.scheduledAt), zone);
  // Its plan row's day and time, while that is still ahead.
  if (post.planned && `${post.planned.day}T${post.planned.time}` > toWallInput(new Date(Date.now() + 5 * 60_000), zone)) {
    return `${post.planned.day}T${post.planned.time}`;
  }
  // Tomorrow at 9:00 in the account's time zone.
  const tomorrow = toWallInput(new Date(Date.now() + 86400000), zone).slice(0, 10);
  return `${tomorrow}T09:00`;
}

function SchedulePicker({ post, label, onDone }: { post: PostView; label: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const zone = useContext(ZoneContext);
  const when = useWhen();
  const [value, setValue] = useState(() => defaultScheduleValue(post, zone));
  const [pending, start] = useTransition();
  function save() {
    // The picker's time is read in the account's time zone, the one shown under it.
    const at = wallTimeToDate(value, zone);
    if (!at) return;
    start(async () => {
      try {
        await schedulePost(post.id, at.toISOString());
        toast.success(`Scheduled for ${when(at.toISOString())}.`);
        setOpen(false);
        onDone();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not save.");
      }
    });
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarClock />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="schedule-at">Publish on LinkedIn at</Label>
          <Input id="schedule-at" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="text-xs text-muted-foreground">Your time ({zone.replace(/_/g, " ")}).</span>
        </div>
        <Button disabled={pending || !value} onClick={save}>
          {pending && <Loader2 className="animate-spin" />}
          Schedule
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** The first comment under the preview: what it says and whether it is posted. */
function FirstComment({ post, authorInitials, commentDelay }: { post: PostView; authorInitials: string; commentDelay: number }) {
  const when = useWhen();
  const [pending, start] = useTransition();
  const state =
    post.commentStatus === "posted"
      ? { text: "Posted", className: "text-emerald-700" }
      : post.commentStatus === "failed"
        ? { text: `Not posted: ${post.commentError ?? "LinkedIn refused it"}`, className: "text-red-700" }
        : post.commentStatus === "pending" || post.commentStatus === "posting"
          ? { text: `Posting ${when(post.commentAt)}`, className: "text-muted-foreground" }
          : { text: `${delayLabel(commentDelay)} the post goes live`, className: "text-muted-foreground" };
  return (
    <div className="flex gap-2.5 border-t pt-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-2xs font-semibold text-background">
        {authorInitials}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="rounded-lg rounded-tl-none bg-muted px-3 py-2 text-md leading-relaxed whitespace-pre-wrap">{post.firstComment}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <MessageCircle className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">First comment ·</span>
          <span className={state.className} suppressHydrationWarning>
            {state.text}
          </span>
          {(post.commentStatus === "pending" || post.commentStatus === "failed") && post.status === "published" && (
            <>
              {post.commentStatus === "pending" && (
                <>
                  <CommentTimePicker post={post} label="Change time" />
                  <span className="text-muted-foreground">·</span>
                </>
              )}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    try {
                      await cancelFirstCommentOnPost(post.id);
                      toast.success("First comment cancelled.");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "That did not work.");
                    }
                  })
                }
              >
                Cancel
              </Button>
            </>
          )}
          {post.commentStatus === "failed" && (
            <>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(post.firstComment)
                    .then(() => toast.success("Comment copied. Paste it under your post on LinkedIn."))
                    .catch(() => toast.error("Could not copy. Select the comment and copy it."))
                }
              >
                Copy comment
              </Button>
              {post.url && (
                <a href={post.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline">
                  Open post
                  <ExternalLink className="size-3" />
                </a>
              )}
              <span className="text-muted-foreground">·</span>
            </>
          )}
          {post.commentStatus === "failed" && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    await retryFirstComment(post.id);
                    toast.success("First comment posted.");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "LinkedIn did not post it.");
                  }
                })
              }
            >
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Picks when a live post's first comment goes out, then schedules it. */
function CommentTimePicker({ post, text, label, onDone }: { post: PostView; text?: string; label: string; onDone?: () => void }) {
  const zone = useContext(ZoneContext);
  const when = useWhen();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() =>
    post.commentAt && post.commentStatus === "pending"
      ? toWallInput(new Date(post.commentAt), zone)
      : toWallInput(new Date(Date.now() + 90 * 60_000), zone).slice(0, 14) + "00",
  );
  const [pending, start] = useTransition();
  const comment = text ?? post.firstComment;
  function save() {
    const at = wallTimeToDate(value, zone);
    if (!at) return;
    start(async () => {
      try {
        await addFirstCommentToPost(post.id, comment, at.toISOString());
        toast.success(`First comment scheduled for ${when(at.toISOString())}.`);
        setOpen(false);
        onDone?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not save.");
      }
    });
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {text === undefined ? (
          <Button variant="link" size="sm" className="h-auto p-0 text-xs">
            {label}
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={!comment.trim() || comment.length > COMMENT_MAX_CHARS}>
            <CalendarClock />
            {label}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="comment-at">Post the comment at</Label>
          <Input id="comment-at" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="text-xs text-muted-foreground">Your time ({zone.replace(/_/g, " ")}).</span>
        </div>
        <Button disabled={pending || !value} onClick={save}>
          {pending && <Loader2 className="animate-spin" />}
          Schedule
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** A published post with no first comment: write one, then post it now or at a time. */
function AddFirstComment({ post }: { post: PostView }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const over = text.length > COMMENT_MAX_CHARS;
  function postNow() {
    start(async () => {
      try {
        await addFirstCommentToPost(post.id, text);
        toast.success("First comment posted on LinkedIn.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "LinkedIn did not post it.");
      }
    });
  }
  return (
    <div className="flex w-full max-w-[560px] flex-col gap-3 rounded-xl border bg-background px-5 py-4">
      <Label htmlFor="add-first-comment" className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <MessageCircle className="size-3.5" />
        Add a first comment
      </Label>
      <Textarea
        id="add-first-comment"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="A link or extra detail, posted under your post."
        className="min-h-[72px] text-md leading-relaxed"
      />
      <div className="flex items-center gap-2">
        <span className={cn("mr-auto text-xs text-muted-foreground", over && "font-medium text-red-600")}>
          {over ? `${text.length.toLocaleString()} / ${COMMENT_MAX_CHARS.toLocaleString()} characters` : "Goes under your post on LinkedIn."}
        </span>
        <CommentTimePicker post={post} text={text} label="Schedule" onDone={() => setText("")} />
        <Button size="sm" disabled={pending || !text.trim() || over} onClick={postNow}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          Post now
        </Button>
      </div>
    </div>
  );
}

function Detail({
  post,
  linkedin,
  authorName,
  authorInitials,
  commentDelay,
  mediaStore,
  onEdit,
  onMoved,
}: {
  post: PostView;
  linkedin: LinkedInPosting & { configured: boolean };
  authorName: string;
  authorInitials: string;
  commentDelay: number;
  mediaStore: MediaStoreMode;
  onEdit: () => void;
  onMoved: (tab: Tab) => void;
}) {
  const when = useWhen();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"publish" | "delete" | null>(null);
  const presence = useHelperPresence({ poll: false });
  const canPublish = linkedin.connected && !linkedin.expired;
  const isArticle = post.kind === "article";
  const editable = post.status !== "published" && post.status !== "publishing";

  function run(fn: () => Promise<unknown>, done: string, moveTo?: Tab) {
    start(async () => {
      try {
        await fn();
        if (done) toast.success(done);
        if (moveTo) onMoved(moveTo);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not work.");
      }
    });
  }

  function publishNow() {
    setConfirm(null);
    start(async () => {
      try {
        const { url } = await publishPostNow(post.id);
        toast.success("Published on LinkedIn.", url ? { action: { label: "View", onClick: () => window.open(url, "_blank") } } : undefined);
        onMoved("published");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "LinkedIn did not publish it.");
      }
    });
  }

  function openInLinkedIn() {
    const html = articleHtml(post.body);
    const text = articlePlainText(post.body);
    // The article goes on the clipboard too, in case the editor is not filled in.
    try {
      void navigator.clipboard
        .write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ])
        .catch(() => navigator.clipboard.writeText(text).catch(() => {}));
    } catch {
      void navigator.clipboard.writeText(text).catch(() => {});
    }
    // The extension keeps it for the LinkedIn tab that opens next, and fills in the editor.
    window.postMessage({ source: "aili-page", type: "open-article", title: post.title, html, text }, window.location.origin);
    window.open("https://www.linkedin.com/article/new/", "_blank", "noopener");
    toast(
      presence.state === "found"
        ? "Opening LinkedIn. The extension fills in the title and text; then click Publish or Schedule there."
        : "Opening LinkedIn. The article is copied: type the title, then paste the text with ⌘V (Ctrl+V).",
      { duration: 8000 },
    );
  }

  const bar = (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-5">
      <span className="mr-auto flex min-w-0 items-center gap-2 text-md text-muted-foreground" suppressHydrationWarning>
        {isArticle ? (
          post.status === "published" ? (
            <>
              <Check className="size-4 shrink-0 text-emerald-600" />
              Published in LinkedIn {post.publishedAt ? `· marked ${when(post.publishedAt)}` : ""}
            </>
          ) : (
            <>
              <FileText className="size-4 shrink-0" />
              Article · not published
            </>
          )
        ) : post.status === "scheduled" ? (
          <>
            <CalendarClock className="size-4 shrink-0" />
            Scheduled for {when(post.scheduledAt)}
          </>
        ) : post.status === "published" ? (
          <>
            <Check className="size-4 shrink-0 text-emerald-600" />
            Published {when(post.publishedAt)}
          </>
        ) : post.status === "publishing" ? (
          <>
            <Loader2 className="size-4 shrink-0 animate-spin" />
            Publishing
          </>
        ) : post.status === "failed" ? (
          <>
            <AlertCircle className="size-4 shrink-0 text-red-600" />
            Not published
          </>
        ) : (
          "Draft"
        )}
      </span>

      {editable && (
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil />
          Edit
        </Button>
      )}
      {!isArticle && editable && (
        <SchedulePicker
          post={post}
          label={post.status === "scheduled" ? "Change time" : "Schedule"}
          onDone={() => onMoved("scheduled")}
        />
      )}
      {!isArticle && editable && (
        <Button variant="outline" size="sm" disabled={pending || !canPublish} onClick={() => setConfirm("publish")}>
          <Send />
          {post.status === "failed" ? "Try again" : "Publish now"}
        </Button>
      )}
      {isArticle && post.status !== "published" && (
        <Button size="sm" onClick={openInLinkedIn}>
          Open in LinkedIn
          <ExternalLink />
        </Button>
      )}
      {!isArticle && post.status === "published" && post.url && (
        <Button variant="outline" size="sm" asChild>
          <a href={post.url} target="_blank" rel="noreferrer">
            View on LinkedIn
            <ExternalLink />
          </a>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isArticle && (post.status === "scheduled" || post.status === "failed") && (
            <DropdownMenuItem onSelect={() => run(() => unschedulePost(post.id), "Moved to Drafts.", "drafts")}>
              <Undo2 />
              Cancel schedule
            </DropdownMenuItem>
          )}
          {isArticle && (
            <DropdownMenuItem
              onSelect={() =>
                post.status === "published"
                  ? run(() => markArticlePublished(post.id, false), "Back in Articles.", "articles")
                  : run(() => markArticlePublished(post.id), "Marked as published.", "published")
              }
            >
              <Check />
              {post.status === "published" ? "Mark as not published" : "Mark as published"}
            </DropdownMenuItem>
          )}
          {post.status !== "publishing" && (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
              <Trash2 />
              Delete from AILI
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {bar}
      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto p-8">
        {post.overdue && (
          <div className="flex w-full max-w-[560px] items-start gap-2.5 rounded-xl bg-red-50 px-4 py-3 text-md text-red-800">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              Its time has passed and the scheduled-posts timer has not run. It goes out the next time the timer runs or
              this page reloads; Publish now sends it straight away.
            </span>
          </div>
        )}
        {post.status === "failed" && post.error && (
          <div className="flex w-full max-w-[560px] items-start gap-2.5 rounded-xl bg-red-50 px-4 py-3 text-md text-red-800">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{post.error}</span>
          </div>
        )}
        {!isArticle && editable && !canPublish && (
          <div className="w-full max-w-[560px] rounded-xl bg-amber-50 px-4 py-3 text-md text-amber-900">
            {linkedin.expired ? "LinkedIn posting has expired." : "LinkedIn posting is not connected yet."}{" "}
            <Link href="/settings/connections" className="font-medium underline underline-offset-2">
              {linkedin.expired ? "Reconnect it in Settings" : "Connect it in Settings"}
            </Link>{" "}
            to publish.
          </div>
        )}
        {isArticle && post.status !== "published" && (
          <div className="w-full max-w-[640px] rounded-xl bg-blue-50 px-4 py-3 text-md leading-relaxed text-blue-900">
            LinkedIn only lets you publish articles yourself. Open in LinkedIn fills in LinkedIn&apos;s article editor for
            you; then click Publish, or Schedule, there. Come back and mark it as published.
          </div>
        )}

        {isArticle ? (
          <article className="w-full max-w-[640px] overflow-hidden rounded-xl border bg-background">
            <div className="flex flex-col gap-3 px-7 py-6">
              <h2 className="text-2xl font-bold tracking-tight text-balance">{post.title}</h2>
              <div
                className="flex flex-col gap-3 text-md leading-relaxed text-foreground/85 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-1 [&_h3]:font-semibold [&_h3]:text-foreground [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                // articleHtml escapes all text; only its own tags remain.
                dangerouslySetInnerHTML={{ __html: articleHtml(post.body) }}
              />
              <p className="text-xs text-muted-foreground">
                {wordCount(post.body).toLocaleString()} words · {Math.max(1, Math.round(wordCount(post.body) / 230))} min read
                {post.source !== "AILI" ? ` · from ${post.source}` : ""}
              </p>
            </div>
          </article>
        ) : (
          <>
            {editable && (
              <div className="w-full max-w-[560px] rounded-xl border bg-background px-5 py-4">
                <MediaPanel postId={post.id} media={post.media} store={mediaStore} />
              </div>
            )}
            {post.status === "published" && post.url && !post.firstComment.trim() && <AddFirstComment post={post} />}
            <article className="flex w-full max-w-[560px] flex-col gap-3 rounded-xl border bg-background px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-11 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                  {authorInitials}
                </span>
                <div className="min-w-0">
                  <div className="text-md font-semibold">{authorName}</div>
                  <div className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {post.status === "published" ? when(post.publishedAt) : post.status === "scheduled" ? when(post.scheduledAt) : "Not posted yet"}
                  </div>
                </div>
              </div>
              <p className="text-md leading-relaxed whitespace-pre-wrap">{post.body}</p>
              <MediaPreview media={post.media} />
              <div className="flex justify-between border-t pt-2.5 text-xs text-muted-foreground">
                <span>
                  {post.body.length.toLocaleString()} / {POST_MAX_CHARS.toLocaleString()} characters
                  {post.source !== "AILI" ? ` · from ${post.source}` : ""}
                </span>
                <span>How it will look on LinkedIn</span>
              </div>
              {post.firstComment.trim() && (
                <FirstComment post={post} authorInitials={authorInitials} commentDelay={commentDelay} />
              )}
            </article>
          </>
        )}
      </div>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm === "publish" ? "Publish on LinkedIn now?" : "Delete from AILI?"}</DialogTitle>
            <DialogDescription>
              {confirm === "publish"
                ? `It goes on your LinkedIn profile straight away, as ${authorName}.`
                : post.status === "published"
                  ? "It stays on LinkedIn. This only removes it from AILI."
                  : "It is gone for good."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            {confirm === "publish" ? (
              <Button disabled={pending} onClick={publishNow}>
                <Send />
                Publish now
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  setConfirm(null);
                  run(() => deletePost(post.id), "Deleted.");
                }}
              >
                Delete
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
