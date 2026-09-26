"use client";

import { useMemo, useState } from "react";
import type { Person, Tag } from "@/lib/types";
import { KIND_ORDER, nextStep, type NextStep, type StatusKind } from "@/lib/next-step";
import { InboxSidebar } from "./inbox-sidebar";
import { PeopleList } from "./people-list";
import { ConversationPane } from "./conversation-pane";
import { DetailsPanel } from "./details-panel";

export type Filter = "all" | StatusKind;
export type Sort = "due" | "name";

export interface Row {
  person: Person;
  step: NextStep;
}

export function InboxView({ people, tags }: { people: Person[]; tags: Tag[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("due");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const now = new Date();
    return people.map((person) => ({ person, step: nextStep(person, now) }));
  }, [people]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, reply: 0, chase: 0, quiet: 0, waiting: 0 };
    for (const r of rows) c[r.step.kind] += 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (filter !== "all" && r.step.kind !== filter) return false;
      if (tagFilter && !r.person.tagIds.includes(tagFilter)) return false;
      if (q && !`${r.person.name} ${r.person.company} ${r.person.headline}`.toLowerCase().includes(q)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sort === "name") return a.person.name.localeCompare(b.person.name);
      const dueDiff = Number(b.step.dueNow) - Number(a.step.dueNow);
      if (dueDiff !== 0) return dueDiff;
      const kindDiff = KIND_ORDER[a.step.kind] - KIND_ORDER[b.step.kind];
      if (kindDiff !== 0) return kindDiff;
      return a.step.dueAt.getTime() - b.step.dueAt.getTime();
    });
    return list;
  }, [rows, filter, tagFilter, sort, query]);

  const selected = rows.find((r) => r.person.id === selectedId) ?? visible[0] ?? null;

  return (
    <div className="flex h-full w-full">
      <InboxSidebar
        filter={filter}
        onFilter={setFilter}
        counts={counts}
        tags={tags}
        tagFilter={tagFilter}
        onTagFilter={setTagFilter}
      />
      <PeopleList
        rows={visible}
        filter={filter}
        selectedId={selected?.person.id ?? null}
        onSelect={setSelectedId}
        sort={sort}
        onSort={setSort}
        query={query}
        onQuery={setQuery}
      />
      {selected ? (
        <>
          <ConversationPane row={selected} tags={tags} />
          <DetailsPanel row={selected} tags={tags} />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Nothing here. Try another list.
        </div>
      )}
    </div>
  );
}
