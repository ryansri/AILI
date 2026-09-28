"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Lightbulb, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { addIdea, deleteIdea, ideaToSlot, schedulePost } from "@/lib/client-actions";
import type { IdeaView, KindFilter } from "@/lib/content-plan";
import { dayLabel, type ContentKind, type Slot } from "@/lib/plan";

export { dayLabel };
import { formatWhen } from "@/lib/time-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { contentHref } from "./content-shell";
import { KindTag } from "./kind-tag";

/*
 * Pieces shared by the Plan, Calendar and Plan next week views: how a slot's
 * state looks, a slot row with its one next action, and the ideas list.
 */

/** "9:00 am" for a slot, in the account's time zone. */
export function slotTime(slot: Slot, timeZone: string): string {
  return formatWhen(new Date(slot.at), timeZone).split(", ")[1] ?? "";
}

export const STATE_LABEL: Record<Slot["state"], string> = {
  published: "Published",
  scheduled: "Scheduled",
  draft: "Draft ready",
  empty: "Empty",
  missed: "Missed",
};

export const STATE_CLASS: Record<Slot["state"], string> = {
  published: "bg-emerald-50 text-emerald-700",
  scheduled: "bg-blue-50 text-blue-700",
  draft: "bg-amber-50 text-amber-800",
  empty: "bg-muted text-muted-foreground",
  missed: "bg-red-50 text-red-700",
};

export function StateChip({ slot }: { slot: Slot }) {
  const label =
    slot.state === "published" && slot.late
      ? "Published late"
      : slot.state === "draft" && slot.kind === "article"
        ? slot.item?.body.trim()
          ? "Ready for LinkedIn"
          : "Title only"
        : STATE_LABEL[slot.state];
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap", STATE_CLASS[slot.state])}>
      {label}
    </span>
  );
}

function itemText(slot: Slot): string {
  const i = slot.item;
  if (!i) return slot.state === "missed" ? "Nothing went out" : "Nothing written yet";
  if (i.kind === "article") return i.title || i.body.split("\n")[0];
  return i.body.replace(/\s+/g, " ");
}

/** Copies the words to ask Claude with, and opens Claude. */
export function askClaudeFor(slot: Slot, timeZone: string) {
  const when = `${dayLabel(slot.day)} at ${slotTime(slot, timeZone)}`;
  const ask =
    slot.kind === "article"
      ? `In AILI, write a LinkedIn article for my empty article slot on ${dayLabel(slot.day)}. Use an idea from my AILI ideas list if one fits, and save it for that day.`
      : `In AILI, write a LinkedIn post for my empty slot on ${when}. Use an idea from my AILI ideas list if one fits, show it to me, then schedule it for that time.`;
  window.open("https://claude.ai/new", "_blank", "noopener");
  void navigator.clipboard.writeText(ask).then(
    () => toast.success("Copied. Paste it into Claude."),
    () => toast.error("Could not copy. Ask Claude to fill that slot."),
  );
}

function UseIdea({ slot, ideas }: { slot: Slot; ideas: IdeaView[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const fitting = ideas.filter((i) => i.kind === slot.kind);
  if (fitting.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs">
          <Lightbulb />
          Idea
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-1 p-1.5">
        <p className="px-2 py-1 text-xs text-muted-foreground">Put an idea in {dayLabel(slot.day)}</p>
        {fitting.map((idea) => (
          <button
            key={idea.id}
            type="button"
            disabled={pending}
            className="rounded-md px-2 py-1.5 text-left text-md hover:bg-muted"
            onClick={() =>
              start(async () => {
                try {
                  await ideaToSlot(idea.id, slot.day, slot.kind);
                  toast.success(`In ${dayLabel(slot.day)}. Write it up when you are ready.`);
                  setOpen(false);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "That did not save.");
                }
              })
            }
          >
            {idea.text}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** At least a minute ahead, so it can still be scheduled. */
function stillAhead(slot: Slot): boolean {
  return new Date(slot.at).getTime() > Date.now() + 60_000;
}

/** One slot: time, kind, what fills it, its state and the one next thing to do. */
export function SlotRow({ slot, timeZone, kind, ideas, compact }: { slot: Slot; timeZone: string; kind: KindFilter; ideas: IdeaView[]; compact?: boolean }) {
  const [pending, start] = useTransition();
  const item = slot.item;
  const future = stillAhead(slot);
  const open = item ? contentHref("all", kind, { post: item.id }) : undefined;

  let actions: React.ReactNode = null;
  if (slot.state === "empty") {
    actions = (
      <>
        <Button variant="outline" size="xs" asChild>
          <Link href={contentHref("all", kind, { new: slot.kind, slot: slot.day })}>Write</Link>
        </Button>
        <UseIdea slot={slot} ideas={ideas} />
        <Button variant="outline" size="xs" onClick={() => askClaudeFor(slot, timeZone)}>
          <Sparkles />
          Ask Claude
        </Button>
      </>
    );
  } else if (slot.state === "draft" && slot.kind === "post" && item) {
    actions = (
      <>
        <Button variant="outline" size="xs" asChild>
          <Link href={open!}>Open</Link>
        </Button>
        {future && (
          <Button
            size="xs"
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  await schedulePost(item.id, slot.at);
                  toast.success(`Scheduled for ${dayLabel(slot.day)}, ${slotTime(slot, timeZone)}.`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "That did not save.");
                }
              })
            }
          >
            Schedule {slotTime(slot, timeZone)}
          </Button>
        )}
      </>
    );
  } else if (item) {
    actions = (
      <Button variant="ghost" size="xs" asChild>
        <Link href={open!}>
          Open
          {slot.state === "published" && <ExternalLink />}
        </Link>
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-md",
        slot.state === "empty" && "border-dashed bg-muted/40",
        compact && "py-1.5",
      )}
    >
      <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">{slotTime(slot, timeZone)}</span>
      <KindTag kind={slot.kind} />
      <span className={cn("min-w-0 flex-1 truncate", !item && "text-muted-foreground")}>{itemText(slot)}</span>
      <StateChip slot={slot} />
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

/** The ideas list: add, remove, and (in a slot row) use. */
export function IdeasPanel({ ideas, kind }: { ideas: IdeaView[]; kind: KindFilter }) {
  const [text, setText] = useState("");
  const [ideaKind, setIdeaKind] = useState<ContentKind>(kind === "article" ? "article" : "post");
  const [pending, start] = useTransition();

  function add() {
    if (!text.trim()) return;
    start(async () => {
      try {
        await addIdea({ kind: ideaKind, text });
        setText("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not save.");
      }
    });
  }

  return (
    <aside aria-label="Ideas" className="flex w-[300px] shrink-0 flex-col gap-2.5 overflow-y-auto border-l bg-sidebar p-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-md font-semibold">Ideas</h2>
        <span className="text-xs text-muted-foreground">{ideas.length}</span>
      </div>
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="A topic worth a post" aria-label="New idea" className="bg-background" />
        <div className="flex items-center gap-1.5">
          {(["post", "article"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={ideaKind === k}
              onClick={() => setIdeaKind(k)}
              className={cn("rounded-full", ideaKind === k ? "ring-2 ring-foreground/70" : "opacity-60 hover:opacity-100")}
            >
              <KindTag kind={k} />
            </button>
          ))}
          <Button type="submit" size="xs" variant="outline" className="ml-auto" disabled={pending || !text.trim()}>
            <Plus />
            Add
          </Button>
        </div>
      </form>
      {ideas.map((idea) => (
        <div key={idea.id} className="group flex flex-col gap-1.5 rounded-lg border bg-background px-3 py-2.5 text-md">
          <span>{idea.text}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <KindTag kind={idea.kind} />
            {idea.source !== "AILI" && `From ${idea.source}`}
            <button
              type="button"
              aria-label={`Delete idea: ${idea.text}`}
              className="ml-auto rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100"
              onClick={() =>
                start(async () => {
                  try {
                    await deleteIdea(idea.id);
                  } catch {
                    toast.error("That did not work.");
                  }
                })
              }
            >
              <Trash2 className="size-3.5" />
            </button>
          </span>
        </div>
      ))}
      {ideas.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Save topics here as they come to you, or tell Claude &quot;save this as an idea in AILI&quot;. Then drop them into empty slots.
        </p>
      )}
    </aside>
  );
}
