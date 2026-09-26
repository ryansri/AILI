"use client";

import { useMemo, useState } from "react";
import type { Account, Person, Tag } from "@/lib/types";
import { nextStep, type StatusKind } from "@/lib/next-step";
import { matchesConditions, sortRows, type Condition, type Row, type Sort } from "@/lib/rows";
import { InboxToolbar } from "./toolbar";
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
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [sort, setSort] = useState<Sort>("recent");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialPersonId);

  const rows = useMemo<Row[]>(() => {
    const now = new Date();
    return people.map((person) => ({ person, step: nextStep(person, now) }));
  }, [people]);

  const counts = useMemo(() => {
    const c: Record<StatusKind, number> = { reply: 0, chase: 0, quiet: 0, waiting: 0, stale: 0 };
    for (const r of rows) c[r.step.kind] += 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (!matchesConditions(r, conditions)) return false;
      if (q && !`${r.person.name} ${r.person.company} ${r.person.headline}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return sortRows(list, sort);
  }, [rows, conditions, sort, query]);

  const selected = rows.find((r) => r.person.id === selectedId) ?? visible[0] ?? null;

  return (
    <div className="flex h-full w-full flex-col">
      <InboxToolbar
        conditions={conditions}
        onConditions={setConditions}
        sort={sort}
        onSort={setSort}
        query={query}
        onQuery={setQuery}
        tags={tags}
        counts={counts}
        account={account}
      />
      <div className="flex min-h-0 flex-1">
        <PeopleList
          rows={visible}
          total={rows.length}
          replyCount={counts.reply}
          selectedId={selected?.person.id ?? null}
          onSelect={setSelectedId}
          tags={tags}
          onCreated={setSelectedId}
        />
        {selected ? (
          <>
            <ConversationPane row={selected} account={account} />
            <DetailsPanel key={selected.person.id} row={selected} tags={tags} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Nothing here. Change the filter, or add a person.
          </div>
        )}
      </div>
    </div>
  );
}
