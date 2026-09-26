"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import type { Account, Person, StageDef, Tag } from "@/lib/types";
import { markDone } from "@/lib/actions";
import type { Template } from "@/lib/templates";
import { nextStep, type StatusKind } from "@/lib/next-step";
import {
  groupRows,
  inView,
  matchesConditions,
  needsYou,
  type Condition,
  type Row,
  type View,
} from "@/lib/rows";
import { usePersistentFlag } from "@/hooks/use-persistent-flag";
import { InboxSidebar, type SidebarCounts } from "./sidebar";
import { InboxHeader, PeopleList } from "./people-list";
import { ConversationPane } from "./conversation-pane";
import { DetailsPanel } from "./details-panel";
import { MessageAllDialog } from "@/components/templates/message-all-dialog";

/** Below this width, opening the details closes the sidebar so the conversation keeps room. */
const ROOMY_WIDTH = 1440;

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function viewTitle(view: View, tags: Tag[], stages: StageDef[]): string {
  switch (view.kind) {
    case "now":
      return "Now";
    case "waiting":
      return "Waiting";
    case "starred":
      return "Starred";
    case "tag":
      return tags.find((t) => t.id === view.id)?.label ?? "Tag";
    case "stage":
      return stages.find((s) => s.key === view.key)?.label ?? "Stage";
    default:
      return "All";
  }
}

export function InboxView({
  people,
  tags,
  stages,
  templates,
  account,
  initialPersonId,
}: {
  people: Person[];
  tags: Tag[];
  stages: StageDef[];
  templates: Template[];
  account: Account;
  initialPersonId: string | null;
}) {
  // A deep link may point at someone outside Now, so open on All then.
  const [view, setView] = useState<View>(initialPersonId ? { kind: "all" } : { kind: "now" });
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialPersonId);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [messageAll, setMessageAll] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = usePersistentFlag("aili.inbox.sidebar", true);
  const [detailsOpen, setDetailsOpen] = usePersistentFlag("aili.inbox.details", false);
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

  // Sidebar counts are for everyone, whatever the search or filter.
  const counts = useMemo<SidebarCounts>(() => {
    const c: SidebarCounts = { now: 0, waiting: 0, all: rows.length, starred: 0, tags: {}, stages: {} };
    for (const r of rows) {
      if (needsYou(r.step.kind)) c.now += 1;
      if (r.step.kind === "waiting") c.waiting += 1;
      if (r.person.starred) c.starred += 1;
      for (const t of r.person.tagIds) c.tags[t] = (c.tags[t] ?? 0) + 1;
      c.stages[r.person.stage] = (c.stages[r.person.stage] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  // Search and filter narrow whichever view is open.
  const narrowed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesConditions(r, conditions)) return false;
      if (q && !`${r.person.name} ${r.person.jobTitle} ${r.person.company} ${r.person.headline}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, conditions, query]);

  const groups = useMemo(() => groupRows(narrowed.filter((r) => inView(r, view)), view), [narrowed, view]);
  const inViewRows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  // Rows you can see and move through with J and K: folded groups are skipped.
  const flat = useMemo(
    () => groups.flatMap((g) => (g.band && collapsed.has(g.kind) ? [] : g.rows)),
    [groups, collapsed],
  );

  // Stay on the chosen person while they are in this view; otherwise fall to the first visible row.
  const selected = inViewRows.find((r) => r.person.id === selectedId) ?? flat[0] ?? null;

  function pickView(next: View) {
    setView(next);
    setCollapsed(new Set());
  }

  function toggleGroup(kind: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  function toggleDetails() {
    const opening = !detailsOpen;
    setDetailsOpen(opening);
    if (opening && sidebarOpen && window.innerWidth < ROOMY_WIDTH) setSidebarOpen(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Esc closes the details panel, unless a menu or dialog is using it.
      if (e.key === "Escape" && detailsOpen && !typing(e.target) && !document.querySelector("[role=dialog],[role=menu]")) {
        setDetailsOpen(false);
        return;
      }
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
      } else if (key === "e" && selected && needsYou(selected.step.kind)) {
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
  }, [flat, selected, detailsOpen, setDetailsOpen]);

  return (
    <div className="flex h-full w-full">
      <div className="flex shrink-0 flex-col border-r">
        <InboxHeader
          viewName={viewTitle(view, tags, stages)}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          query={query}
          onQuery={setQuery}
          conditions={conditions}
          onConditions={setConditions}
          statusCounts={statusCounts}
          tags={tags}
          stages={stages}
          onCreated={(id) => {
            pickView({ kind: "all" });
            setSelectedId(id);
          }}
        />
        <div className="flex min-h-0 flex-1">
          {sidebarOpen && (
            <InboxSidebar
              view={view}
              onView={pickView}
              counts={counts}
              tags={tags}
              stages={stages}
              account={account}
              people={people}
            />
          )}
          <PeopleList
            view={view}
            groups={groups}
            collapsed={collapsed}
            onToggleGroup={toggleGroup}
            total={rows.length}
            selectedId={selected?.person.id ?? null}
            onSelect={setSelectedId}
            query={query}
            conditions={conditions}
            helper={account.helper}
            onMessageAll={view.kind === "tag" || view.kind === "stage" ? () => setMessageAll(true) : undefined}
          />
        </div>
      </div>
      <MessageAllDialog
        open={messageAll}
        onOpenChange={setMessageAll}
        groupName={viewTitle(view, tags, stages)}
        people={inViewRows.map((r) => r.person)}
        templates={templates}
        account={account}
      />
      {selected ? (
        <>
          <ConversationPane
            key={selected.person.id}
            row={selected}
            account={account}
            tags={tags}
            stages={stages}
            templates={templates}
            snoozeOpen={snoozeOpen}
            onSnoozeOpenChange={setSnoozeOpen}
            detailsOpen={detailsOpen}
            onToggleDetails={toggleDetails}
          />
          {detailsOpen && (
            <DetailsPanel
              key={`d-${selected.person.id}`}
              row={selected}
              tags={tags}
              stages={stages}
              onClose={() => setDetailsOpen(false)}
            />
          )}
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {view.kind === "now" ? "Nothing needs you right now." : "Pick someone from the list."}
        </div>
      )}
    </div>
  );
}
