"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import type { Account, Person, Tag } from "@/lib/types";
import { markDone } from "@/lib/actions";
import { nextStep, type StatusKind } from "@/lib/next-step";
import { groupRows, inTab, matchesConditions, type Condition, type Row, type Tab } from "@/lib/rows";
import { PeopleList } from "./people-list";
import { ConversationPane } from "./conversation-pane";
import { DetailsPanel } from "./details-panel";

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

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
  // A deep link may point at someone outside Needs you, so open on All then.
  const [tab, setTab] = useState<Tab>(initialPersonId ? "all" : "needs");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialPersonId);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [, start] = useTransition();

  const rows = useMemo<Row[]>(() => {
    const now = new Date();
    return people.map((person) => ({ person, step: nextStep(person, now) }));
  }, [people]);

  const statusCounts = useMemo(() => {
    const c: Record<StatusKind, number> = { reply: 0, chase: 0, quiet: 0, waiting: 0, stale: 0 };
    for (const r of rows) c[r.step.kind] += 1;
    return c;
  }, [rows]);

  // Search and filter narrow every tab; the tab counts follow them.
  const narrowed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesConditions(r, conditions)) return false;
      if (q && !`${r.person.name} ${r.person.company} ${r.person.headline}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, conditions, query]);

  const tabCounts = useMemo<Record<Tab, number>>(
    () => ({
      needs: narrowed.filter((r) => inTab(r, "needs")).length,
      waiting: narrowed.filter((r) => inTab(r, "waiting")).length,
      all: narrowed.length,
    }),
    [narrowed],
  );

  const groups = useMemo(() => groupRows(narrowed.filter((r) => inTab(r, tab)), tab), [narrowed, tab]);
  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  // Stay on the chosen person while they are in view; otherwise fall to the first row.
  const selected = flat.find((r) => r.person.id === selectedId) ?? flat[0] ?? null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "j" || key === "k") {
        if (!flat.length) return;
        const i = Math.max(0, flat.findIndex((r) => r.person.id === selected?.person.id));
        const next = flat[Math.min(flat.length - 1, Math.max(0, i + (key === "j" ? 1 : -1)))];
        setSelectedId(next.person.id);
        e.preventDefault();
      } else if (key === "r" && selected) {
        document.getElementById("reply")?.focus();
        e.preventDefault();
      } else if (key === "e" && selected && selected.step.kind !== "waiting" && selected.step.kind !== "stale") {
        const name = selected.person.name.split(" ")[0];
        start(async () => {
          try {
            await markDone(selected.person.id);
            toast.success(`${name} marked done.`);
          } catch {
            toast.error("That did not save.");
          }
        });
        e.preventDefault();
      } else if (key === "s" && selected) {
        setSnoozeOpen(true);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, selected]);

  return (
    <div className="flex h-full w-full">
      <PeopleList
        groups={groups}
        tab={tab}
        onTab={setTab}
        tabCounts={tabCounts}
        total={rows.length}
        selectedId={selected?.person.id ?? null}
        onSelect={setSelectedId}
        query={query}
        onQuery={setQuery}
        conditions={conditions}
        onConditions={setConditions}
        statusCounts={statusCounts}
        tags={tags}
        onCreated={(id) => {
          setTab("all");
          setSelectedId(id);
        }}
        helper={account.helper}
      />
      {selected ? (
        <>
          <ConversationPane
            key={selected.person.id}
            row={selected}
            account={account}
            snoozeOpen={snoozeOpen}
            onSnoozeOpenChange={setSnoozeOpen}
          />
          <DetailsPanel key={`d-${selected.person.id}`} row={selected} tags={tags} />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {tab === "needs" ? "Nothing needs you right now." : "Nothing here. Change the tab, or add a person."}
        </div>
      )}
    </div>
  );
}
