"use client";

import { useState, useTransition } from "react";
import { ArrowUp, Check, ChevronDown, MoreHorizontal, RotateCcw, Sparkles, Star, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { archivePerson, cancelQueued, markDone, moveToOther, queueSend, reopen, toggleStar, updateStage } from "@/lib/actions";
import { stageLabel, type Account, type StageDef, type Tag } from "@/lib/types";
import type { Row } from "@/lib/rows";
import { shortDate, shortTime, type NextStep } from "@/lib/next-step";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NextStepHint } from "./next-step-hint";
import { HeaderAction } from "@/components/page-header";
import { TagChip } from "@/components/tag-chip";
import { TagPicker } from "@/components/people/tag-picker";
import { PersonAvatar } from "./people-list";
import { SnoozeMenu } from "./snooze-menu";
import { LogReplyDialog } from "./log-reply-dialog";
import { SendDialog } from "./send-dialog";
import { NotLeadBar } from "./track-as-lead";
import { TemplatePicker } from "@/components/templates/template-picker";
import type { Template } from "@/lib/templates";

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

/**
 * Room for an avatar beside a bubble: as tall as a one-line bubble (0.5rem
 * padding top and bottom plus a 1.375rem line), with the avatar in its middle.
 */
const AVATAR_SLOT = "flex h-[2.375rem] w-7 shrink-0 items-center";

/** Your avatar in the thread: your initials on black, matching your bubbles. */
function MyAvatar({ account }: { account: Account }) {
  return (
    <Avatar className="size-7" title={account.name}>
      {account.pictureUrl && <AvatarImage src={account.pictureUrl} alt="" />}
      <AvatarFallback className="bg-foreground text-2xs font-semibold text-background">{account.initials}</AvatarFallback>
    </Avatar>
  );
}

/** The person's stage as a clear control: "Stage  In conversation ▾". Picking one saves it. */
function StageMenu({
  stages,
  value,
  onChange,
}: {
  stages: StageDef[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Stage: ${stageLabel(stages, value)}. Change stage`}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs shadow-xs transition-colors hover:bg-muted"
        >
          <span className="text-muted-foreground">Stage</span>
          <span className="font-semibold text-foreground">{stageLabel(stages, value)}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Move to stage</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {stages.map((s) => (
            <DropdownMenuRadioItem key={s.key} value={s.key}>
              {s.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
  tags,
  stages,
  templates,
  snoozeOpen,
  onSnoozeOpenChange,
  detailsOpen,
  onToggleDetails,
}: {
  row: Row;
  account: Account;
  tags: Tag[];
  stages: StageDef[];
  templates: Template[];
  snoozeOpen: boolean;
  onSnoozeOpenChange: (open: boolean) => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  const { person, step } = row;
  // Someone in Other: readable and repliable, but not a lead, so no stage, tags or next step.
  const isLead = person.lead !== false;
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
  const subtitle = [person.jobTitle || person.headline, person.company].filter(Boolean).join(" · ");
  const personTags = tags.filter((t) => person.tagIds.includes(t.id));

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
      <header className="flex h-14 shrink-0 items-center gap-3 border-b pr-3 pl-5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleDetails}
              aria-expanded={detailsOpen}
              aria-label={detailsOpen ? `Hide details for ${person.name}` : `Show details for ${person.name}`}
              className="-ml-1.5 flex min-w-0 shrink items-center gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted"
            >
              <PersonAvatar person={person} className="size-8" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-tight">{person.name}</span>
                <span className="block max-w-md truncate text-xs text-muted-foreground" title={subtitle}>
                  {subtitle || "No headline yet"}
                </span>
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{detailsOpen ? "Hide details" : "Show details"}</TooltipContent>
        </Tooltip>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {isLead && (
            <>
            {isDone ? (
              <HeaderAction icon={RotateCcw} label="Reopen" onClick={() => run(() => reopen(person.id), "Reopened.")} />
            ) : (
              actionable && (
                <HeaderAction
                  icon={Check}
                  label="Mark done (E)"
                  onClick={() => run(() => markDone(person.id), `${first} marked done.`)}
                />
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
            </>
          )}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="More">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">More</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onToggleDetails}>{detailsOpen ? "Hide details" : "Show details"}</DropdownMenuItem>
              <DropdownMenuSeparator />
              {!viaHelper && (
                <>
                  <DropdownMenuItem onSelect={() => setLogging(true)}>Paste a reply from LinkedIn</DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {isLead && (
                <DropdownMenuItem onSelect={() => run(() => moveToOther([person.id]), `${first} moved to Other.`)}>
                  Not a lead, move to Other
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => run(() => archivePerson(person.id), `${person.name} archived.`)}
              >
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {isLead ? (
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b px-5 py-2">
          <StageMenu stages={stages} value={person.stage} onChange={(key) => run(() => updateStage(person.id, key), "")} />
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
          {personTags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
          <TagPicker personId={person.id} tags={tags} selected={person.tagIds} />
        </div>
      ) : (
        <NotLeadBar personId={person.id} firstName={first} currentStage={person.stage} stages={stages} tags={tags} />
      )}

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <ol className="flex flex-col px-8 py-6">
          {person.connectedAt && (
            <li className="mb-4 text-center text-2xs text-muted-foreground" suppressHydrationWarning>
              Connected {shortDate(new Date(person.connectedAt))}
            </li>
          )}
          {messages.map((m, i) => {
            const mine = m.direction === "out";
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const HOUR = 60 * 60 * 1000;
            const at = new Date(m.sentAt).getTime();
            const gap = !prev || at - new Date(prev.sentAt).getTime() > HOUR;
            // Messages from the same side within an hour sit as one run, like Messages.
            const joinsPrev = !gap && prev.direction === m.direction;
            const joinsNext = Boolean(next) && next.direction === m.direction && new Date(next.sentAt).getTime() - at <= HOUR;
            return (
              <li
                key={m.id}
                className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start", joinsPrev ? "mt-0.5" : "mt-5 first:mt-0")}
              >
                {gap && (
                  <div className="mb-2 w-full text-center text-2xs text-muted-foreground" suppressHydrationWarning>
                    {stamp(m.sentAt)}
                  </div>
                )}
                <div className={cn("flex w-full items-end gap-2", mine && "flex-row-reverse")}>
                  {/* The avatar sits beside the last message of a run; earlier ones keep its space.
                      The slot is one single-line bubble tall and pinned to the bottom, so the avatar is
                      centred on a one-line message and sits by the last line of a longer one. */}
                  <span className={AVATAR_SLOT}>
                    {!joinsNext &&
                      (mine ? <MyAvatar account={account} /> : <PersonAvatar person={person} className="size-7" />)}
                  </span>
                  <div
                    className={cn(
                      "max-w-[56%] rounded-2xl px-3.5 py-2 text-md leading-[1.375rem] break-words whitespace-pre-wrap",
                      mine ? "bg-foreground text-background" : "bg-muted",
                      mine && joinsPrev && "rounded-tr-md",
                      mine && joinsNext && "rounded-br-md",
                      !mine && joinsPrev && "rounded-tl-md",
                      !mine && joinsNext && "rounded-bl-md",
                    )}
                  >
                    {m.body}
                  </div>
                </div>
                {m.followUp ? <div className="px-10 text-2xs text-muted-foreground">Follow-up {m.followUp}</div> : null}
              </li>
            );
          })}
          {person.pending.map((p) => (
            <li key={p.id} className="mt-5 flex flex-col items-end gap-1">
              <div className="flex w-full flex-row-reverse items-end gap-2">
                <span className={AVATAR_SLOT}>
                  <MyAvatar account={account} />
                </span>
                <div className="max-w-[56%] rounded-2xl border border-dashed px-3.5 py-[calc(0.5rem-1px)] text-md leading-[1.375rem] break-words whitespace-pre-wrap text-muted-foreground">
                  {p.body}
                </div>
              </div>
              <div className="flex items-center gap-2 px-10 text-2xs text-muted-foreground">
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
        {isLead && step.kind !== "stale" && (
          <div className="flex items-center gap-3 rounded-xl bg-muted/70 px-3.5 py-2.5">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                step.kind === "reply" ? "bg-blue-500" : step.kind === "chase" ? "bg-amber-500" : step.kind === "quiet" ? "bg-violet-500" : "bg-stone-400",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="text-md font-semibold">{cardTitle(step, first)}</div>
              <div className="truncate text-xs text-muted-foreground">
                <NextStepHint row={row} />
              </div>
            </div>
            {actionable && (
              <>
                <SnoozeMenu personId={person.id} snoozed={Boolean(person.snoozedUntil)} label="Not now" />
                <Button
                  size="sm"
                  className="h-7 rounded-full px-3 text-xs"
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
          <TemplatePicker
            templates={templates}
            person={person}
            onPick={(text) => {
              setDraft(text);
              requestAnimationFrame(() => document.getElementById("reply")?.focus());
            }}
          />
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
              className="min-h-10 resize-none rounded-2xl px-4 py-2.5 pr-24 text-md"
            />
            <span className="pointer-events-none absolute right-3.5 bottom-2.5 hidden items-center gap-1 text-2xs text-muted-foreground sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
              send
            </span>
          </div>
          <Button
            size="icon"
            aria-label="Send"
            className="size-10 rounded-full"
            disabled={!draft.trim() || capReached || pending}
            onClick={send}
          >
            <ArrowUp />
          </Button>
        </div>
        <div className="flex justify-between text-2xs text-muted-foreground">
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
