"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { STATUS, StatusDot } from "@/components/status-dot";
import { TagDot } from "@/components/tag-chip";
import { ACCOUNT } from "@/lib/mock/data";
import type { Filter } from "./inbox-view";

const LISTS: { id: Filter; label: string }[] = [
  { id: "all", label: "All people" },
  { id: "reply", label: STATUS.reply.label },
  { id: "chase", label: STATUS.chase.label },
  { id: "quiet", label: STATUS.quiet.label },
  { id: "waiting", label: STATUS.waiting.label },
];

export function InboxSidebar({
  filter,
  onFilter,
  counts,
  tags,
  tagFilter,
  onTagFilter,
}: {
  filter: Filter;
  onFilter: (f: Filter) => void;
  counts: Record<Filter, number>;
  tags: Tag[];
  tagFilter: string | null;
  onTagFilter: (id: string | null) => void;
}) {
  return (
    <aside className="flex w-[184px] shrink-0 flex-col gap-5 border-r bg-sidebar px-3 py-5">
      <div className="px-2">
        <div className="text-[15px] font-semibold leading-tight">Inbox</div>
        <div className="text-[11px] text-muted-foreground">{ACCOUNT.name}, LinkedIn</div>
      </div>

      <Button size="sm" className="w-full">
        <Plus />
        Add person
      </Button>

      <nav aria-label="Lists" className="flex flex-col gap-0.5">
        {LISTS.map((l) => {
          const active = filter === l.id;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => onFilter(l.id)}
              aria-pressed={active}
              className={cn(
                "flex h-8 items-center justify-between rounded-md px-2 text-[13px] transition-colors hover:bg-accent",
                active && "bg-accent font-semibold",
              )}
            >
              <span className="flex items-center gap-2.5">
                <StatusDot kind={l.id} />
                {l.label}
              </span>
              <span
                className={cn(
                  "min-w-[18px] rounded-full px-1.5 text-center text-[11px] tabular-nums",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {counts[l.id]}
              </span>
            </button>
          );
        })}
      </nav>

      <Separator />

      <div className="flex flex-col gap-1">
        <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tags
        </div>
        {tags.map((t) => {
          const active = tagFilter === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTagFilter(active ? null : t.id)}
              aria-pressed={active}
              className={cn(
                "flex h-7 items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition-colors hover:bg-accent",
                active && "bg-accent font-medium",
              )}
            >
              <TagDot color={t.color} className="size-2" />
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-1.5">
        <div className="text-xs font-semibold">Sent today</div>
        <Progress value={(ACCOUNT.sentToday / ACCOUNT.dailyCap) * 100} className="h-1" />
        <div className="text-[11px] text-muted-foreground">
          {ACCOUNT.sentToday} of {ACCOUNT.dailyCap} messages
        </div>
      </div>
    </aside>
  );
}
