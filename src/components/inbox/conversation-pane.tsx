"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Archive,
  ArrowUp,
  Check,
  CheckCheck,
  CircleHelp,
  ClipboardPaste,
  Clock3,
  ExternalLink,
  FolderInput,
  Info,
  Mic,
  MoreHorizontal,
  Newspaper,
  RotateCcw,
  Sparkles,
  Star,
  StarOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { archivePerson, cancelQueued, discardDraft, retryQueued, markDone, moveToOther, queueSend, reopen, toggleStar } from "@/lib/client-actions";
import { type Account, type StageDef, type Tag } from "@/lib/types";
import type { Row } from "@/lib/rows";
import { followUpNote, relativeTime, shortDate, shortTime } from "@/lib/next-step";
import { chatUrl, postsUrl } from "@/lib/profile-url";
import { isVoiceNote } from "@/lib/voice-note";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { HeaderAction } from "@/components/page-header";
import { PersonAvatar } from "@/components/person-avatar";
import { SnoozeMenu } from "./snooze-menu";
import { LogReplyDialog } from "./log-reply-dialog";
import { SendDialog } from "./send-dialog";
import { NotLeadBar } from "./track-as-lead";
import { AcceptedLine, ConnectDialog, ConnectPanel, connectStateOf } from "./connect";
import { useHydrated } from "@/hooks/use-hydrated";
import { TemplatePicker } from "@/components/templates/template-picker";
import type { Template } from "@/lib/templates";

/** "3:42 pm" today, "Mon 3:42 pm" this week, else "28 Sep". */
function seenLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
  if (d.toDateString() === now.toDateString()) return time;
  if (now.getTime() - d.getTime() < 6 * 86400_000) return `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

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

/** Under the last message, while they haven't answered: when to follow up. */
function FollowUpLine({ row }: { row: Row }) {
  const note = followUpNote(row.step);
  if (!note) return null;
  return (
    <li className={cn("mt-4 text-center text-2xs", note.due ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
      {note.long}
    </li>
  );
}

/**
 * How to get an AI draft: ask Claude or ChatGPT, connected to AILI, and the
 * draft lands in the message box. Before any is connected, how to connect.
 */
function AiTip({ apps, first }: { apps: string[]; first: string }) {
  const names = apps.filter((a) => a === "Claude" || a === "ChatGPT");
  return (
    // Lined up with the words in the message box: past the templates button (40px + 10px gap) and the box's padding.
    <div className="flex items-center gap-1.5 pl-[66px] text-2xs text-muted-foreground">
      <CircleHelp className="size-3 shrink-0" />
      {names.length > 0 ? (
        <span className="min-w-0 truncate">
          Want help writing? Ask {names.join(" or ")}: &ldquo;Draft a reply to {first} in AILI.&rdquo; It appears here.
        </span>
      ) : (
        <span className="min-w-0 truncate">
          Want help writing? Connect Claude or ChatGPT, then ask it to draft a reply. It appears here.{" "}
          <Link href="/settings/connections" className="font-medium text-foreground underline underline-offset-2">
            Connect
          </Link>
        </span>
      )}
    </div>
  );
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
  onSent,
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
  /** After a message is sent or queued: the inbox keeps this chat open and in place. */
  onSent?: () => void;
}) {
  const { person, step } = row;
  // Message times are the viewer's local time, so they are printed in the browser only.
  const hydrated = useHydrated();
  // Someone in Other: readable and repliable, but not a lead, so no stage, tags or next step.
  const isLead = person.lead !== false;
  const [draft, setDraft] = useState(person.draft?.text ?? "");
  // A draft from Claude or ChatGPT that arrives while this conversation is open
  // fills the box, unless the user is already typing something else.
  const [draftAt, setDraftAt] = useState(person.draft?.at);
  if (person.draft && person.draft.at !== draftAt) {
    setDraftAt(person.draft.at);
    if (!draft.trim()) setDraft(person.draft.text);
  }
  const aiDraft = person.draft && draftAt === person.draft.at ? person.draft : undefined;
  const posts = postsUrl(person.linkedinUrl);
  // The template the message started from, for its reply rate. Cleared with the box.
  const [templateId, setTemplateId] = useState<string>();
  const [sending, setSending] = useState(false);
  const [logging, setLogging] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  // A message or a connection request on its way.
  const waiting = person.pending.length + (["queued", "sending", "withdrawing"].includes(person.invite?.status ?? "") ? 1 : 0);
  const connect = connectStateOf(person);
  const [writeAnyway, setWriteAnyway] = useState(false);
  /** The Connect dialog, with the note to start from; null when closed. */
  const [connecting, setConnecting] = useState<{ note: string; replaces?: string } | null>(null);
  const showConnect = connect !== null && !(connect === "connect" && writeAnyway);

  // While a message is on its way, look again every few seconds so its tick
  // shows as soon as LinkedIn has it (for two minutes at most).
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > 2 * 60_000) window.clearInterval(timer);
      else router.refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [waiting, router]);

  const messages = [...person.messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
  // Open on the newest message, like any chat, and follow new ones as they arrive.
  const scroller = useRef<HTMLDivElement>(null);
  const shown = messages.length + person.pending.length;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [person.id, shown, hydrated]);

  const capReached = account.sentToday >= account.dailyCap;
  const followUp: 1 | 2 | undefined =
    step.step === "Follow-up 1" ? 1 : step.step === "Follow-up 2" ? 2 : undefined;
  const first = person.name.split(" ")[0];
  /** The helper delivers when it is online and knows this person on LinkedIn. */
  // Once the extension has ever connected, sends go through it, from any browser:
  // while Chrome is closed they wait in the queue.
  const viaHelper = Boolean(account.helper.lastSeenAt) && Boolean(person.linkedinUrn);
  const actionable = step.kind === "reply" || step.kind === "chase" || step.kind === "quiet";
  const isDone = step.kind === "waiting" && step.step === "Done";
  const subtitle = [person.jobTitle || person.headline, person.company].filter(Boolean).join(" · ");

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
        await queueSend({ personId: person.id, body, followUp, templateId });
        setDraft("");
        setTemplateId(undefined);
        onSent?.();
        // Wake the Chrome helper so it sends now, not at its next minute.
        window.postMessage({ source: "aili-page", type: "sync-now" }, window.location.origin);
      }, "");
    } else {
      setSending(true);
    }
  }

  return (
    <section aria-label={`Conversation with ${person.name}`} className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b pr-3 pl-5">
        {/* The photo opens their LinkedIn profile; the name opens the details. */}
        <span className="ml-0.5 shrink-0">
          <PersonAvatar person={person} className="size-8" />
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleDetails}
              aria-expanded={detailsOpen}
              aria-label={detailsOpen ? `Hide details for ${person.name}` : `Show details for ${person.name}`}
              className="flex min-w-0 shrink items-center gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted"
            >
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
          {/* Their posts on LinkedIn, the best thing to write about. It only opens LinkedIn; AILI reads nothing. */}
          {posts && (
            <Button variant="secondary" size="sm" asChild className="mr-1.5 h-8 rounded-full px-3 text-xs">
              <a href={posts} target="_blank" rel="noreferrer" title="Opens their posts on LinkedIn">
                <Newspaper />
                Recent posts
              </a>
            </Button>
          )}
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
              <DropdownMenuItem onSelect={onToggleDetails}>
                <Info />
                {detailsOpen ? "Hide info" : "View info"}
              </DropdownMenuItem>
              {isLead && (
                <DropdownMenuItem onSelect={() => run(() => toggleStar(person.id), "")}>
                  {person.starred ? <StarOff /> : <Star />}
                  {person.starred ? "Unstar" : "Star"}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {!viaHelper && (
                <>
                  <DropdownMenuItem onSelect={() => setLogging(true)}>
                    <ClipboardPaste />
                    Paste a reply from LinkedIn
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {isLead && (
                <DropdownMenuItem onSelect={() => run(() => moveToOther([person.id]), `${first} moved to Other.`)}>
                  <FolderInput />
                  Move to Other
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => run(() => archivePerson(person.id), `${person.name} archived.`)}
              >
                <Archive />
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {!isLead && (
        <NotLeadBar personId={person.id} firstName={first} currentStage={person.stage} stages={stages} tags={tags} ask={person.askLead} />
      )}

      <div ref={scroller} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <ol className="flex flex-col px-8 pt-6 pb-7">
          {person.connectedAt && (
            <li className="mb-4 text-center text-2xs text-muted-foreground">
              {hydrated ? `Connected ${shortDate(new Date(person.connectedAt))}` : "\u00a0"}
            </li>
          )}
          {hydrated && <AcceptedLine person={person} />}
          {messages.map((m, i) => {
            const mine = m.direction === "out";
            // Like Messages: the latest message you sent says it arrived.
            const lastMine = mine && !messages.slice(i + 1).some((x) => x.direction === "out") && person.pending.length === 0;
            // Seen: their read receipt is from after it, or they have written since.
            const seen =
              lastMine &&
              ((person.seenAt !== undefined && new Date(person.seenAt).getTime() >= new Date(m.sentAt).getTime()) ||
                messages.slice(i + 1).some((x) => x.direction === "in"));
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
                  <div className="mb-2 w-full text-center text-2xs text-muted-foreground">
                    {hydrated ? stamp(m.sentAt) : "\u00a0"}
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
                    {isVoiceNote(m.body) ? (
                      <a
                        href={chatUrl(person.conversationId, person.linkedinUrl)}
                        target="_blank"
                        rel="noreferrer"
                        title="Opens this chat on LinkedIn, in a new tab"
                        className="group inline-flex items-center gap-2 font-medium"
                      >
                        <Mic className="size-4 shrink-0" />
                        Voice note
                        <span className="inline-flex items-center gap-1 text-xs font-normal opacity-70 group-hover:underline group-hover:opacity-100">
                          Play on LinkedIn
                          <ExternalLink className="size-3" />
                        </span>
                      </a>
                    ) : (
                      m.body
                    )}
                  </div>
                </div>
                {(m.followUp || (lastMine && (m.onLinkedIn || seen))) && (
                  <div className="flex items-center gap-1.5 px-10 text-2xs text-muted-foreground">
                    {m.followUp ? `Follow-up ${m.followUp}` : null}
                    {m.followUp && lastMine && (m.onLinkedIn || seen) ? " · " : null}
                    {lastMine && seen ? (
                      <span className="inline-flex items-center gap-1 font-medium text-blue-600" title="They have read it on LinkedIn.">
                        <CheckCheck className="size-3.5" />
                        Seen{person.seenAt && hydrated ? ` ${seenLabel(person.seenAt)}` : ""}
                      </span>
                    ) : lastMine && m.onLinkedIn ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700" title="LinkedIn has it: it is in the conversation on LinkedIn.">
                        <CheckCheck className="size-3.5" />
                        Delivered on LinkedIn
                      </span>
                    ) : null}
                  </div>
                )}
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
                {p.status === "sending" ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="size-3.5" />
                    Sending to LinkedIn…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="size-3" />
                    {account.helper.connected ? "Sending in a few seconds" : "Waiting for Chrome: it goes out when Chrome is open"}
                  </span>
                )}
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
          {(person.failed ?? []).map((f) => (
            <li key={f.id} className="mt-5 flex flex-col items-end gap-1">
              <div className="flex w-full flex-row-reverse items-end gap-2">
                <span className={AVATAR_SLOT}>
                  <MyAvatar account={account} />
                </span>
                <div className="max-w-[56%] rounded-2xl border border-dashed border-red-300 bg-red-50/60 px-3.5 py-[calc(0.5rem-1px)] text-md leading-[1.375rem] break-words whitespace-pre-wrap text-foreground/80">
                  {f.body}
                </div>
              </div>
              <div className="flex max-w-[70%] flex-col items-end gap-0.5 px-10 text-right text-2xs">
                <span className="inline-flex items-start gap-1 text-red-700">
                  <AlertCircle className="mt-px size-3.5 shrink-0" />
                  Not sent. {f.error}
                </span>
                <span className="flex gap-3">
                  {person.connection === "no" && !person.conversationId && !["queued", "sending", "sent", "withdrawing"].includes(person.invite?.status ?? "") && (
                    <button
                      type="button"
                      className="font-semibold text-foreground underline underline-offset-2"
                      onClick={() => setConnecting({ note: f.body, replaces: f.id })}
                    >
                      Connect, and use this as the note
                    </button>
                  )}
                  <button
                    type="button"
                    className="font-semibold text-red-700 underline underline-offset-2 hover:text-red-900"
                    onClick={() =>
                      run(async () => {
                        await retryQueued(f.id);
                        window.postMessage({ source: "aili-page", type: "sync-now" }, window.location.origin);
                      }, "")
                    }
                  >
                    Try again
                  </button>
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => run(() => cancelQueued(f.id), "Removed.")}>
                    Remove
                  </button>
                </span>
              </div>
            </li>
          ))}
          {isLead && hydrated && person.pending.length === 0 && <FollowUpLine row={row} />}
          {messages.length === 0 && person.pending.length === 0 && !showConnect && person.invite?.status !== "accepted" && (
            <li className="text-center text-xs text-muted-foreground">No messages yet. Send the first one.</li>
          )}
        </ol>
      </div>

      {showConnect ? (
        <footer className="flex flex-col gap-3 px-6 pt-1 pb-4">
          <ConnectPanel
            person={person}
            account={account}
            state={connect}
            onConnect={(note) => setConnecting({ note: note ?? "" })}
            onWriteAnyway={connect === "connect" ? () => setWriteAnyway(true) : undefined}
          />
        </footer>
      ) : (
        <footer className="flex flex-col gap-4 px-6 pt-1 pb-4">

          {aiDraft && (
            <div className="-mb-1 flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-sky-50 px-2 font-medium text-sky-700">
                <Sparkles className="size-3" />
                Draft from {aiDraft.source}
              </span>
              <span suppressHydrationWarning>{relativeTime(aiDraft.at)}</span>
              <span>· Check it, then send</span>
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
                onClick={() =>
                  run(async () => {
                    await discardDraft(person.id);
                    setDraft("");
                  }, "Draft discarded.")
                }
              >
                <X className="size-3" />
                Discard
              </button>
            </div>
          )}
          <div className="flex items-end gap-2.5">
            <TemplatePicker
              templates={templates}
              person={person}
              onPick={(text, id) => {
                setDraft(text);
                setTemplateId(id);
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
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (!e.target.value.trim()) setTemplateId(undefined);
                }}
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
          {!draft.trim() && <AiTip apps={account.aiApps} first={first} />}
          {/* A line under the box only when sending works differently from usual. */}
          {(capReached || !viaHelper || !account.helper.connected || draft.trim()) && (
            <div className="flex justify-between text-2xs text-muted-foreground">
              <span>
                {capReached
                  ? `Daily cap of ${account.dailyCap} reached. Sending opens again tomorrow.`
                  : viaHelper && !account.helper.connected
                    ? "Sends when Chrome is open. It waits in the queue."
                    : viaHelper
                      ? ""
                      : account.helper.connected
                        ? "AILI has not matched this person on LinkedIn yet, so this one is copy and paste."
                        : "Copies the message and logs it once you confirm you sent it on LinkedIn."}
              </span>
              <span>{draft.trim() ? `${draft.trim().split(/\s+/).length} words` : ""}</span>
            </div>
          )}
        </footer>
      )}

      <ConnectDialog
        open={connecting !== null}
        onOpenChange={(open) => !open && setConnecting(null)}
        person={person}
        account={account}
        templates={templates}
        initialNote={connecting?.note}
        onSent={() => {
          // The message that could not go becomes the note, so it is not left behind as failed.
          if (connecting?.replaces) void cancelQueued(connecting.replaces).catch(() => {});
        }}
      />

      <SendDialog
        open={sending}
        onOpenChange={setSending}
        personId={person.id}
        personName={person.name}
        linkedinUrl={person.linkedinUrl}
        body={draft}
        followUp={followUp}
        templateId={templateId}
        onSent={() => {
          setDraft("");
          setTemplateId(undefined);
          onSent?.();
        }}
      />
      <LogReplyDialog open={logging} onOpenChange={setLogging} personId={person.id} personName={person.name} />
    </section>
  );
}
