"use client";

import { useState, useTransition } from "react";
import { GripVertical, Hourglass, Inbox, List, Plus, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createStage, createTag, reorderStages } from "@/lib/actions";
import { sameView, type View } from "@/lib/rows";
import { TAG_COLORS, type Account, type Person, type StageDef, type Tag, type TagColor } from "@/lib/types";
import { averageReplyMs, shortDuration } from "@/lib/stats";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CountBadge } from "@/components/count-badge";
import { TagDot } from "@/components/tag-chip";

export interface SidebarCounts {
  now: number;
  waiting: number;
  all: number;
  starred: number;
  tags: Record<string, number>;
  stages: Record<string, number>;
}

const SWATCH: Record<TagColor, string> = {
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  pink: "bg-pink-500",
  stone: "bg-stone-400",
};

function Item({
  label,
  count,
  active,
  onClick,
  icon: Icon,
  lead,
  strong,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  lead?: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group/item flex h-[30px] w-full min-w-0 items-center gap-2.5 rounded-md px-2 text-left text-md transition-colors hover:bg-foreground/[0.05]",
        active && "bg-foreground/[0.08] font-medium hover:bg-foreground/[0.08]",
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} /> : lead}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {strong && count > 0 ? (
        <CountBadge count={count} />
      ) : (
        <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">{count}</span>
      )}
    </button>
  );
}

/** A section heading with a full-width line above it, separating it from the section before. */
function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="-mx-2 mt-3 flex h-9 items-center justify-between border-t pt-3 pr-3 pl-4">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      {action}
    </div>
  );
}

/** Add a tag from the sidebar: a name and a colour. */
function AddTag() {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<TagColor>("amber");
  const [pending, start] = useTransition();

  function submit() {
    if (!label.trim()) return;
    start(async () => {
      try {
        await createTag(label, color);
        toast.success(`Tag "${label.trim()}" added.`);
        setLabel("");
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not add the tag.");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Add tag">
              <Plus />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">Add tag</TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="start" className="w-60 p-3">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Tag name, e.g. AI Summit"
            aria-label="Tag name"
            className="h-8 text-md"
          />
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Tag colour">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => setColor(c)}
                className={cn(
                  "size-5 rounded-full ring-offset-2 ring-offset-popover",
                  SWATCH[c],
                  color === c && "ring-2 ring-foreground",
                )}
              />
            ))}
          </div>
          <Button type="submit" size="sm" disabled={!label.trim() || pending}>
            Add tag
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Add a stage: a text field that appears under the Stages heading. */
function AddStageField({ onClose }: { onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="px-1 py-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return;
        start(async () => {
          try {
            await createStage(label);
            toast.success(`Stage "${label.trim()}" added.`);
            onClose();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not add the stage.");
          }
        });
      }}
    >
      <Input
        autoFocus
        value={label}
        disabled={pending}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        onBlur={() => {
          if (!label.trim()) onClose();
        }}
        placeholder="New stage, then Enter"
        aria-label="New stage name"
        className="h-8 bg-background text-md"
      />
    </form>
  );
}

/** The stage list. Drag a stage by its handle to reorder; the order is saved for everywhere. */
function StageList({
  stages,
  counts,
  view,
  onView,
}: {
  stages: StageDef[];
  counts: Record<string, number>;
  view: View;
  onView: (v: View) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [, start] = useTransition();
  const byKey = new Map(stages.map((s) => [s.key, s]));
  const order = (preview ?? stages.map((s) => s.key)).filter((k) => byKey.has(k));

  function moveOver(target: string) {
    if (!dragging || dragging === target) return;
    const next = order.filter((k) => k !== dragging);
    next.splice(next.indexOf(target) + (order.indexOf(dragging) < order.indexOf(target) ? 1 : 0), 0, dragging);
    setPreview(next);
  }

  function finish() {
    const next = preview;
    setDragging(null);
    if (!next || next.join() === stages.map((s) => s.key).join()) {
      setPreview(null);
      return;
    }
    start(async () => {
      try {
        await reorderStages(next);
      } catch {
        toast.error("The new order did not save.");
      } finally {
        setPreview(null);
      }
    });
  }

  return (
    <div role="list" aria-label="Stages">
      {order.map((key) => {
        const s = byKey.get(key)!;
        return (
          <div
            key={key}
            role="listitem"
            draggable
            onDragStart={(e) => {
              setDragging(key);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", key);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              moveOver(key);
            }}
            onDrop={(e) => {
              e.preventDefault();
              finish();
            }}
            onDragEnd={finish}
            className={cn("group/stage relative cursor-grab rounded-md", dragging === key && "opacity-50")}
          >
            <Item
              label={s.label}
              count={counts[key] ?? 0}
              active={sameView(view, { kind: "stage", key })}
              onClick={() => onView({ kind: "stage", key })}
            />
            <GripVertical
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 -left-2 size-3.5 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover/stage:opacity-100"
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * The inbox sidebar: which people the list shows. Status views on top, then
 * tags and stages, each with a count. Sits between the icon rail and the list.
 */
/**
 * How today is going: messages sent against the daily cap, and how fast you
 * answer on average over the last 30 days.
 */
function YourDay({ account, people }: { account: Account; people: Person[] }) {
  const sent = Math.min(account.sentToday, account.dailyCap);
  const pct = account.dailyCap ? Math.round((sent / account.dailyCap) * 100) : 0;
  const avg = averageReplyMs(people);
  return (
    <div className="shrink-0 border-t px-4 pt-3 pb-4">
      <div className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Your day</div>
      <Progress value={pct} aria-label="Messages sent today" className="mt-2 h-1.5 bg-foreground/10" />
      <div className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground" suppressHydrationWarning>
        <span>
          <span className="font-medium text-foreground">{account.sentToday}</span> of {account.dailyCap} messages sent
        </span>
        <span>{avg === null ? "No replies to time yet" : `Avg reply time ${shortDuration(avg)}`}</span>
      </div>
    </div>
  );
}

export function InboxSidebar({
  view,
  onView,
  counts,
  tags,
  stages,
  account,
  people,
}: {
  view: View;
  onView: (v: View) => void;
  counts: SidebarCounts;
  tags: Tag[];
  stages: StageDef[];
  account: Account;
  people: Person[];
}) {
  const [addingStage, setAddingStage] = useState(false);

  return (
    <nav aria-label="Inbox views" className="flex w-[220px] shrink-0 flex-col border-r bg-sidebar/50">
      <div className="flex h-14 shrink-0 items-center border-b px-4 text-md font-semibold">Inbox</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-3 pb-3">
        <div className="flex h-6 items-center px-2 text-xs font-medium text-muted-foreground">Views</div>
        <Item
          icon={Inbox}
          label="Now"
          count={counts.now}
          strong
          active={sameView(view, { kind: "now" })}
          onClick={() => onView({ kind: "now" })}
        />
        <Item
          icon={Hourglass}
          label="Waiting"
          count={counts.waiting}
          active={sameView(view, { kind: "waiting" })}
          onClick={() => onView({ kind: "waiting" })}
        />
        <Item
          icon={List}
          label="All"
          count={counts.all}
          active={sameView(view, { kind: "all" })}
          onClick={() => onView({ kind: "all" })}
        />
        <Item
          icon={Star}
          label="Starred"
          count={counts.starred}
          active={sameView(view, { kind: "starred" })}
          onClick={() => onView({ kind: "starred" })}
        />

        <SectionHeader title="Tags" action={<AddTag />} />
        {tags.map((t) => (
          <Item
            key={t.id}
            label={t.label}
            count={counts.tags[t.id] ?? 0}
            active={sameView(view, { kind: "tag", id: t.id })}
            onClick={() => onView({ kind: "tag", id: t.id })}
            lead={<TagDot color={t.color} className="mx-1 size-2" />}
          />
        ))}
        {tags.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No tags yet.</p>}

        <SectionHeader
          title="Stages"
          action={
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="Add stage" onClick={() => setAddingStage(true)}>
                  <Plus />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Add stage</TooltipContent>
            </Tooltip>
          }
        />
        <StageList stages={stages} counts={counts.stages} view={view} onView={onView} />
        {addingStage && <AddStageField onClose={() => setAddingStage(false)} />}
      </div>
      <YourDay account={account} people={people} />
    </nav>
  );
}
