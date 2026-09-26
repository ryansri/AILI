"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueLabel, nextStep, relativeTime } from "@/lib/next-step";
import { STAGES, stageLabel, type Person, type Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STATUS, StatusDot } from "@/components/status-dot";
import { TagDot } from "@/components/tag-chip";
import { PersonDialog } from "./person-dialog";
import { sortRows, type Row } from "@/lib/rows";

export function PeopleTable({ people, tags }: { people: Person[]; tags: Tag[] }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [tagId, setTagId] = useState<string>("all");
  const [adding, setAdding] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const now = new Date();
    const q = query.trim().toLowerCase();
    const list = people
      .filter((p) => stage === "all" || p.stage === stage)
      .filter((p) => tagId === "all" || p.tagIds.includes(tagId))
      .filter((p) => !q || `${p.name} ${p.company} ${p.headline} ${p.location ?? ""}`.toLowerCase().includes(q))
      .map((person) => ({ person, step: nextStep(person, now) }));
    return sortRows(list, "due");
  }, [people, query, stage, tagId]);

  const chip = (active: boolean) =>
    cn(
      "h-7 rounded-full border px-2.5 text-xs transition-colors hover:bg-accent",
      active && "border-foreground bg-foreground text-background hover:bg-foreground",
    );

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex flex-col gap-3 border-b px-6 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-[17px] font-semibold leading-tight">People</h1>
            <p className="text-xs text-muted-foreground">
              {people.length} in your pipeline. Click a row to open the conversation.
            </p>
          </div>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, company, role"
              className="h-8 pl-8 text-[13px]"
            />
          </div>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus />
            Add person
          </Button>
          <PersonDialog open={adding} onOpenChange={setAdding} tags={tags} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={chip(stage === "all")} onClick={() => setStage("all")}>
            All stages
          </button>
          {STAGES.map((s) => (
            <button key={s.id} type="button" className={chip(stage === s.id)} onClick={() => setStage(s.id)}>
              {s.label}
            </button>
          ))}
          {tags.length > 0 && <span className="mx-1 h-4 w-px bg-border" />}
          {tags.map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(chip(tagId === t.id), "inline-flex items-center gap-1.5")}
              onClick={() => setTagId(tagId === t.id ? "all" : t.id)}
            >
              <TagDot color={t.color} />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead className="pl-6">Person</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Next step</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Last touch</TableHead>
              <TableHead className="pr-6 text-right">Messages</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ person, step }) => {
              const last = person.messages[person.messages.length - 1];
              const personTags = tags.filter((t) => person.tagIds.includes(t.id));
              return (
                <TableRow key={person.id} className="cursor-pointer">
                  <TableCell className="pl-6">
                    <Link href={`/inbox?person=${person.id}`} className="block">
                      <div className="text-[13px] font-semibold">{person.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[person.headline, person.company].filter(Boolean).join(", ")}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{stageLabel(person.stage)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <StatusDot kind={step.kind} />
                      <span className={STATUS[step.kind].text}>{step.step}</span>
                      <span className="font-normal text-muted-foreground">
                        {step.dueNow ? "today" : dueLabel(step.dueAt)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {personTags.map((t) => (
                        <span key={t.id} className="inline-flex items-center gap-1.5 text-xs">
                          <TagDot color={t.color} />
                          {t.label}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {last ? relativeTime(last.sentAt) : "Never"}
                  </TableCell>
                  <TableCell className="pr-6 text-right text-xs tabular-nums">{person.messages.length}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {rows.length === 0 && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {people.length === 0 ? "No one yet. Add your first person." : "No one matches those filters."}
          </div>
        )}
      </div>
    </div>
  );
}
