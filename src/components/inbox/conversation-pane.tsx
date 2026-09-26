"use client";

import { useState, useTransition } from "react";
import { MessageSquareReply, MoreHorizontal, Send, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { archivePerson, toggleStar, updateStage } from "@/lib/actions";
import type { Account } from "@/lib/types";
import { stageLabel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { STATUS, StatusDot } from "@/components/status-dot";
import { NextStepHint } from "./next-step-hint";
import { SnoozeMenu } from "./snooze-menu";
import { LogReplyDialog } from "./log-reply-dialog";
import { SendDialog } from "./send-dialog";
import type { Row } from "@/lib/rows";

function messageDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return `today ${d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  }
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function ConversationPane({ row, account }: { row: Row; account: Account }) {
  const { person, step } = row;
  const status = STATUS[step.kind];
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [logging, setLogging] = useState(false);
  const [, start] = useTransition();

  const messages = [...person.messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
  const lastId = messages[messages.length - 1]?.id;
  const capReached = account.sentToday >= account.dailyCap;
  const followUp: 1 | 2 | undefined =
    step.step === "Follow-up 1" ? 1 : step.step === "Follow-up 2" ? 2 : undefined;

  function run(fn: () => Promise<unknown>, done: string) {
    start(async () => {
      try {
        await fn();
        if (done) toast.success(done);
      } catch {
        toast.error("That did not save.");
      }
    });
  }

  return (
    <section
      aria-label={`Conversation with ${person.name}`}
      className="flex min-w-0 flex-1 flex-col"
      key={person.id}
    >
      <header className="flex flex-col gap-3 border-b px-6 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-semibold leading-tight">{person.name}</h1>
            <p className="text-xs text-muted-foreground">
              {[person.headline, person.company, person.location].filter(Boolean).join(", ")}
            </p>
          </div>
          <Badge variant="secondary" className="font-normal">
            {stageLabel(person.stage)}
          </Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={person.starred ? "Unstar" : "Star"}
            aria-pressed={person.starred}
            onClick={() => run(() => toggleStar(person.id), "")}
          >
            <Star className={cn(person.starred && "fill-amber-400 text-amber-400")} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className={cn("flex items-center gap-2 font-medium", status.text)}>
            <StatusDot kind={step.kind} />
            Next step: {step.step.toLowerCase()} {step.dueNow ? "today" : ""}
          </span>
          <span className="text-muted-foreground">
            <NextStepHint row={row} />
          </span>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => toast("AI drafting arrives in step 4.")}>
            <Sparkles />
            Draft with AI
          </Button>
          <SnoozeMenu personId={person.id} snoozed={Boolean(person.snoozedUntil)} />
          <Button variant="outline" size="sm" onClick={() => setLogging(true)}>
            <MessageSquareReply />
            Log their reply
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <ol className="flex flex-col gap-4 px-6 py-5">
          {messages.map((m) => {
            const mine = m.direction === "out";
            const isNew = m.id === lastId && !mine && step.kind === "reply";
            return (
              <li key={m.id} className="flex flex-col gap-1.5">
                <div className="text-xs text-muted-foreground">
                  {mine ? "You" : person.name}, {messageDate(m.sentAt)}
                  {m.followUp ? ` (follow-up ${m.followUp})` : ""}
                  {isNew && <span className={cn("ml-2 font-medium", status.text)}>New</span>}
                </div>
                <div
                  className={cn(
                    "max-w-[560px] rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed break-words whitespace-pre-wrap",
                    !mine && "bg-muted/60",
                    isNew && "border-foreground",
                  )}
                >
                  {m.body}
                </div>
              </li>
            );
          })}
          {messages.length === 0 && (
            <li className="text-xs text-muted-foreground">No messages yet. Send the first one.</li>
          )}
        </ol>
      </div>

      <footer className="flex flex-col gap-2 border-t px-6 py-3">
        <div className="flex items-end gap-2.5">
          <label htmlFor="reply" className="sr-only">
            Your message
          </label>
          <Textarea
            id="reply"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={followUp ? `Follow-up ${followUp} to ${person.name.split(" ")[0]}` : `Reply to ${person.name.split(" ")[0]}`}
            className="min-h-0 resize-none text-[13px]"
          />
          <Button
            size="sm"
            className="h-9"
            disabled={!draft.trim() || capReached}
            onClick={() => setSending(true)}
          >
            <Send />
            Send
          </Button>
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>
            {capReached
              ? `Daily cap of ${account.dailyCap} reached. Sending opens again tomorrow.`
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
      <LogReplyDialog
        open={logging}
        onOpenChange={setLogging}
        personId={person.id}
        personName={person.name}
      />
    </section>
  );
}
