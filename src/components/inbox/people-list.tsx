"use client";

import { useState, useTransition } from "react";
import { Check, CheckCheck, ChevronDown, ChevronRight, PanelLeft, Plus, Send, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { markDone } from "@/lib/client-actions";
import { relativeTime } from "@/lib/next-step";
import { bucketOf, type Condition, type Group, type Row, type View } from "@/lib/rows";
import type { HelperStatus, StageDef, Tag } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PersonDialog } from "@/components/people/person-dialog";
import { CountBadge } from "@/components/count-badge";
import { HeaderAction, HeaderSearch, PageHeader, useHeaderSearch } from "@/components/page-header";
import { FilterPopover } from "./filter-popover";
import { SnoozeMenu } from "./snooze-menu";
import { needsConnect } from "@/lib/invites";
import { PersonAvatar } from "@/components/person-avatar";
import { SyncLineBar } from "./sync-line";

function lastLine(row: Row): string {
  const pending = row.person.pending[row.person.pending.length - 1];
  if (pending) return `You: ${pending.body}`;
  const msgs = row.person.messages;
  const last = msgs[msgs.length - 1];
  if (!last) {
    // No messages yet: say where the connection request is, if there is one.
    switch (row.person.invite?.status) {
      case "queued":
      case "sending":
        return "Sending your connection request…";
      case "sent":
        return "Waiting for them to accept";
      case "withdrawing":
        return "Withdrawing the request";
      case "failed":
        return "Request didn't go through";
      case "accepted":
        return "Accepted your request · say hello";
    }
    return needsConnect(row.person) ? "Next: send a connection request" : "Next: say hello";
  }
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
 * A chip only when something asks for you: a draft to check, or "Lead?" in
 * Other. Where a person stands is the status pill; what to do is the Next box.
 */
function Chip({ row }: { row: Row }) {
  // A reply from Claude or ChatGPT waiting to be checked and sent comes first.
  if (row.person.draft) {
    return (
      <Badge variant="secondary" className="bg-sky-50 text-sky-700">
        Draft
      </Badge>
    );
  }
  // In Other, a conversation you started: AILI is asking whether they are a lead.
  if (row.person.askLead && row.person.lead === false) {
    return (
      <Badge variant="secondary" className="bg-blue-50 text-blue-700">
        Lead?
      </Badge>
    );
  }
  return null;
}

function EmptyState({ view, narrowed, total }: { view: View; narrowed: boolean; total: number }) {
  const note = (text: string) => <p className="p-8 text-center text-xs text-muted-foreground">{text}</p>;
  if (total === 0) return note("Your LinkedIn conversations will appear here.");
  if (narrowed) return note("No one matches.");
  switch (view.kind) {
    case "now":
      return (
        <div className="flex flex-col items-center gap-2 p-10 text-center">
          <span className="flex size-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCheck className="size-4" />
          </span>
          <p className="text-md font-medium">You are all caught up</p>
          <p className="text-xs text-muted-foreground">New replies and due follow-ups show up here.</p>
        </div>
      );
    case "starred":
      return note("No one starred yet. Open a conversation and press the star.");
    case "tag":
      return note("No one has this tag yet. Add it from a person's details.");
    case "stage":
      return note("No one is in this stage yet.");
    case "waiting":
      return note("Nothing waiting.");
    default:
      return note("No conversations.");
  }
}

export function PeopleList({
  view,
  groups,
  collapsed,
  onToggleGroup,
  total,
  selectedId,
  onSelect,
  query,
  conditions,
  helper,
  onMessageAll,
}: {
  view: View;
  groups: Group[];
  collapsed: Set<string>;
  onToggleGroup: (kind: string) => void;
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  conditions: Condition[];
  helper: HelperStatus;
  /** Tag and stage views: write one message for everyone shown. */
  onMessageAll?: () => void;
}) {
  const [, start] = useTransition();
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
    <section aria-label="Conversations" className="flex w-[360px] shrink-0 flex-col bg-background">
      <SyncLineBar helper={helper} />
      {view.kind === "other" && (
        <p className="border-b bg-muted/40 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">
            {total === 1 ? "1 conversation" : `${total} conversations`} that are not leads.
          </span>{" "}
          Read and reply here as normal. They stay out of Leads, your funnel and the Inbox count. Add anyone who
          becomes a lead to Leads.
        </p>
      )}
      {onMessageAll && visible > 0 && (
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-xs text-muted-foreground">{visible === 1 ? "1 person" : `${visible} people`}</span>
          <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={onMessageAll}>
            <Send />
            Message all
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-2">
        {groups.map((g) => {
          const isCollapsed = g.band && collapsed.has(g.kind);
          return (
            <div key={g.kind} role="group" aria-label={g.title}>
              {g.band && (
                <button
                  type="button"
                  onClick={() => onToggleGroup(g.kind)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center gap-2 border-b bg-muted px-4 py-2 pl-2.5 text-left text-2xs transition-colors hover:bg-foreground/[0.06]"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  )}
                  <span className="font-semibold tracking-wider uppercase">{g.title}</span>
                  <CountBadge count={g.rows.length} variant="outline" className="bg-background text-muted-foreground" />
                </button>
              )}
              {!isCollapsed && (
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
                          {/* Room for the photo, which is its own link on top (a link cannot sit in a button). */}
                          <span aria-hidden="true" className="size-10 shrink-0" />
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              {bucketOf(row) === "replied" && (
                                <span aria-label="Replied" className="-mr-0.5 size-2 shrink-0 rounded-full bg-blue-500" />
                              )}
                              <span className="truncate text-sm font-semibold">{row.person.name}</span>
                              {row.person.starred && (
                                <Star aria-label="Starred" className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                              )}
                              <Chip row={row} />
                            </div>
                            <div className="truncate text-md text-foreground/70">{lastLine(row)}</div>
                          </div>
                          <span className="shrink-0 self-start pt-0.5 text-xs text-muted-foreground" suppressHydrationWarning>
                            {lastTime(row)}
                          </span>
                        </button>
                        <span className={cn("absolute top-3.5 left-4", stale && !active && "opacity-60")}>
                          <PersonAvatar person={row.person} className="size-10" />
                        </span>
                        {/* Done and snooze are for leads, as Other has no next step. The photo opens LinkedIn. */}
                        {row.person.lead !== false && (
                          <div
                            className={cn(
                              "absolute top-1/2 right-3 flex -translate-y-1/2 gap-0.5 rounded-full border bg-background p-0.5 shadow-sm [&_button]:rounded-full",
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
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
        {visible === 0 && <EmptyState view={view} narrowed={narrowed} total={total} />}
      </div>

    </section>
  );
}

/**
 * The header over the sidebar and the list together: the sidebar toggle,
 * "Inbox", a small breadcrumb naming the view (Inbox › Waiting), then search,
 * filter and add.
 */
export function InboxHeader({
  viewName,
  sidebarOpen,
  onToggleSidebar,
  query,
  onQuery,
  conditions,
  onConditions,
  statusCounts,
  tags,
  stages,
  onCreated,
}: {
  viewName: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  query: string;
  onQuery: (q: string) => void;
  conditions: Condition[];
  onConditions: (c: Condition[]) => void;
  statusCounts: Parameters<typeof FilterPopover>[0]["counts"];
  tags: Tag[];
  stages: StageDef[];
  onCreated: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const search = useHeaderSearch(query);
  return (
    <>
      <PageHeader
        title="Inbox"
        after={
          <span className="flex min-w-0 items-center gap-1 pt-1 text-sm text-muted-foreground">
            <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate font-medium">{viewName}</span>
          </span>
        }
        leading={
          <HeaderAction
            icon={PanelLeft}
            label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            onClick={onToggleSidebar}
          />
        }
        search={
          search.open ? (
            <HeaderSearch value={query} onChange={onQuery} placeholder="Search people" open onOpenChange={search.setOpen} />
          ) : undefined
        }
        actions={
          <>
            <HeaderSearch value={query} onChange={onQuery} open={false} onOpenChange={search.setOpen} />
            <FilterPopover conditions={conditions} onChange={onConditions} tags={tags} stages={stages} counts={statusCounts} />
            <HeaderAction icon={Plus} label="Add person" onClick={() => setAdding(true)} />
          </>
        }
      />
      <PersonDialog open={adding} onOpenChange={setAdding} tags={tags} stages={stages} onSaved={onCreated} />
    </>
  );
}
