"use client";

import { useState } from "react";
import { MoreHorizontal, Send, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Tag } from "@/lib/types";
import { stageLabel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { STATUS, StatusDot } from "@/components/status-dot";
import { NextStepHint } from "./next-step-hint";
import type { Row } from "./inbox-view";

function messageDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) {
    return `today ${d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  }
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function ConversationPane({ row }: { row: Row; tags: Tag[] }) {
  const { person, step } = row;
  const status = STATUS[step.kind];
  const [draft, setDraft] = useState("");

  const messages = [...person.messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
  const lastId = messages[messages.length - 1]?.id;

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
              {person.headline}, {person.company}
              {person.location ? `, ${person.location}` : ""}
            </p>
          </div>
          <Badge variant="secondary" className="font-normal">
            {stageLabel(person.stage)}
          </Badge>
          <Button variant="ghost" size="icon-sm" aria-label="Star">
            <Star />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="More">
            <MoreHorizontal />
          </Button>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast("AI drafting arrives in step 4.")}
          >
            <Sparkles />
            Draft with AI
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast("Snooze arrives in step 2.")}>
            Snooze
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast("Mark done arrives in step 2.")}>
            Mark done
          </Button>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
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
                    "max-w-[560px] rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed",
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
      </ScrollArea>

      <footer className="flex items-end gap-2.5 border-t px-6 py-3">
        <label htmlFor="reply" className="sr-only">
          Your reply
        </label>
        <Textarea
          id="reply"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Reply to ${person.name.split(" ")[0]}`}
          className="min-h-0 resize-none text-[13px]"
        />
        <Button
          size="sm"
          className="h-9"
          disabled={!draft.trim()}
          onClick={() => {
            toast.success("Sending arrives in step 3. Nothing was sent.");
            setDraft("");
          }}
        >
          <Send />
          Send
        </Button>
      </footer>
    </section>
  );
}
