"use client";

import { useState, useTransition } from "react";
import { Check, CheckCheck, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { markDone } from "@/lib/actions";
import { dueLabel, relativeTime } from "@/lib/next-step";
import type { Condition, Group, Row, Tab } from "@/lib/rows";
import { TABS } from "@/lib/rows";
import type { HelperStatus, Person, Tag } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PersonDialog } from "@/components/people/person-dialog";
import { CountBadge } from "@/components/count-badge";
import { HeaderAction, HeaderSearch, PageHeader, useHeaderSearch } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { FilterPopover } from "./filter-popover";
import { SnoozeMenu } from "./snooze-menu";

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function PersonAvatar({ person, className }: { person: Person; className?: string }) {
  return (
    <Avatar className={className}>
      {person.pictureUrl && <AvatarImage src={person.pictureUrl} alt="" />}
      <AvatarFallback className="text-xs font-semibold">{initials(person.name)}</AvatarFallback>
    </Avatar>
  );
}

function lastLine(row: Row): string {
  const pending = row.person.pending[row.person.pending.length - 1];
  if (pending) return `You: ${pending.body}`;
  const msgs = row.person.messages;
  const last = msgs[msgs.length - 1];
  if (!last) return "No messages yet";
  return last.direction === "out" ? `You: ${last.body}` : last.body;
}

function lastTime(row: Row): string {
  const pending = row.person.pending[row.person.pending.length - 1];
  if (pending) return relativeTime(pending.createdAt);
  const msgs = row.person.messages;
  const last = msgs[msgs.length - 1];
  return last ? relativeTime(last.sentAt) : "";
}

/**
 * The one chip a row may carry. Reply rows get a blue dot instead.
 * Amber means due now, grey means later and names the day. The time on the
 * right is the last message, so the chip never repeats a day count.
 */
function Chip({ row, grouped }: { row: Row; grouped: boolean }) {
  const { step } = row;
  if (step.kind === "chase") {
    return (
      <Badge variant="secondary" className="bg-amber-50 text-amber-700">
        {step.step}
      </Badge>
    );
  }
  if (step.kind === "quiet" && !grouped) {
    return (
      <Badge variant="secondary" className="bg-violet-50 text-violet-700">
        Decide
      </Badge>
    );
  }
  if (step.kind === "waiting") {
    const day = dueLabel(step.dueAt);
    const followUp = step.detail.match(/^follow-up (\d)/)?.[1];
    const text =
      step.step === "Done"
        ? "Done"
        : step.detail === "snoozed"
          ? `Snoozed to ${day}`
          : followUp
            ? `Follow-up ${followUp} ${day}`
            : `Decide ${day}`;
    return (
      <Badge variant="secondary" className="text-muted-foreground" suppressHydrationWarning>
        {text}
      </Badge>
    );
  }
  return null;
}

function EmptyState({ tab, narrowed, total }: { tab: Tab; narrowed: boolean; total: number }) {
  if (total === 0) {
    return <p className="p-8 text-center text-xs text-muted-foreground">No one yet. Add a person, or connect the helper.</p>;
  }
  if (narrowed) return <p className="p-8 text-center text-xs text-muted-foreground">No one matches.</p>;
  if (tab === "needs") {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center">
        <span className="flex size-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCheck className="size-4" />
        </span>
        <p className="text-md font-medium">You are all caught up</p>
        <p className="text-xs text-muted-foreground">New replies and due follow-ups show up here.</p>
      </div>
    );
  }
  return <p className="p-8 text-center text-xs text-muted-foreground">Nothing waiting.</p>;
}

export function PeopleList({
  groups,
  tab,
  onTab,
  tabCounts,
  total,
  selectedId,
  onSelect,
  query,
  onQuery,
  conditions,
  onConditions,
  statusCounts,
  tags,
  onCreated,
  helper,
}: {
  groups: Group[];
  tab: Tab;
  onTab: (t: Tab) => void;
  tabCounts: Record<Tab, number>;
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
  conditions: Condition[];
  onConditions: (c: Condition[]) => void;
  statusCounts: Parameters<typeof FilterPopover>[0]["counts"];
  tags: Tag[];
  onCreated: (id: string) => void;
  helper: HelperStatus;
}) {
  const [adding, setAdding] = useState(false);
  const [, start] = useTransition();
  const search = useHeaderSearch(query);
  const narrowed = query.trim().length > 0 || conditions.some((c) => c.value);
  const visible = groups.reduce((n, g) => n + g.rows.length, 0);

  function done(row: Row) {
    start(async () => {
      try {
        await markDone(row.person.id);
        toast.success(`${row.person.name.split(" ")[0]} marked done.`);
      } catch {
        toast.error("That did not save.");
      }
    });
  }

  return (
    <section aria-label="Conversations" className="flex w-[360px] shrink-0 flex-col border-r bg-background">
      <PageHeader
        title="Inbox"
        search={
          search.open ? (
            <HeaderSearch value={query} onChange={onQuery} placeholder="Search people" open onOpenChange={search.setOpen} />
          ) : undefined
        }
        actions={
          <>
            <HeaderSearch value={query} onChange={onQuery} open={false} onOpenChange={search.setOpen} />
            <FilterPopover conditions={conditions} onChange={onConditions} tags={tags} counts={statusCounts} />
            <HeaderAction icon={Plus} label="Add person" onClick={() => setAdding(true)} />
          </>
        }
      >
        <Tabs value={tab} onValueChange={(v) => onTab(v as Tab)}>
          <TabsList className="w-full">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
                <CountBadge
                  count={tabCounts[t.id]}
                  variant={tab === t.id && t.id === "needs" && tabCounts[t.id] > 0 ? "default" : "outline"}
                  className={tab === t.id && t.id === "needs" && tabCounts[t.id] > 0 ? undefined : "bg-background text-muted-foreground"}
                />
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHeader>
      <PersonDialog open={adding} onOpenChange={setAdding} tags={tags} onSaved={onCreated} />

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-2">
        {groups.map((g) => (
          <div key={g.kind} role="group" aria-label={g.title}>
            {(tab !== "all" || g.kind === "stale") && (
              <div className="flex items-center gap-2 border-b bg-muted px-4 py-2 text-2xs">
                <span className="font-semibold tracking-wider uppercase">{g.title}</span>
                <CountBadge count={g.rows.length} variant="outline" className="bg-background text-muted-foreground" />
              </div>
            )}
            <ul>
              {g.rows.map((row) => {
                const active = row.person.id === selectedId;
                const stale = row.step.kind === "stale";
                const canDone = row.step.kind !== "waiting" && !stale;
                return (
                  <li key={row.person.id} className="group relative border-b">
                    <button
                      type="button"
                      onClick={() => onSelect(row.person.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full min-w-0 items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40",
                        active && "bg-muted/60 shadow-[inset_3px_0_0_0_var(--color-foreground)] hover:bg-muted/60",
                        stale && !active && "opacity-60",
                      )}
                    >
                      <PersonAvatar person={row.person} className="size-10" />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          {row.step.kind === "reply" && (
                            <span aria-label="Needs a reply" className="-mr-0.5 size-1.5 shrink-0 rounded-full bg-foreground" />
                          )}
                          <span className="truncate text-sm font-semibold">{row.person.name}</span>
                          <Chip row={row} grouped={tab !== "all"} />
                        </div>
                        <div className="truncate text-md text-foreground/70">{lastLine(row)}</div>
                      </div>
                      <span className="w-9 shrink-0 pt-0.5 text-right text-xs text-muted-foreground" suppressHydrationWarning>
                        {lastTime(row)}
                      </span>
                    </button>
                    <div
                      className={cn(
                        "absolute top-2.5 right-3 flex gap-0.5 rounded-md border bg-background p-0.5 shadow-sm",
                        "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
                      )}
                    >
                      {canDone && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-xs" aria-label="Mark done" onClick={() => done(row)}>
                              <Check />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">Done (E)</TooltipContent>
                        </Tooltip>
                      )}
                      <SnoozeMenu personId={row.person.id} snoozed={Boolean(row.person.snoozedUntil)} size="icon-xs" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {visible === 0 && <EmptyState tab={tab} narrowed={narrowed} total={total} />}
      </div>

      <div className="flex items-center justify-center gap-1.5 border-t py-2.5 text-xs text-muted-foreground">
        <span
          className={cn(
            "inline-block size-1.5 rounded-full",
            helper.connected ? "bg-emerald-500" : helper.state === "never" ? "bg-stone-300" : "bg-amber-500",
          )}
        />
        <span suppressHydrationWarning>
          {helper.connected
            ? `Synced ${relativeTime(helper.lastSeenAt!)}`
            : helper.state === "never"
              ? "Helper not connected"
              : "Helper needs attention"}
        </span>
      </div>
    </section>
  );
}
