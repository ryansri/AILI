"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ExternalLink, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deleteEntry, markEntryPosted, skipEntry, updateEntry } from "@/lib/client-actions";
import type { EntryView } from "@/lib/content-plan";
import { articlePlainText } from "@/lib/article-html";
import { daysBetween, dayLabel } from "@/lib/plan";
import type { EntryInput } from "@/lib/plan-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { askClaudeFor, whenLabel } from "./plan-ui";

function Steps({ entry }: { entry: EntryView }) {
  const labels = entry.kind === "article" ? ["Planned", "Written", "Posted"] : ["Planned", "Written", "Scheduled", "Posted"];
  const posted = entry.status === "posted";
  const at = posted ? labels.length - 1 : entry.status === "scheduled" ? 2 : entry.post?.body.trim() ? 1 : 0;
  return (
    <ol className="flex items-start" aria-label="Progress">
      {labels.map((label, i) => {
        const done = i < at || posted;
        return (
          <li key={label} className="flex flex-1 items-start last:flex-none">
            <span className="flex w-16 flex-col items-center gap-1.5 text-xs">
              <i
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border-2",
                  done ? "border-foreground bg-foreground text-background" : i === at ? "border-foreground" : "border-stone-300",
                )}
              >
                {done && <Check className="size-3" strokeWidth={3} />}
              </i>
              <span className={i <= at ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</span>
            </span>
            {i < labels.length - 1 && <span className="mt-2.5 h-0.5 flex-1 bg-stone-200" />}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  value,
  multiline,
  placeholder,
  list,
  onSave,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  placeholder?: string;
  list?: string;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  const id = `entry-${label.toLowerCase()}`;
  const common = {
    id,
    value: v,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: () => v.trim() !== value.trim() && onSave(v),
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </label>
      {multiline ? <Textarea {...common} rows={3} className="min-h-0 resize-none" /> : <Input {...common} list={list} />}
    </div>
  );
}

/** A row opened from the plan: its progress, its details (saved as you leave each box), and what to do next. */
export function EntryPanel({
  entry,
  today,
  onClose,
  onMove,
}: {
  entry: EntryView;
  today: string;
  onClose: () => void;
  onMove: () => void;
}) {
  const [pending, start] = useTransition();

  function act(fn: () => Promise<unknown>, done?: string) {
    start(async () => {
      try {
        await fn();
        if (done) toast.success(done);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not work.");
      }
    });
  }

  const save = (patch: EntryInput) => act(() => updateEntry(entry.id, patch));
  const post = entry.post;
  const postHref = post ? `/posts?tab=posts&post=${post.id}` : undefined;
  const writeHref = `/posts?tab=posts&new=${entry.kind}&entry=${entry.id}`;
  const soon = entry.day && entry.day >= today ? daysBetween(today, entry.day) : undefined;

  const note =
    entry.status === "missed"
      ? { tone: "bad", text: "Its day passed and nothing went out. Move it, skip it, or mark it as posted if it did go out." }
      : entry.due && entry.status === "planned"
        ? { tone: "warn", text: soon === 0 ? "Due today and not written yet." : `Due in ${soon} ${soon === 1 ? "day" : "days"} and not written yet.` }
        : entry.due && entry.status === "written"
          ? { tone: "warn", text: "Written, but not scheduled yet." }
          : entry.status === "written" && entry.kind === "article"
            ? { tone: "info", text: "LinkedIn only lets you publish articles yourself: open it and click Open in LinkedIn on its day." }
            : null;

  return (
    <aside aria-label="Plan row" className="flex w-[420px] shrink-0 flex-col border-l bg-background shadow-[-12px_0_30px_rgba(0,0,0,0.05)]">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-5 text-md text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">
          {whenLabel(entry)} · {entry.kind === "article" ? "Article" : "Post"}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div key={entry.id} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        {entry.status === "skipped" ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-md text-muted-foreground">Skipped. It does not count as missed.</p>
        ) : (
          <Steps entry={entry} />
        )}
        {note && (
          <p
            className={cn(
              "rounded-lg px-3 py-2 text-md",
              note.tone === "bad" ? "bg-red-50 text-red-800" : note.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-muted text-muted-foreground",
            )}
          >
            {note.text}
          </p>
        )}

        <Field label="Topic" value={entry.topic} placeholder="What it is about" onSave={(topic) => save({ topic })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Channel" value={entry.channel} placeholder="e.g. Personal" onSave={(channel) => save({ channel })} />
          <Field label="Format" value={entry.format} placeholder="e.g. Carousel" onSave={(format) => save({ format })} />
          <Field label="Pillar" value={entry.pillar} list="plan-pillars" placeholder="e.g. Sales tips" onSave={(pillar) => save({ pillar })} />
          <Field label="Goal" value={entry.goal} placeholder="e.g. Trust" onSave={(goal) => save({ goal })} />
          <Field label="Vertical" value={entry.vertical} placeholder="e.g. Accounting" onSave={(vertical) => save({ vertical })} />
          <Field label="Funnel" value={entry.funnel} placeholder="e.g. TOFU" onSave={(funnel) => save({ funnel })} />
        </div>
        <Field label="Hook" value={entry.hook} multiline placeholder="The first line or angle" onSave={(hook) => save({ hook })} />
        <Field label="Notes" value={entry.notes} multiline onSave={(notes) => save({ notes })} />
        {entry.day && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="entry-time" className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
              Time
            </label>
            <Input
              id="entry-time"
              type="time"
              className="w-32"
              defaultValue={entry.time ?? ""}
              onBlur={(e) => e.target.value !== (entry.time ?? "") && save({ time: e.target.value || null })}
            />
          </div>
        )}

        {post && post.body.trim() && (
          <Link href={postHref!} className="flex flex-col gap-1 rounded-xl border bg-sidebar p-3 text-md hover:bg-muted/60">
            <span className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
              {entry.kind === "article" ? "The article" : "The post"}
            </span>
            {entry.kind === "article" && <b className="font-semibold">{post.title}</b>}
            <span className="line-clamp-3 text-foreground/80">{entry.kind === "article" ? articlePlainText(post.body).slice(0, 300) : post.body}</span>
          </Link>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {entry.status === "planned" || (entry.status === "missed" && !post?.body.trim()) ? (
            <>
              <Button size="sm" onClick={() => askClaudeFor(entry)}>
                <Sparkles />
                Write with Claude
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={post ? postHref! : writeHref}>Write it myself</Link>
              </Button>
            </>
          ) : entry.status === "posted" && post?.url ? (
            <Button size="sm" variant="outline" asChild>
              <a href={post.url} target="_blank" rel="noreferrer">
                View on LinkedIn
                <ExternalLink />
              </a>
            </Button>
          ) : post ? (
            <Button size="sm" asChild>
              <Link href={postHref!}>
                {entry.status === "written" && entry.kind === "post" ? "Schedule it" : entry.kind === "article" && entry.status === "written" ? "Open the article" : "Open the post"}
              </Link>
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {entry.status !== "posted" && (
            <Button size="sm" variant="outline" disabled={pending} onClick={onMove}>
              Move
            </Button>
          )}
          {entry.status !== "posted" && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => act(() => skipEntry(entry.id, !entry.skipped), entry.skipped ? "Back in the plan." : "Skipped.")}
            >
              {entry.skipped ? "Don't skip" : "Skip"}
            </Button>
          )}
          {(!post || post.status !== "published") && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => act(() => markEntryPosted(entry.id, !entry.postedAt), entry.postedAt ? "No longer marked as posted." : "Marked as posted.")}
            >
              {entry.postedAt ? "Not posted" : "Mark as posted"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-red-700 hover:text-red-800"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Delete “${entry.topic || "this row"}” from the plan?${post ? " Its post stays in Posts." : ""}`)) return;
              act(async () => {
                await deleteEntry(entry.id);
                onClose();
              }, "Deleted from the plan.");
            }}
          >
            <Trash2 />
            Delete
          </Button>
        </div>
        {entry.source !== "AILI" && (
          <p className="text-xs text-muted-foreground">
            From {entry.source === "Import" ? "your sheet" : entry.source}
            {entry.day ? ` · ${dayLabel(entry.day)}` : ""}
          </p>
        )}
      </div>
    </aside>
  );
}
