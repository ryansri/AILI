"use client";

import { useState, useTransition } from "react";
import { Bell, Check, ExternalLink, MessageSquare, RotateCcw, Undo2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { addTouch, openedForAlerts, queueInvite, removeTouch, withdrawInvites } from "@/lib/client-actions";
import { needsConnect, NOTE_FREE_MAX, NOTE_MAX } from "@/lib/invites";
import { shortDate } from "@/lib/next-step";
import type { Account, Person } from "@/lib/types";
import type { Template } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { TemplatePicker } from "@/components/templates/template-picker";
import { PersonAvatar } from "@/components/person-avatar";

/*
 * Connection requests in a conversation. LinkedIn only lets you message people
 * you are connected with, so for anyone else the message box gives way to
 * Connect; after that, the request's progress, and once they accept, a line
 * saying so above the first message.
 */

export type ConnectState = "connect" | "queued" | "sent" | "withdrawing" | "failed" | null;

/** Where this person is with a connection request, or null when you can just write. */
export function connectStateOf(person: Person): ConnectState {
  const invite = person.invite;
  if (invite?.status === "queued" || invite?.status === "sending") return "queued";
  if (invite?.status === "sent") return "sent";
  if (invite?.status === "withdrawing") return "withdrawing";
  if (invite?.status === "failed") return "failed";
  return needsConnect(person) ? "connect" : null;
}

const firstOf = (p: Person) => p.name.trim().split(/\s+/)[0] || p.name;

/** Asks the Chrome helper to look now rather than at its next minute. */
function nudgeHelper() {
  window.postMessage({ source: "aili-page", type: "sync-now" }, window.location.origin);
}

/** Connect: a note or none, sent from your Chrome when you click. */
export function ConnectDialog({
  open,
  onOpenChange,
  person,
  account,
  templates,
  initialNote = "",
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: Person;
  account: Account;
  templates: Template[];
  initialNote?: string;
  onSent?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <ConnectForm person={person} account={account} templates={templates} initialNote={initialNote} onDone={() => onOpenChange(false)} onSent={onSent} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConnectForm({
  person,
  account,
  templates,
  initialNote,
  onDone,
  onSent,
}: {
  person: Person;
  account: Account;
  templates: Template[];
  initialNote: string;
  onDone: () => void;
  onSent?: () => void;
}) {
  const first = firstOf(person);
  const [withNote, setWithNote] = useState(true);
  const [note, setNote] = useState(initialNote.slice(0, NOTE_MAX));
  const [pending, start] = useTransition();
  const { cap, today, week } = account.invites;
  const full = today >= cap;
  const subtitle = [person.jobTitle || person.headline, person.company].filter(Boolean).join(" · ");
  const length = note.trim().length;

  function send() {
    start(async () => {
      try {
        await queueInvite(person.id, withNote ? note : "");
        nudgeHelper();
        toast.success(account.helper.connected ? `Sending your request to ${first}.` : `Your request to ${first} goes out when Chrome is open.`);
        onSent?.();
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That did not save.");
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <DialogHeader>
        <DialogTitle>Connect with {first}</DialogTitle>
        <DialogDescription>Sent from your Chrome, on LinkedIn, when you click Send request.</DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
        <PersonAvatar person={person} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-md font-semibold">{person.name}</div>
          {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {person.linkedinUrl && (
          <a href={person.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            View profile
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      <div role="group" aria-label="Note" className="flex self-start rounded-lg bg-muted p-0.5">
        {[
          [true, "With a note"],
          [false, "No note"],
        ].map(([value, label]) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={withNote === value}
            onClick={() => setWithNote(value as boolean)}
            className={cn(
              "h-7 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground",
              withNote === value && "bg-background font-semibold text-foreground shadow-sm",
            )}
          >
            {label as string}
          </button>
        ))}
      </div>

      {withNote && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <TemplatePicker templates={templates} person={person} onPick={(text) => setNote(text.slice(0, NOTE_MAX))} />
            <label htmlFor="connect-note" className="sr-only">
              Note to {first}
            </label>
            <Textarea
              id="connect-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder={`Hi ${first}, …`}
              rows={4}
              autoFocus
              className="min-h-24 flex-1 resize-none text-md"
            />
          </div>
          <div className="flex justify-between gap-3 text-2xs text-muted-foreground">
            <span>Free LinkedIn accounts get {NOTE_FREE_MAX} characters and a few notes a month; Premium gets {NOTE_MAX}.</span>
            <span className={cn("shrink-0 tabular-nums", length > NOTE_FREE_MAX && "font-semibold text-amber-700")}>
              {length} / {NOTE_MAX}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 rounded-lg bg-muted/70 px-3 py-2 text-xs text-muted-foreground">
        <span>Today</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
          <span className="block h-full rounded-full bg-foreground" style={{ width: `${Math.min(100, Math.round((today / Math.max(1, cap)) * 100))}%` }} />
        </span>
        <span className="tabular-nums">
          <span className="font-semibold text-foreground">
            {today} of {cap}
          </span>{" "}
          today · {week} this week
        </span>
      </div>
      {full && <p className="-mt-2 text-xs text-amber-700">That&rsquo;s today&rsquo;s {cap}. More tomorrow, or change the limit in Settings, Sending.</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || full || (withNote && !note.trim())}>
          <UserPlus />
          Send request
        </Button>
      </DialogFooter>
    </form>
  );
}

/** The one box above the message area: "Next", one plain sentence, the button for it. */
export function NextBox({
  title,
  action,
  children,
  tone,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  tone?: "bad";
}) {
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-2xl border px-4 py-3.5 shadow-xs", tone === "bad" && "border-red-200 dark:border-red-900")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Next</span>
        <span className={cn("min-w-0 flex-1 text-md font-semibold", tone === "bad" && "text-red-700 dark:text-red-400")}>{title}</span>
        {action && <span className="flex shrink-0 flex-wrap items-center gap-2">{action}</span>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-2.5 text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

/**
 * While you are not connected, the Next box in place of the message box:
 * send a request (with the warm-up tip), then wait for it, or fix it.
 * "Already connected?" opens the message box when AILI is only guessing.
 */
export function ConnectPanel({
  person,
  account,
  state,
  onConnect,
  onWriteAnyway,
}: {
  person: Person;
  account: Account;
  state: Exclude<ConnectState, null>;
  onConnect: (note?: string) => void;
  onWriteAnyway?: () => void;
}) {
  const first = firstOf(person);
  const invite = person.invite;
  const [pending, start] = useTransition();
  const [now] = useState(() => Date.now());
  const act = (fn: () => Promise<unknown>, done: string) =>
    start(async () => {
      try {
        await fn();
        nudgeHelper();
        if (done) toast.success(done);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That did not save.");
      }
    });
  const reaskFrom =
    invite?.status === "withdrawn" && invite.withdrawnAt ? new Date(new Date(invite.withdrawnAt).getTime() + 21 * 86400000) : null;
  const tooSoon = reaskFrom !== null && reaskFrom.getTime() > now;

  const needed = account.alerts.touchesToConnect;
  const touches = person.touches?.length ?? 0;
  const warm = touches >= needed;
  const link = "underline-offset-2 hover:text-foreground hover:underline";

  if (state === "connect") {
    return (
      <NextBox
        title={`Send ${first} a connection request`}
        action={
          <Button size="sm" onClick={() => onConnect()} disabled={tooSoon}>
            <UserPlus />
            Connect
          </Button>
        }
      >
        {tooSoon ? (
          <span className="flex-1 text-amber-700" suppressHydrationWarning>
            You withdrew one on {shortDate(new Date(invite!.withdrawnAt!))}. LinkedIn lets you ask again from {shortDate(reaskFrom!)}.
          </span>
        ) : warm ? (
          <span className="flex-1">
            <span className="font-semibold text-foreground">You&rsquo;ve commented {touches} times.</span> A good time to connect.
          </span>
        ) : (
          <span className="flex-1">
            Tip: comment on {needed} of {first}&rsquo;s posts first, so they know your name.{" "}
            <span className="font-semibold text-foreground">
              {touches} of {needed} done.
            </span>
          </span>
        )}
        {!warm && (
          <>
            {touches > 0 && (
              <button type="button" disabled={pending} onClick={() => act(() => removeTouch(person.id), "")} className={link}>
                Undo
              </button>
            )}
            <Button size="xs" variant="outline" disabled={pending} onClick={() => act(() => addTouch(person.id), "Comment counted.")}>
              <MessageSquare />
              I commented
            </Button>
          </>
        )}
        {person.alerts !== "on" && person.alerts !== "impossible" && person.linkedinUrl && (
          <a
            href={person.linkedinUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => act(() => openedForAlerts(person.id), "")}
            title="Opens their profile: tap the bell there, and LinkedIn tells you when they post"
            className={cn("inline-flex items-center gap-1", link)}
          >
            <Bell className="size-3" />
            Turn on post alerts
          </a>
        )}
        {onWriteAnyway && person.connection !== "no" && (
          <button type="button" onClick={onWriteAnyway} className={cn("ml-auto", link)}>
            Already connected? Write a message
          </button>
        )}
      </NextBox>
    );
  }

  if (state === "queued") {
    return (
      <NextBox
        title={account.helper.connected ? `Sending your request to ${first}…` : `Your request to ${first} goes out when Chrome is open`}
        action={
          <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => withdrawInvites([person.id]), "Request taken back.")}>
            <X />
            Cancel
          </Button>
        }
      />
    );
  }

  if ((state === "sent" || state === "withdrawing") && invite) {
    return (
      <NextBox
        title={state === "withdrawing" ? "Withdrawing your request…" : `Wait for ${first} to accept`}
        action={
          state === "sent" && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => withdrawInvites([person.id]), `Withdrawing your request to ${first}.`)}>
              <Undo2 />
              Withdraw
            </Button>
          )
        }
      >
        <span suppressHydrationWarning>
          Request sent {invite.sentAt ? shortDate(new Date(invite.sentAt)) : ""}
          {invite.source === "linkedin" ? " on LinkedIn" : ""}. AILI tells you when {first} accepts.
        </span>
        {invite.error && <span className="text-amber-700">{invite.error}</span>}
      </NextBox>
    );
  }

  if (state === "failed" && invite) {
    return (
      <NextBox
        tone="bad"
        title={`Your request to ${first} didn't go through`}
        action={
          <>
            <Button size="sm" disabled={pending} onClick={() => act(() => queueInvite(person.id, invite.note), "Trying again.")}>
              <RotateCcw />
              Try again
            </Button>
            <Button size="sm" variant="outline" onClick={() => onConnect(invite.note)}>
              Edit
            </Button>
          </>
        }
      >
        <span className="flex-1">{invite.error}</span>
        {invite.note && (
          <button type="button" disabled={pending} onClick={() => act(() => queueInvite(person.id, ""), "Sending it without a note.")} className={link}>
            Send without a note
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => act(() => withdrawInvites([person.id]), "Removed.")} className={link}>
          Remove
        </button>
      </NextBox>
    );
  }
  return null;
}

/** "Jaimes accepted your request": above the first message, until you have written. */
export function AcceptedLine({ person }: { person: Person }) {
  const [now] = useState(() => Date.now());
  const invite = person.invite;
  if (invite?.status !== "accepted" || !invite.acceptedAt) return null;
  const at = new Date(invite.acceptedAt).getTime();
  if (person.messages.some((m) => m.direction === "out" && new Date(m.sentAt).getTime() >= at) || person.pending.length) return null;
  const hours = Math.max(0, Math.round((now - at) / 3600000));
  const sentDays = invite.sentAt ? Math.max(0, Math.round((at - new Date(invite.sentAt).getTime()) / 86400000)) : null;
  return (
    <li className="mb-4 flex flex-col items-center gap-2">
      <div className="flex max-w-xl items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="size-3" strokeWidth={3.5} />
        </span>
        <span suppressHydrationWarning>
          <span className="font-semibold">{firstOf(person)} accepted your request</span> ·{" "}
          {hours < 1 ? "just now" : hours < 48 ? `${hours} ${hours === 1 ? "hour" : "hours"} ago` : shortDate(new Date(at))}
          {sentDays !== null && sentDays > 0 ? `, ${sentDays} ${sentDays === 1 ? "day" : "days"} after you sent it` : ""}.
        </span>
      </div>
      <span className="text-2xs text-muted-foreground">Best within a day: say hello while they still remember your name.</span>
    </li>
  );
}
