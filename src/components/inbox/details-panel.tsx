"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { updateNotes, updateStage } from "@/lib/client-actions";
import type { StageDef, Tag } from "@/lib/types";
import { StatusMenu } from "@/components/status-pill";
import { TagChip } from "@/components/tag-chip";
import { TagPicker } from "@/components/people/tag-picker";
import { shortDate, shortTime } from "@/lib/next-step";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { PersonDialog } from "@/components/people/person-dialog";
import type { Row } from "@/lib/rows";
import { PersonAvatar } from "@/components/person-avatar";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</div>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b px-3 py-2 text-xs last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span suppressHydrationWarning>{value}</span>
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
      {label}
    </span>
  );
}

/** Who this person is. It never repeats the next step; the list and the card do that. */
export function DetailsPanel({
  row,
  tags,
  stages,
  onClose,
}: {
  row: Row;
  tags: Tag[];
  stages: StageDef[];
  onClose: () => void;
}) {
  const { person } = row;
  const [, start] = useTransition();
  const [notes, setNotes] = useState(person.notes);
  const [editing, setEditing] = useState(false);

  const inbound = person.messages.filter((m) => m.direction === "in");
  const outbound = person.messages.filter((m) => m.direction === "out");
  const lastIn = inbound[inbound.length - 1];
  const where = [person.jobTitle, person.company, person.location].filter(Boolean).join(" · ");

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

  function changeStage(key: string) {
    start(async () => {
      try {
        await updateStage(person.id, key);
      } catch {
        toast.error("The stage did not save.");
      }
    });
  }

  return (
    <aside
      aria-label="Person details"
      className="flex w-[320px] shrink-0 flex-col gap-5 overflow-auto border-l bg-sidebar px-5 py-4 text-xs"
    >
      <div className="flex items-start gap-2.5">
        <PersonAvatar person={person} className="size-10" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-md font-semibold">{person.name}</div>
          {where && <div className="truncate text-2xs text-muted-foreground">{where}</div>}
          {person.linkedinUrl ? (
            <a
              href={person.linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-2xs text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
            >
              Open on LinkedIn
              <ExternalLink className="size-3" />
            </a>
          ) : (
            <span className="text-2xs text-muted-foreground">No LinkedIn URL yet</span>
          )}
        </div>
        <div className="-mt-1 -mr-2 flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label="Edit person" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close details (Esc)" title="Close (Esc)" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>
      <PersonDialog open={editing} onOpenChange={setEditing} tags={tags} stages={stages} person={person} />

      {person.headline && (
        <Field label="LinkedIn headline">
          <p className="text-xs leading-relaxed text-muted-foreground">{person.headline}</p>
        </Field>
      )}

      {person.lead !== false && (
        <Field label="Stage">
          <div>
            <StatusMenu stages={stages} stage={person.stage} onChange={changeStage} align="start" />
          </div>
        </Field>
      )}

      {person.lead !== false && (
        <Field label="Tags">
          <div className="flex flex-wrap items-center gap-1.5">
            {tags
              .filter((t) => person.tagIds.includes(t.id))
              .map((t) => (
                <TagChip key={t.id} tag={t} />
              ))}
            <TagPicker personId={person.id} tags={tags} selected={person.tagIds} />
          </div>
        </Field>
      )}

      <Field label="Notes">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={4}
          placeholder="The trigger, the process, anything to remember."
          className="min-h-0 resize-none bg-background text-xs leading-relaxed"
        />
      </Field>

      <Field label="Activity">
        <div className="rounded-lg border bg-background">
          <Fact label="Connected" value={person.connectedAt ? shortDate(new Date(person.connectedAt)) : "Not yet"} />
          <Fact label="You sent" value={String(outbound.length + person.pending.length)} />
          <Fact label="They sent" value={String(inbound.length)} />
          <Fact
            label="Last reply"
            value={lastIn ? `${shortDate(new Date(lastIn.sentAt))}, ${shortTime(new Date(lastIn.sentAt))}` : "None"}
          />
          {person.snoozedUntil && <Fact label="Snoozed until" value={shortDate(new Date(person.snoozedUntil))} />}
        </div>
      </Field>

      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1.5 pt-2 text-2xs text-muted-foreground">
        <Shortcut keys={["J", "K"]} label="move" />
        <Shortcut keys={["R"]} label="reply" />
        <Shortcut keys={["E"]} label="done" />
        <Shortcut keys={["S"]} label="snooze" />
      </div>
    </aside>
  );
}
