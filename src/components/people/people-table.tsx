"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueLabel, nextStep, relativeTime } from "@/lib/next-step";
import { STAGES, stageLabel, type Person, type Tag } from "@/lib/types";
import { HeaderAction, HeaderSearch, PageHeader, useHeaderSearch } from "@/components/page-header";
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
  const search = useHeaderSearch(query);

  const rows = useMemo<Row[]>(() => {
    const now = new Date();
    const q = query.trim().toLowerCase();
    const list = people
      .filter((p) => stage === "all" || p.stage === stage)
      .filter((p) => tagId === "all" || p.tagIds.includes(tagId))
      .filter((p) => !q || `${p.name} ${p.company} ${p.headline} ${p.location ?? ""}`.toLowerCase().includes(q))
      .map((person) => ({ person, step: nextStep(person, now) }));
    return sortRows(list, "recent");
  }, [people, query, stage, tagId]);

  const chip = (active: boolean) =>
    cn(
      "h-7 rounded-full border px-2.5 text-xs transition-colors hover:bg-accent",
      active && "border-foreground bg-foreground text-background hover:bg-foreground",
    );

  return (
    <div className="flex h-full w-full flex-col">
      <PageHeader
        title="People"
        search={
          search.open ? (
            <HeaderSearch
              value={query}
              onChange={setQuery}
              placeholder="Search name, company, role"
              open
              onOpenChange={search.setOpen}
            />
          ) : undefined
        }
        actions={
          <>
            <HeaderSearch value={query} onChange={setQuery} open={false} onOpenChange={search.setOpen} />
            <HeaderAction icon={Plus} label="Add person" onClick={() => setAdding(true)} />
          </>
        }
      >
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
      </PageHeader>
      <PersonDialog open={adding} onOpenChange={setAdding} tags={tags} />

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
                      <div className="text-md font-semibold">{person.name}</div>
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
                        {step.kind === "stale" ? step.detail : step.dueNow ? "today" : dueLabel(step.dueAt)}
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
                  <TableCell className="text-xs text-muted-foreground" suppressHydrationWarning>
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
