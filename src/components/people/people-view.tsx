"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowDown, Building2, ChevronDown, ChevronRight, MessageSquare, MoveRight, Plus, Send, Tag as TagIcon, Upload, User, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { bulkAddTag, bulkArchive, bulkSetStage, moveToOther } from "@/lib/client-actions";
import { companyStandIns, groupByCompany, type CompanyRule } from "@/lib/companies";
import { buildFunnel, notMessaged } from "@/lib/funnel";
import { daysBetween, relativeTime } from "@/lib/next-step";
import type { Template } from "@/lib/templates";
import { stageLabel, type Account, type Person, type StageDef, type Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HeaderAction, HeaderSearch, PageHeader, useHeaderSearch } from "@/components/page-header";
import { CountBadge } from "@/components/count-badge";
import { TagChip, TagDot } from "@/components/tag-chip";
import { PersonAvatar } from "@/components/inbox/people-list";
import { MessageAllDialog } from "@/components/templates/message-all-dialog";
import { FunnelRow, type Pick } from "./funnel";
import { ImportDialog } from "./import-dialog";
import { CompanyNameDialog, CompanyPanel, CompanyTable, GuessBar } from "./company-view";
import { PersonDialog } from "./person-dialog";

const ALL = "all";
const RANGES = [
  { value: ALL, label: "All time" },
  { value: "7", label: "Added in the last 7 days" },
  { value: "30", label: "Added in the last 30 days" },
  { value: "90", label: "Added in the last 90 days" },
];

type Sort = "recent" | "inStage";
type View = "people" | "companies";

/* People or Companies: remembered on this computer. */
const VIEW_KEY = "aili-leads-view";
const viewListeners = new Set<() => void>();

function readView(): string {
  try {
    return localStorage.getItem(VIEW_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {}
  viewListeners.forEach((l) => l());
}

function useView(): View {
  const raw = useSyncExternalStore(
    (l) => {
      viewListeners.add(l);
      return () => viewListeners.delete(l);
    },
    readView,
    () => "",
  );
  return raw === "companies" ? "companies" : "people";
}

const ago = (iso: string) => {
  const t = relativeTime(iso);
  return t === "now" ? "just now" : `${t} ago`;
};

/** The latest thing that happened with this person, and when. */
function lastTouch(p: Person): { text: string; at: string | undefined } {
  const pending = p.pending[p.pending.length - 1];
  if (pending) return { text: "Message queued", at: pending.createdAt };
  const last = p.messages[p.messages.length - 1];
  if (last) return { text: `${last.direction === "out" ? "You wrote" : "They wrote"} ${ago(last.sentAt)}`, at: last.sentAt };
  if (p.connectedAt) return { text: `Accepted ${ago(p.connectedAt)}`, at: p.connectedAt };
  if (p.requestedAt) return { text: `Request sent ${ago(p.requestedAt)}`, at: p.requestedAt };
  return { text: p.createdAt ? `Added ${ago(p.createdAt)}` : "", at: p.createdAt };
}

/** When they moved to their stage. Older records have no date, so the nearest one stands in. */
const stageSince = (p: Person) =>
  p.stageChangedAt ??
  (p.stage === "requested" ? p.requestedAt : p.stage === "warming" ? undefined : p.connectedAt) ??
  p.createdAt;

function SortHead({ label, on, onClick, className }: { label: string; on: boolean; onClick: () => void; className?: string }) {
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={onClick}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", on && "text-foreground")}
      >
        {label}
        {on && <ArrowDown className="size-3" />}
      </button>
    </TableHead>
  );
}

export function PeopleView({
  people,
  tags,
  stages,
  templates,
  account,
  companyRules = [],
}: {
  people: Person[];
  tags: Tag[];
  stages: StageDef[];
  templates: Template[];
  account: Account;
  /** Company names the user renamed, put together or kept apart. */
  companyRules?: CompanyRule[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState(ALL);
  const [range, setRange] = useState(ALL);
  const [pick, setPick] = useState<Pick>(null);
  const [sort, setSort] = useState<Sort>("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<{ company: string } | null>(null);
  const view = useView();
  const [openCompany, setOpenCompany] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pending, start] = useTransition();
  const search = useHeaderSearch(query);
  const [openedAt] = useState(() => Date.now());

  // The tag and date range narrow the whole page: funnel and table.
  const scope = useMemo(() => {
    const since = range === ALL ? 0 : openedAt - Number(range) * 24 * 60 * 60 * 1000;
    return people.filter(
      (p) =>
        (tagId === ALL || p.tagIds.includes(tagId)) &&
        (!since || (p.createdAt ? new Date(p.createdAt).getTime() >= since : true)),
    );
  }, [people, tagId, range, openedAt]);

  const companies = useMemo(() => groupByCompany(scope, stages, companyRules), [scope, stages, companyRules]);
  const byCompany = view === "companies";
  // By company, each company counts once, as its furthest person.
  const funnel = useMemo(
    () => buildFunnel(byCompany ? companyStandIns(companies) : scope, stages),
    [byCompany, companies, scope, stages],
  );
  const unmessaged = useMemo(
    () => (byCompany ? companies.filter((g) => g.people.some(notMessaged)).length : scope.filter(notMessaged).length),
    [byCompany, companies, scope],
  );

  const companyRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((g) => {
      if (pick?.kind === "stage" && g.stage !== pick.key) return false;
      if (pick?.kind === "notMessaged" && !g.people.some(notMessaged)) return false;
      if (q && !`${g.name} ${g.people.map((p) => `${p.name} ${p.jobTitle} ${p.company} ${p.headline}`).join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [companies, pick, query]);
  const guessed = companyRows.filter((g) => g.guessed).slice(0, 3);
  const opened = openCompany === null ? null : (companies.find((g) => g.key === openCompany) ?? null);
  const renamed = renaming === null ? null : (companies.find((g) => g.key === renaming) ?? null);
  const companyNames = useMemo(() => companies.filter((g) => g.key).map((g) => g.name), [companies]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = scope.filter((p) => {
      if (pick?.kind === "stage" && p.stage !== pick.key) return false;
      if (pick?.kind === "notMessaged" && !notMessaged(p)) return false;
      if (q && !`${p.name} ${p.jobTitle} ${p.company} ${p.headline}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const time = (iso: string | undefined) => (iso ? new Date(iso).getTime() : 0);
    return list.sort((a, b) =>
      sort === "inStage"
        ? time(stageSince(a)) - time(stageSince(b))
        : time(lastTouch(b).at) - time(lastTouch(a).at),
    );
  }, [scope, pick, query, sort]);

  const shownIds = rows.map((p) => p.id);
  const chosen = shownIds.filter((id) => selected.has(id));
  const chosenPeople = rows.filter((p) => selected.has(p.id));
  const allOn = rows.length > 0 && chosen.length === rows.length;

  const title =
    pick?.kind === "notMessaged"
      ? "Connected, not messaged yet"
      : pick?.kind === "stage"
        ? stageLabel(stages, pick.key)
        : null;

  function choose(next: Pick) {
    setPick(next);
    setSelected(new Set());
  }

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function bulk(run: () => Promise<number>, done: (n: number) => string) {
    start(async () => {
      try {
        const n = await run();
        toast.success(done(n));
        setSelected(new Set());
        setConfirmArchive(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not save.");
      }
    });
  }

  const people1 = (n: number) => (n === 1 ? "1 person" : `${n} people`);
  const unitOf = (n: number) => (byCompany ? (n === 1 ? "company" : "companies") : n === 1 ? "person" : "people");

  function switchView(next: View) {
    writeView(next);
    setSelected(new Set());
    setConfirmArchive(false);
  }
  const weakest = funnel.weakest;
  const now = new Date();

  return (
    <div className="relative flex h-full w-full flex-col">
      <PageHeader
        title="Leads"
        after={
          title ? (
            <span className="flex min-w-0 items-center gap-1 pt-1 text-sm text-muted-foreground">
              <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate font-medium">{title}</span>
            </span>
          ) : undefined
        }
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
            <Button variant="outline" size="sm" className="mx-1" onClick={() => setImporting(true)}>
              <Upload />
              Import
            </Button>
            <HeaderAction icon={Plus} label="Add person" onClick={() => setAdding({ company: "" })} />
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <section aria-label="Your funnel" className="border-b px-6 pt-5 pb-4">
          <div className="mb-3.5 flex flex-wrap items-center gap-2">
            <h2 className="text-md font-semibold">Your funnel</h2>
            <span className="text-xs text-muted-foreground">
              {byCompany ? "Companies that reached each step, at their furthest person" : "Everyone who reached each step"}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Select value={tagId} onValueChange={setTagId}>
                <SelectTrigger size="sm" aria-label="Tag" className="min-w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value={ALL}>All tags</SelectItem>
                  {tags.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <TagDot color={t.color} />
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger size="sm" aria-label="When added">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <FunnelRow funnel={funnel} pick={pick} onPick={choose} />

          {weakest && (
            <div className="mt-3.5 flex items-center gap-3 rounded-lg bg-muted/70 px-3.5 py-2.5 text-md">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-amber-500" />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">
                  Biggest drop: {weakest.from.label} to {weakest.to.label}.
                </span>{" "}
                {weakest.stuck} of {weakest.from.reached} {byCompany ? unitOf(weakest.from.reached) + " " : ""}
                {weakest.stuck === 1 ? "has" : "have"} not moved on
                {weakest.from.key === "connected" && unmessaged > 0
                  ? `, and ${unmessaged} of them ${byCompany ? "have someone who has" : "have"} not had a message from you yet.`
                  : "."}
              </span>
              {weakest.from.key === "connected" && unmessaged > 0 ? (
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => choose({ kind: "notMessaged" })}>
                  Show the {unmessaged}
                </Button>
              ) : (
                weakest.from.here > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => choose({ kind: "stage", key: weakest.from.key })}
                  >
                    Show the {weakest.from.here}
                  </Button>
                )
              )}
            </div>
          )}
        </section>

        <div className="flex items-center gap-2 px-6 pt-4 pb-2">
          <h2 className="text-md font-semibold">{title ? (pick?.kind === "stage" ? `In ${title} now` : title) : "Everyone"}</h2>
          <CountBadge count={byCompany ? companyRows.length : rows.length} variant="outline" className="text-muted-foreground" />
          <div role="group" aria-label="Show" className="ml-1 flex rounded-lg bg-muted p-0.5">
            {(
              [
                ["people", "People", User],
                ["companies", "Companies", Building2],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => switchView(key)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
                  view === key && "bg-background font-semibold text-foreground shadow-sm",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          {pick && (
            <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => choose(null)}>
              <X />
              Show everyone
            </Button>
          )}
        </div>

        {byCompany && (
          <>
            {guessed.map((g) => (
              <GuessBar key={g.key} group={g} onRename={() => setRenaming(g.key)} />
            ))}
            <CompanyTable
              groups={companyRows}
              stages={stages}
              tags={tags}
              onOpen={setOpenCompany}
              onAddPerson={(company) => setAdding({ company })}
            />
            {companyRows.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {people.length === 0 ? "No one yet. Import a list or add your first person." : "No companies here."}
              </div>
            )}
          </>
        )}

        {!byCompany && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-6">
                <Checkbox
                  aria-label="Select everyone shown"
                  checked={allOn}
                  onCheckedChange={(on) => setSelected(on ? new Set(shownIds) : new Set())}
                />
              </TableHead>
              <TableHead>Person</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Tags</TableHead>
              <SortHead label="Last touch" on={sort === "recent"} onClick={() => setSort("recent")} />
              <TableHead className="text-right">Sent / got</TableHead>
              <SortHead
                label="In stage"
                on={sort === "inStage"}
                onClick={() => setSort("inStage")}
                className="pr-6 text-right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => {
              const on = selected.has(p.id);
              const sent = p.messages.filter((m) => m.direction === "out").length;
              const got = p.messages.length - sent;
              const since = stageSince(p);
              const days = since ? daysBetween(new Date(since), now) : null;
              return (
                <TableRow
                  key={p.id}
                  data-state={on ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => router.push(`/inbox?person=${p.id}`)}
                >
                  <TableCell className="pl-6" onClick={(e) => e.stopPropagation()}>
                    <Checkbox aria-label={`Select ${p.name}`} checked={on} onCheckedChange={(v) => toggle(p.id, v === true)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <PersonAvatar person={p} className="size-8" />
                      <div className="min-w-0">
                        <div className="text-md font-semibold">{p.name}</div>
                        <div className="max-w-72 truncate text-xs text-muted-foreground">
                          {[p.jobTitle || p.headline, p.company].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="rounded-md bg-foreground/[0.06] px-2 py-0.5 text-xs font-medium">{stageLabel(stages, p.stage)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {tags
                        .filter((t) => p.tagIds.includes(t.id))
                        .map((t) => (
                          <TagChip key={t.id} tag={t} />
                        ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {lastTouch(p).text}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                    {sent} / {got}
                  </TableCell>
                  <TableCell className="pr-6 text-right text-xs text-muted-foreground tabular-nums" suppressHydrationWarning>
                    {days === null ? "" : days === 0 ? "today" : `${days}d`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        )}
        {!byCompany && rows.length === 0 && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {people.length === 0 ? "No one yet. Import a list or add your first person." : "No one here."}
          </div>
        )}
        {/* Room so the last rows clear the selection bar. */}
        {chosen.length > 0 && <div className="h-20" />}
      </div>

      {chosen.length > 0 && (
        <div
          role="toolbar"
          aria-label="Selected people"
          className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-primary py-1.5 pr-1.5 pl-4 text-md whitespace-nowrap text-primary-foreground shadow-lg"
        >
          <span className="mr-2 font-semibold">{chosen.length} selected</span>
          <Button size="sm" variant="secondary" onClick={() => setMessaging(true)}>
            <Send />
            Message all
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="hover:bg-primary-foreground/10 hover:text-primary-foreground" disabled={!tags.length || pending}>
                <TagIcon />
                Add tag
                <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              {tags.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onSelect={() => bulk(() => bulkAddTag(chosen, t.id), (n) => `${t.label} added to ${people1(n)}.`)}
                >
                  <TagDot color={t.color} />
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="hover:bg-primary-foreground/10 hover:text-primary-foreground" disabled={pending}>
                <MoveRight />
                Move to stage
                <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              {stages.map((s) => (
                <DropdownMenuItem
                  key={s.key}
                  onSelect={() => bulk(() => bulkSetStage(chosen, s.key), (n) => `${people1(n)} moved to ${s.label}.`)}
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="ghost"
            className="hover:bg-primary-foreground/10 hover:text-primary-foreground"
            disabled={pending}
            onClick={() => bulk(() => moveToOther(chosen), (n) => `${people1(n)} moved to Other. Their conversations stay in the Inbox.`)}
          >
            <MessageSquare />
            Not leads
          </Button>
          {confirmArchive ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => bulk(() => bulkArchive(chosen), (n) => `${people1(n)} archived.`)}
            >
              <Archive />
              Archive {chosen.length}?
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="hover:bg-primary-foreground/10 hover:text-primary-foreground"
              onClick={() => setConfirmArchive(true)}
            >
              <Archive />
              Archive
            </Button>
          )}
          <span className="mx-1 h-5 w-px bg-primary-foreground/20" />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Clear selection"
            className="hover:bg-primary-foreground/10 hover:text-primary-foreground"
            onClick={() => {
              setSelected(new Set());
              setConfirmArchive(false);
            }}
          >
            <X />
          </Button>
        </div>
      )}

      <PersonDialog
        key={adding?.company ?? ""}
        open={adding !== null}
        onOpenChange={(open) => !open && setAdding(null)}
        tags={tags}
        stages={stages}
        company={adding?.company}
      />
      <CompanyPanel
        group={opened}
        stages={stages}
        onOpenChange={(open) => !open && setOpenCompany(null)}
        onRename={() => opened && setRenaming(opened.key)}
        onAddPerson={(company) => setAdding({ company })}
      />
      <CompanyNameDialog
        group={renamed}
        others={companyNames.filter((n) => n !== renamed?.name)}
        onOpenChange={(open) => !open && setRenaming(null)}
      />
      <ImportDialog open={importing} onOpenChange={setImporting} stages={stages} tags={tags} />
      <MessageAllDialog
        open={messaging}
        onOpenChange={(open) => {
          setMessaging(open);
        }}
        title={`Message ${people1(chosenPeople.length)}`}
        groupName=""
        people={chosenPeople}
        templates={templates}
        account={account}
      />
    </div>
  );
}
