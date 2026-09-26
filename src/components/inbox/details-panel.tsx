"use client";

import { ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
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
import { TagChip } from "@/components/tag-chip";
import type { Row } from "./inbox-view";

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold">{label}</div>
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
  const personTags = tags.filter((t) => person.tagIds.includes(t.id));
  const inbound = person.messages.filter((m) => m.direction === "in");
  const lastIn = inbound[inbound.length - 1];

  return (
    <aside
      aria-label="Person details"
      className="flex w-[230px] shrink-0 flex-col gap-5 border-l px-5 py-5 text-xs"
      key={person.id}
    >
      <div className="text-[15px] font-semibold">Details</div>

      <div className="flex items-center gap-2.5">
        <Avatar>
          <AvatarFallback className="text-xs">{initials(person.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{person.name}</div>
          <a
            href={person.linkedinUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Open on LinkedIn
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      <Field label="Stage">
        <Select defaultValue={person.stage} onValueChange={() => toast("Stage changes save in step 2.")}>
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
          <Button
            variant="outline"
            size="xs"
            className="border-dashed text-muted-foreground"
            onClick={() => toast("Tagging arrives in step 2.")}
          >
            <Plus />
            Add
          </Button>
        </div>
      </Field>

      <Field label="Notes">
        {person.notes ? (
          <div className="rounded-md border px-3 py-2.5 whitespace-pre-line leading-relaxed">
            {person.notes}
          </div>
        ) : (
          <button
            type="button"
            className="rounded-md border border-dashed px-3 py-2.5 text-left text-muted-foreground hover:text-foreground"
            onClick={() => toast("Notes save in step 2.")}
          >
            Add a note about the trigger and the process.
          </button>
        )}
      </Field>

      <Separator />

      <Field label="Timeline">
        <Fact label="Connected" value={person.connectedAt ? shortDate(new Date(person.connectedAt)) : "Not yet"} />
        <Fact label="Messages" value={String(person.messages.length)} />
        <Fact label="Last reply" value={lastIn ? shortDate(new Date(lastIn.sentAt)) : "None"} />
        <Fact label="Next step" value={step.dueNow ? "Today" : shortDate(step.dueAt)} />
      </Field>
    </aside>
  );
}
