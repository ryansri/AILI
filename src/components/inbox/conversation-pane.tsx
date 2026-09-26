"use client";

import { useState, useTransition } from "react";
import { ArrowUp, Check, MoreHorizontal, RotateCcw, Sparkles, Star, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { archivePerson, cancelQueued, markDone, queueSend, reopen, toggleStar, updateStage } from "@/lib/actions";
import type { Account } from "@/lib/types";
import type { Row } from "@/lib/rows";
import { shortDate, shortTime, type NextStep } from "@/lib/next-step";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NextStepHint } from "./next-step-hint";
import { PersonAvatar } from "./people-list";
import { SnoozeMenu } from "./snooze-menu";
import { LogReplyDialog } from "./log-reply-dialog";
import { SendDialog } from "./send-dialog";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Today 08:41", "Yesterday 17:02", "Wednesday 09:12", "2 Sep 09:12". */
function stamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  const when = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? WEEKDAYS[d.getDay()] : shortDate(d);
  return `${when} ${shortTime(d)}`;
}

/** What the card above the composer says. */
function cardTitle(step: NextStep, first: string): string {
  switch (step.kind) {
    case "reply":
      return step.step === "First message" ? `First message to ${first}` : `Reply to ${first}`;
    case "chase":
      return step.step === "Check back" ? `Check back with ${first}` : `${step.step} to ${first}`;
    case "quiet":
      return `Chase or drop ${first}`;
    case "waiting":
      return step.step === "Done" ? "Done" : step.detail === "snoozed" ? `Snoozed until ${shortDate(step.dueAt)}` : "Nothing to do yet";
    default:
      return "No next step";
  }
}

export function ConversationPane({
  row,
  account,
  snoozeOpen,
  onSnoozeOpenChange,
}: {
  row: Row;
  account: Account;
  snoozeOpen: boolean;
  onSnoozeOpenChange: (open: boolean) => void;
}) {
  const { person, step } = row;
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [logging, setLogging] = useState(false);
  const [pending, start] = useTransition();

  const messages = [...person.messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
  const capReached = account.sentToday >= account.dailyCap;
  const followUp: 1 | 2 | undefined =
    step.step === "Follow-up 1" ? 1 : step.step === "Follow-up 2" ? 2 : undefined;
  const first = person.name.split(" ")[0];
  /** The helper delivers when it is online and knows this person on LinkedIn. */
  const viaHelper = account.helper.connected && Boolean(person.linkedinUrn);
  const actionable = step.kind === "reply" || step.kind === "chase" || step.kind === "quiet";
  const isDone = step.kind === "waiting" && step.step === "Done";
  const subtitle = [person.headline, person.company].filter(Boolean).join(" · ");

  function run(fn: () => Promise<unknown>, done: string) {
    start(async () => {
      try {
        await fn();
        if (done) toast.success(done);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That did not save.");
      }
    });
  }

  function send() {
    if (!draft.trim() || capReached || pending) return;
    if (viaHelper) {
      const body = draft;
      run(async () => {
        await queueSend({ personId: person.id, body, followUp });
        setDraft("");
      }, "Handed to the helper. It sends within a minute.");
    } else {
      setSending(true);
    }
  }

  return (
    <section aria-label={`Conversation with ${person.name}`} className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-5">
        <PersonAvatar person={person} className="size-8" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[14px] font-semibold leading-tight">{person.name}</h1>
          <p className="truncate text-xs text-muted-foreground" title={subtitle}>
            {subtitle || "No headline yet"}
          </p>
        </div>
        {isDone ? (
          <Button variant="outline" size="sm" className="h-8" onClick={() => run(() => reopen(person.id), "Reopened.")}>
            <RotateCcw />
            Reopen
          </Button>
        ) : (
          actionable && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={pending}
                  onClick={() => run(() => markDone(person.id), `${first} marked done.`)}
                >
                  <Check />
                  Done
                  <Kbd>E</Kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Nothing more to do until they write back</TooltipContent>
            </Tooltip>
          )
        )}
        <SnoozeMenu
          personId={person.id}
          snoozed={Boolean(person.snoozedUntil)}
          open={snoozeOpen}
          onOpenChange={onSnoozeOpenChange}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={person.starred ? "Unstar" : "Star"}
              aria-pressed={person.starred}
              onClick={() => run(() => toggleStar(person.id), "")}
            >
              <Star className={cn(person.starred && "fill-amber-400 text-amber-400")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{person.starred ? "Unstar" : "Star"}</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!viaHelper && (
              <>
                <DropdownMenuItem onSelect={() => setLogging(true)}>Log their reply</DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={() => run(() => updateStage(person.id, "call"), "Marked as call earned.")}>
              Mark call earned
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => run(() => updateStage(person.id, "won"), "Marked as won.")}>
              Mark as won
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => run(() => updateStage(person.id, "lost"), "Marked as lost.")}>
              Mark as lost
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => run(() => archivePerson(person.id), `${person.name} archived.`)}
            >
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <ol className="flex flex-col gap-2 px-6 py-5">
          {person.connectedAt && (
            <li className="mb-2 text-center text-[11px] text-muted-foreground" suppressHydrationWarning>
              Connected {shortDate(new Date(person.connectedAt))}
            </li>
          )}
          {messages.map((m, i) => {
            const mine = m.direction === "out";
            const prev = messages[i - 1];
            const gap = !prev || new Date(m.sentAt).getTime() - new Date(prev.sentAt).getTime() > 60 * 60 * 1000;
            return (
              <li key={m.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
                {gap && (
                  <div className="mt-2 mb-1 w-full text-center text-[11px] text-muted-foreground" suppressHydrationWarning>
                    {stamp(m.sentAt)}
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[60%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap",
                    mine ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md bg-muted",
                  )}
                >
                  {m.body}
                </div>
                {m.followUp ? <div className="px-1 text-[11px] text-muted-foreground">Follow-up {m.followUp}</div> : null}
              </li>
            );
          })}
          {person.pending.map((p) => (
            <li key={p.id} className="flex flex-col items-end gap-1">
              <div className="max-w-[60%] rounded-2xl rounded-br-md border border-dashed px-3.5 py-2 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
                {p.body}
              </div>
              <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                {p.status === "sending" ? "Sending now" : "Waiting for the helper"}
                {p.status === "queued" && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 hover:text-foreground"
                    onClick={() => run(() => cancelQueued(p.id), "Removed from the queue.")}
                  >
                    <X className="size-3" />
                    cancel
                  </button>
                )}
              </div>
            </li>
          ))}
          {messages.length === 0 && person.pending.length === 0 && (
            <li className="text-center text-xs text-muted-foreground">No messages yet. Send the first one.</li>
          )}
        </ol>
      </div>

      <footer className="flex flex-col gap-3 px-6 pt-1 pb-4">
        {step.kind !== "stale" && (
          <div className="flex items-center gap-3 rounded-xl bg-muted/70 px-3.5 py-2.5">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                step.kind === "reply" ? "bg-blue-600" : step.kind === "chase" ? "bg-amber-500" : step.kind === "quiet" ? "bg-violet-500" : "bg-stone-400",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">{cardTitle(step, first)}</div>
              <div className="truncate text-xs text-muted-foreground">
                <NextStepHint row={row} />
              </div>
            </div>
            {actionable && (
              <>
                <SnoozeMenu personId={person.id} snoozed={Boolean(person.snoozedUntil)} label="Not now" />
                <Button
                  size="sm"
                  className="h-7 rounded-full bg-blue-600 px-3 text-xs hover:bg-blue-700"
                  onClick={() => toast("AI drafting arrives in step 4.")}
                >
                  <Sparkles />
                  Draft with AI
                </Button>
              </>
            )}
          </div>
        )}

        <div className="flex items-end gap-2.5">
          <div className="relative flex-1">
            <label htmlFor="reply" className="sr-only">
              Your message
            </label>
            <Textarea
              id="reply"
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={followUp ? `Follow-up ${followUp} to ${first}` : `Write to ${first}`}
              className="min-h-10 resize-none rounded-2xl px-4 py-2.5 pr-24 text-[13.5px]"
            />
            <span className="pointer-events-none absolute right-3.5 bottom-2.5 hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
              send
            </span>
          </div>
          <Button
            size="icon"
            aria-label="Send"
            className="size-10 rounded-full bg-blue-600 hover:bg-blue-700"
            disabled={!draft.trim() || capReached || pending}
            onClick={send}
          >
            <ArrowUp />
          </Button>
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>
            {capReached
              ? `Daily cap of ${account.dailyCap} reached. Sending opens again tomorrow.`
              : viaHelper
                ? "Delivered on LinkedIn by the Chrome helper, from your account."
                : account.helper.connected
                  ? "AILI has not matched this person on LinkedIn yet, so this one is copy and paste."
                  : "Copies the message and logs it once you confirm you sent it on LinkedIn."}
          </span>
          <span>{draft.trim() ? `${draft.trim().split(/\s+/).length} words` : ""}</span>
        </div>
      </footer>

      <SendDialog
        open={sending}
        onOpenChange={setSending}
        personId={person.id}
        personName={person.name}
        linkedinUrl={person.linkedinUrl}
        body={draft}
        followUp={followUp}
        onSent={() => setDraft("")}
      />
      <LogReplyDialog open={logging} onOpenChange={setLogging} personId={person.id} personName={person.name} />
    </section>
  );
}
