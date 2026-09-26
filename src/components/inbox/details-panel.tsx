"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { updateNotes, updateStage } from "@/lib/actions";
import type { Tag } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { shortDate } from "@/lib/next-step";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { TagChip } from "@/components/tag-chip";
import { TagPicker } from "@/components/people/tag-picker";
import { PersonDialog } from "@/components/people/person-dialog";
import type { Row } from "@/lib/rows";

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Field({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">{label}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function DetailsPanel({ row, tags }: { row: Row; tags: Tag[] }) {
  const { person, step } = row;
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState(person.notes);
  const [editing, setEditing] = useState(false);

  const personTags = tags.filter((t) => person.tagIds.includes(t.id));
  const inbound = person.messages.filter((m) => m.direction === "in");
  const lastIn = inbound[inbound.length - 1];

  function saveNotes() {
    if (notes === person.notes) return;
    start(async () => {
      try {
        await updateNotes(person.id, notes);
      } catch {
        toast.error("Notes did not save.");
      }
    });
  }

  return (
    <aside
      aria-label="Person details"
      className="flex w-[230px] shrink-0 flex-col gap-5 overflow-auto border-l px-5 py-5 text-xs"
    >
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-semibold">Details</div>
        <Button variant="ghost" size="icon-xs" aria-label="Edit person" onClick={() => setEditing(true)}>
          <Pencil />
        </Button>
      </div>
      <PersonDialog open={editing} onOpenChange={setEditing} tags={tags} person={person} />

      <div className="flex items-center gap-2.5">
        <Avatar>
          <AvatarFallback className="text-xs">{initials(person.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{person.name}</div>
          {person.linkedinUrl ? (
            <a
              href={person.linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Open on LinkedIn
              <ExternalLink className="size-3" />
            </a>
          ) : (
            <span className="text-[11px] text-muted-foreground">No LinkedIn URL yet</span>
          )}
        </div>
      </div>

      <Field label="Stage">
        <Select
          value={person.stage}
          disabled={pending}
          onValueChange={(stage) =>
            start(async () => {
              try {
                await updateStage(person.id, stage);
              } catch {
                toast.error("Stage did not save.");
              }
            })
          }
        >
          <SelectTrigger size="sm" className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAGES.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Tags">
        <div className="flex flex-wrap gap-1.5">
          {personTags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
          <TagPicker personId={person.id} tags={tags} selected={person.tagIds} />
        </div>
      </Field>

      <Field label="Notes">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={4}
          placeholder="The trigger, the process, anything to remember."
          className="min-h-0 resize-none text-xs leading-relaxed"
        />
      </Field>

      <Separator />

      <Field label="Timeline">
        <Fact label="Connected" value={person.connectedAt ? shortDate(new Date(person.connectedAt)) : "Not yet"} />
        <Fact label="Messages" value={String(person.messages.length)} />
        <Fact label="Last reply" value={lastIn ? shortDate(new Date(lastIn.sentAt)) : "None"} />
        <Fact label="Next step" value={step.kind === "stale" ? "None" : step.dueNow ? "Today" : shortDate(step.dueAt)} />
        {person.snoozedUntil && (
          <Fact label="Snoozed until" value={shortDate(new Date(person.snoozedUntil))} />
        )}
      </Field>
    </aside>
  );
}
