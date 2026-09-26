"use client";

import { Fragment, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueLabel, relativeTime } from "@/lib/next-step";
import type { Row } from "@/lib/rows";
import { STATUS, StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PersonDialog } from "@/components/people/person-dialog";
import type { Tag } from "@/lib/types";

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

export function PeopleList({
  rows,
  total,
  replyCount,
  selectedId,
  onSelect,
  tags,
  onCreated,
}: {
  rows: Row[];
  total: number;
  replyCount: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  tags: Tag[];
  onCreated: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const firstStale = rows.findIndex((r) => r.step.kind === "stale");
  const staleCount = rows.filter((r) => r.step.kind === "stale").length;

  return (
    <section aria-label="Conversations" className="flex w-[340px] shrink-0 flex-col border-r">
      <div className="flex items-center gap-3 border-b px-4 py-2 text-xs text-muted-foreground">
        <span>
          {rows.length === total ? `${total} conversations` : `${rows.length} of ${total} conversations`}
        </span>
        {replyCount > 0 && <span className={STATUS.reply.text}>{replyCount} need a reply</span>}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="Add person"
              className="ml-auto rounded-full"
              onClick={() => setAdding(true)}
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Add person</TooltipContent>
        </Tooltip>
        <PersonDialog open={adding} onOpenChange={setAdding} tags={tags} onSaved={onCreated} />
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <ul>
          {rows.map((row, i) => {
            const active = row.person.id === selectedId;
            const stale = row.step.kind === "stale";
            const s = STATUS[row.step.kind];
            return (
              <Fragment key={row.person.id}>
                {stale && i === firstStale && (
                  <li className="border-b bg-sidebar px-4 pt-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Older than 30 days, {staleCount}
                  </li>
                )}
                <li>
                  <button
                    type="button"
                    onClick={() => onSelect(row.person.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full min-w-0 flex-col gap-0.5 border-b px-4 py-3 text-left transition-colors hover:bg-accent/60",
                      active && "bg-accent",
                      stale && !active && "opacity-60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold">{row.person.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground" suppressHydrationWarning>
                        {lastTime(row)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <StatusDot kind={row.step.kind} />
                      <span className={s.text}>{row.step.step}</span>
                      <span className="font-normal text-muted-foreground" suppressHydrationWarning>
                        {stale ? row.step.detail : row.step.dueNow ? "today" : dueLabel(row.step.dueAt)}
                      </span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{lastLine(row)}</div>
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ul>
        {rows.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {total === 0 ? "No one yet. Add a person, or connect the helper." : "No one matches this filter."}
          </div>
        )}
      </div>
    </section>
  );
}
