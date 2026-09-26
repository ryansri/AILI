"use client";

import { useMemo, useState } from "react";
import type { Account, Person, Tag } from "@/lib/types";
import { nextStep } from "@/lib/next-step";
import { sortRows, type Filter, type Row, type Sort } from "@/lib/rows";
import { InboxSidebar } from "./inbox-sidebar";
import { PeopleList } from "./people-list";
import { ConversationPane } from "./conversation-pane";
import { DetailsPanel } from "./details-panel";

export function InboxView({
  people,
  tags,
  account,
  initialPersonId,
}: {
  people: Person[];
  tags: Tag[];
  account: Account;
  initialPersonId: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("due");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialPersonId);

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
    return sortRows(list, sort);
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
        account={account}
        onCreated={setSelectedId}
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
          <ConversationPane row={selected} account={account} />
          <DetailsPanel key={selected.person.id} row={selected} tags={tags} />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Nothing here. Try another list, or add a person.
        </div>
      )}
    </div>
  );
}
