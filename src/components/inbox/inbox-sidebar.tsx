"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Account, Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { STATUS, StatusDot } from "@/components/status-dot";
import { TagDot } from "@/components/tag-chip";
import { relativeTime } from "@/lib/next-step";
import { PersonDialog } from "@/components/people/person-dialog";
import type { Filter } from "@/lib/rows";

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
  account,
  onCreated,
}: {
  filter: Filter;
  onFilter: (f: Filter) => void;
  counts: Record<Filter, number>;
  tags: Tag[];
  tagFilter: string | null;
  onTagFilter: (id: string | null) => void;
  account: Account;
  onCreated: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const pct = account.dailyCap > 0 ? (account.sentToday / account.dailyCap) * 100 : 0;

  return (
    <aside className="flex w-[184px] shrink-0 flex-col gap-5 border-r bg-sidebar px-3 py-5">
      <div className="px-2">
        <div className="text-[15px] font-semibold leading-tight">Inbox</div>
        <div className="text-[11px] text-muted-foreground">{account.name}, LinkedIn</div>
      </div>

      <Button size="sm" className="w-full" onClick={() => setAdding(true)}>
        <Plus />
        Add person
      </Button>
      <PersonDialog open={adding} onOpenChange={setAdding} tags={tags} onSaved={onCreated} />

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
        {tags.length === 0 && (
          <div className="px-2 text-xs text-muted-foreground">No tags yet.</div>
        )}
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

      <div className="mt-auto flex flex-col gap-3">
        <Link href="/settings" className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground" suppressHydrationWarning>
          <span
            className={cn(
              "inline-block size-2 rounded-full",
              account.helper.connected ? "bg-emerald-500" : account.helper.state === "never" ? "bg-stone-300" : "bg-amber-500",
            )}
          />
          {account.helper.connected
            ? `Helper synced ${relativeTime(account.helper.lastSeenAt!)}`
            : account.helper.state === "logged_out"
              ? "Helper: LinkedIn logged out"
              : "Helper not connected"}
        </Link>
        <div className="flex flex-col gap-1.5">
        <div className="text-xs font-semibold">Sent today</div>
        <Progress value={Math.min(100, pct)} className="h-1" />
        <div className="text-[11px] text-muted-foreground">
          {account.sentToday} of {account.dailyCap} messages
        </div>
        </div>
      </div>
    </aside>
  );
}
