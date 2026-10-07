"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Bell, Building2, CalendarDays, Undo2, ChevronDown, ChevronRight, MessageSquare, MoveRight, Plus, Send, Tag as TagIcon, Upload, User, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { bulkAddTag, bulkArchive, bulkSetStage, moveToOther, withdrawInvites } from "@/lib/client-actions";
import { companyStandIns, groupByCompany, type CompanyRule } from "@/lib/companies";
import { buildFunnel, notMessaged, type Funnel } from "@/lib/funnel";
import { CONNECTION_CHOICES, connectionOf, waitingDays, type ConnectionState, type InviteFacts } from "@/lib/invites";
import { lastTouch, leadNext } from "@/lib/lead-next";
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
import { ConnectionDot, PersonAvatar } from "@/components/person-avatar";
import { WarmthChip } from "@/components/warmth-chip";
import { WarmupWeek } from "./warmup-week";
import { warmthMove, warmthOf, warmupLine } from "@/lib/warmth";
import { MessageAllDialog } from "@/components/templates/message-all-dialog";
import { ImportDialog } from "./import-dialog";
import { CompanyNameDialog, CompanyPanel, CompanyTable, GuessBar } from "./company-view";
import { PersonDialog } from "./person-dialog";
import { RequestsStrip } from "./requests-strip";
import { PostAlertsPanel, usePostAlerts } from "./post-alerts";

const ALL = "all";

type View = "people" | "companies" | "week";

/** What the table shows: everyone, one step of the funnel, or the connected who have no message yet. */
type Pick = { kind: "stage"; key: string } | { kind: "notMessaged" } | null;

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
  return raw === "companies" || raw === "week" ? raw : "people";
}

/** The early stages the ring on the photo already shows. Past them, the stage shows by the name. */
const RING_STAGES = new Set(["warming", "requested", "connected"]);

/**
 * The funnel in one line: how many are at each step right now. Click a step
 * to see just those people; click the first to see everyone again.
 */
function FunnelLine({
  funnel,
  unit,
  pick,
  onPick,
}: {
  funnel: Funnel;
  unit: string;
  pick: Pick;
  onPick: (pick: Pick) => void;
}) {
  const chip = (on: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
      on && "bg-foreground text-background hover:bg-foreground hover:text-background",
    );
  return (
    <nav aria-label="Your funnel" className="flex flex-wrap items-center gap-x-1 gap-y-1.5 border-b px-5 py-3">
      <button type="button" aria-pressed={pick === null} onClick={() => onPick(null)} className={chip(pick === null)}>
        <b className="text-md font-semibold tabular-nums">{funnel.total}</b>
        {unit}
      </button>
      {funnel.steps.map((step) => {
        const on = pick?.kind === "stage" && pick.key === step.key;
        return (
          <span key={step.key} className="flex items-center gap-1">
            <span aria-hidden="true" className="text-border">
              →
            </span>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onPick(on ? null : { kind: "stage", key: step.key })}
              className={chip(on)}
            >
              <b className={cn("text-md font-semibold tabular-nums", !on && "text-foreground")}>{step.here}</b>
              {step.label.toLowerCase()}
            </button>
          </span>
        );
      })}
      {funnel.lost > 0 && (
        <button
          type="button"
          aria-pressed={pick?.kind === "stage" && pick.key === "lost"}
          onClick={() => onPick({ kind: "stage", key: "lost" })}
          className={cn(chip(pick?.kind === "stage" && pick.key === "lost"), "ml-3")}
        >
          <b className="text-md font-semibold tabular-nums">{funnel.lost}</b>
          not a fit
        </button>
      )}
    </nav>
  );
}

export function PeopleView({
  people,
  tags,
  stages,
  templates,
  account,
  companyRules = [],
  inviteFacts = [],
  timeZone = "Australia/Sydney",
  openAlerts = false,
}: {
  people: Person[];
  tags: Tag[];
  stages: StageDef[];
  templates: Template[];
  account: Account;
  /** Company names the user renamed, put together or kept apart. */
  companyRules?: CompanyRule[];
  /** Connection requests, for the stats under Request sent. */
  inviteFacts?: InviteFacts[];
  /** The account's time zone, for the post alerts day. */
  timeZone?: string;
  /** Opened from the morning reminder: show Post alerts straight away. */
  openAlerts?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState(ALL);
  const [conn, setConn] = useState<ConnectionState | typeof ALL>(ALL);
  const [pick, setPick] = useState<Pick>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<{ company: string } | null>(null);
  const view = useView();
  const [openCompany, setOpenCompany] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(openAlerts);
  const alertsToday = usePostAlerts(people, account.alerts.perDay, timeZone).next.length;
  const [importing, setImporting] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pending, start] = useTransition();
  const search = useHeaderSearch(query);
  // The tag narrows the whole page: funnel and table.
  const scope = useMemo(() => people.filter((p) => tagId === ALL || p.tagIds.includes(tagId)), [people, tagId]);

  const companies = useMemo(() => groupByCompany(scope, stages, companyRules), [scope, stages, companyRules]);
  const byCompany = view === "companies";
  // By company, each company counts once, as its furthest person.
  const funnel = useMemo(
    () => buildFunnel(byCompany ? companyStandIns(companies) : scope, stages),
    [byCompany, companies, scope, stages],
  );

  const companyRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((g) => {
      if (conn !== ALL && !g.people.some((p) => connectionOf(p) === conn)) return false;
      if (pick?.kind === "stage" && g.stage !== pick.key) return false;
      if (pick?.kind === "notMessaged" && !g.people.some(notMessaged)) return false;
      if (q && !`${g.name} ${g.people.map((p) => `${p.name} ${p.jobTitle} ${p.company} ${p.headline}`).join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [companies, pick, query, conn]);
  const guessed = companyRows.filter((g) => g.guessed).slice(0, 3);
  const opened = openCompany === null ? null : (companies.find((g) => g.key === openCompany) ?? null);
  const renamed = renaming === null ? null : (companies.find((g) => g.key === renaming) ?? null);
  const companyNames = useMemo(() => companies.filter((g) => g.key).map((g) => g.name), [companies]);

  // How many are in each connection state, for the Connection menu.
  const connCounts = useMemo(() => {
    const counts: Record<string, number> = { not: 0, pending: 0, connected: 0 };
    for (const p of scope) counts[connectionOf(p)]++;
    return counts;
  }, [scope]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = scope.filter((p) => {
      if (conn !== ALL && connectionOf(p) !== conn) return false;
      if (pick?.kind === "stage" && p.stage !== pick.key) return false;
      if (pick?.kind === "notMessaged" && !notMessaged(p)) return false;
      if (q && !`${p.name} ${p.jobTitle} ${p.company} ${p.headline}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const time = (iso: string | undefined) => (iso ? new Date(iso).getTime() : 0);
    return list.sort((a, b) => time(lastTouch(b).at) - time(lastTouch(a).at));
  }, [scope, pick, query, conn]);

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
  const staleDays = account.invites.staleDays;
  const needed = account.alerts.touchesToConnect;
  const isStale = (p: Person) => p.invite?.status === "sent" && waitingDays(p.invite.sentAt, now) > staleDays;
  const withdrawable = chosenPeople.filter((p) => ["queued", "sending", "sent", "failed"].includes(p.invite?.status ?? ""));
  const showRequests = !byCompany && pick?.kind === "stage" && pick.key === "requested";

  function switchView(next: View) {
    writeView(next);
    setSelected(new Set());
    setConfirmArchive(false);
  }
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
            <Button
              variant="outline"
              size="sm"
              className={cn("ml-1", alertsToday > 0 && "border-amber-200 bg-amber-50 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40")}
              onClick={() => setAlertsOpen(true)}
            >
              <Bell />
              Post alerts{alertsToday > 0 ? ` · ${alertsToday} today` : ""}
            </Button>
            <Button variant="outline" size="sm" className="mx-1" onClick={() => setImporting(true)}>
              <Upload />
              Import
            </Button>
            <HeaderAction icon={Plus} label="Add person" onClick={() => setAdding({ company: "" })} />
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <FunnelLine funnel={funnel} unit={byCompany ? "companies" : "leads"} pick={pick} onPick={choose} />

        <div className="flex items-center gap-2 px-6 pt-4 pb-2">
          <h2 className="text-md font-semibold">{title ? (pick?.kind === "stage" ? `In ${title} now` : title) : "Everyone"}</h2>
          <CountBadge count={byCompany ? companyRows.length : rows.length} variant="outline" className="text-muted-foreground" />
          <div role="group" aria-label="Show" className="ml-1 flex rounded-lg bg-muted p-0.5">
            {(
              [
                ["people", "People", User],
                ["companies", "Companies", Building2],
                ["week", "This week", CalendarDays],
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
          <div className="ml-auto flex items-center gap-1">
            <Select value={conn} onValueChange={(v) => setConn(v as ConnectionState | typeof ALL)}>
              <SelectTrigger
                size="sm"
                aria-label="Connection"
                className={cn(
                  "min-w-40",
                  conn !== ALL && "border-foreground bg-foreground text-background dark:bg-foreground [&_svg]:text-background",
                )}
              >
                <SelectValue>
                  {conn === ALL ? (
                    "All connections"
                  ) : (
                    <>
                      <ConnectionDot state={conn} />
                      {CONNECTION_CHOICES.find((c) => c.key === conn)?.label} · {rows.length}
                    </>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={ALL}>
                  All connections
                  <span className="ml-auto pl-3 text-muted-foreground tabular-nums">{scope.length}</span>
                </SelectItem>
                {CONNECTION_CHOICES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    <ConnectionDot state={c.key} />
                    {c.label}
                    <span className="ml-auto pl-3 text-muted-foreground tabular-nums">{connCounts[c.key]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {conn !== ALL && (
              <Button variant="ghost" size="icon-sm" aria-label="Show all connections" onClick={() => setConn(ALL)}>
                <X />
              </Button>
            )}
          </div>
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
        </div>

        {showRequests && (
          <RequestsStrip
            invites={inviteFacts}
            staleDays={staleDays}
            week={account.invites.week}
            onPickStale={() => setSelected(new Set(rows.filter(isStale).map((p) => p.id)))}
          />
        )}

        {byCompany && (
          <>
            {guessed.map((g) => (
              <GuessBar key={g.key} group={g} onRename={() => setRenaming(g.key)} />
            ))}
            <CompanyTable groups={companyRows} stages={stages} staleDays={staleDays} onOpen={setOpenCompany} />
            {companyRows.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {people.length === 0 ? "No one yet. Import a list or add your first person." : "No companies here."}
              </div>
            )}
          </>
        )}

        {view === "week" && <WarmupWeek people={scope} needed={needed} />}

        {view === "people" && (
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
              <TableHead className="pl-4">Person</TableHead>
              <TableHead>Warmth</TableHead>
              <TableHead>Next</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="pr-6">Last touch</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => {
              const on = selected.has(p.id);
              const move = warmthMove(p, needed, now);
              const usual = leadNext(p, staleDays, now);
              const next = move && p.stage !== "lost" ? { text: move.short, due: move.due } : usual;
              const line = warmupLine(p);
              return (
                <TableRow
                  key={p.id}
                  data-state={on ? "selected" : undefined}
                  className="group cursor-pointer"
                  onClick={() => router.push(`/inbox?person=${p.id}`)}
                >
                  <TableCell className="pl-6" onClick={(e) => e.stopPropagation()}>
                    <Checkbox aria-label={`Select ${p.name}`} checked={on} onCheckedChange={(v) => toggle(p.id, v === true)} />
                  </TableCell>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <PersonAvatar person={p} className="size-8" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-md font-semibold">{p.name}</span>
                          {!RING_STAGES.has(p.stage) && (
                            <span className="rounded-md bg-muted px-1.5 py-px text-xs font-medium text-muted-foreground">
                              {stageLabel(stages, p.stage)}
                            </span>
                          )}
                        </div>
                        <div className="max-w-72 truncate text-xs text-muted-foreground">
                          {[p.jobTitle || p.headline, p.company].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <WarmthChip warmth={warmthOf(p)} />
                      {line && <span className="text-xs whitespace-nowrap text-muted-foreground">{line}</span>}
                    </div>
                  </TableCell>
                  <TableCell
                    title={move?.long}
                    className={cn("text-md", next?.due ? "font-semibold text-amber-700 dark:text-amber-400" : "text-foreground/80")}
                    suppressHydrationWarning
                  >
                    {next?.text}
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
                  <TableCell className="pr-6 text-xs text-muted-foreground" suppressHydrationWarning>
                    {lastTouch(p).text}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        )}
        {view === "people" && rows.length === 0 && (
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
          {withdrawable.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="hover:bg-primary-foreground/10 hover:text-primary-foreground"
              disabled={pending}
              onClick={() =>
                bulk(
                  () => withdrawInvites(withdrawable.map((p) => p.id)),
                  (n) => `Withdrawing ${n === 1 ? "1 request" : `${n} requests`}. The helper does it on LinkedIn in the next minute or so.`,
                )
              }
            >
              <Undo2 />
              Withdraw {withdrawable.length === 1 ? "request" : `${withdrawable.length} requests`}
            </Button>
          )}
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
      <PostAlertsPanel
        open={alertsOpen}
        onOpenChange={setAlertsOpen}
        people={people}
        perDay={account.alerts.perDay}
        timeZone={timeZone}
      />
      <CompanyPanel
        group={opened}
        staleDays={staleDays}
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
