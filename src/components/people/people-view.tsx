"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Bell, CalendarDays, Check, ChevronDown, MessageSquare, MoreHorizontal, MoveRight, Plus, Send, Tag as TagIcon, Undo2, Upload, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  bulkAddTag,
  bulkArchive,
  bulkSetStage,
  markAccepted,
  markNotConnected,
  markProfilesOpened,
  markRequestSent,
  markWithdrawn,
  moveToOther,
  withdrawInvites,
} from "@/lib/client-actions";
import { groupByCompany, type CompanyGroup, type CompanyRule } from "@/lib/companies";
import { connectionOf, waitingDays, type ConnectionState } from "@/lib/invites";
import { lastTouch } from "@/lib/lead-next";
import { relativeTime } from "@/lib/next-step";
import { openedState } from "@/lib/profile-opens";
import type { Template } from "@/lib/templates";
import { formatWhen, toWallInput } from "@/lib/time-zone";
import { stageLabel, type Account, type Person, type StageDef, type Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LinkedInMark } from "@/components/linkedin-bits";
import { HeaderAction, HeaderSearch, PageHeader, useHeaderSearch } from "@/components/page-header";
import { TagDot } from "@/components/tag-chip";
import { PersonAvatar } from "@/components/person-avatar";
import { noteOpened, OpenedDot, ProfilePaceNote } from "@/components/opened-dot";
import { MessageAllDialog } from "@/components/templates/message-all-dialog";
import { WarmupWeek } from "./warmup-week";
import { ImportDialog } from "./import-dialog";
import { CompanyNameDialog, CompanyPanel, GuessBar } from "./company-view";
import { PersonDialog } from "./person-dialog";
import { PostAlertsPanel, usePostAlerts } from "./post-alerts";

/*
 * Leads: People and Companies, the Apollo way but short. Filters on the left
 * (tags, connection, stage, not opened), one plain table on the right. On a
 * person's row, Connection and Stage are menus: you did it on LinkedIn, AILI
 * notes it. Post alerts and the week's warm-up sit under More.
 */

type View = "people" | "companies" | "week";

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

/** The first stages are the connection itself (the Connection column); Stage is what comes after. */
const CONNECTION_STAGES = new Set(["warming", "requested", "connected"]);
const laterStages = (stages: StageDef[]) => stages.filter((s) => !CONNECTION_STAGES.has(s.key));
/** Back to no stage: the early stage that matches their connection. */
const earlyStageFor = (p: Person) => ({ connected: "connected", pending: "requested", not: "warming" })[connectionOf(p)];

const CONNECTIONS: { key: ConnectionState; label: string }[] = [
  { key: "not", label: "Not connected" },
  { key: "pending", label: "Request sent" },
  { key: "connected", label: "Connected" },
];

/** "26 Oct" where you are. */
function dayMonth(iso: string, timeZone: string): string {
  const s = formatWhen(new Date(iso), timeZone);
  return s.slice(s.indexOf(" ") + 1, s.indexOf(","));
}

const ago = (iso: string | undefined) => {
  if (!iso) return "";
  const t = relativeTime(iso);
  return t === "now" ? "just now" : `${t} ago`;
};

const toggleIn = <T,>(set: Set<T>, v: T) => {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
};

export function PeopleView({
  people,
  tags,
  stages,
  templates,
  account,
  companyRules = [],
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
  /** The account's time zone, for dates and the post alerts day. */
  timeZone?: string;
  /** Opened from the morning reminder: show Post alerts straight away. */
  openAlerts?: boolean;
}) {
  const router = useRouter();
  const view = useView();
  const [query, setQuery] = useState("");
  const [tagIds, setTagIds] = useState<Set<string>>(new Set());
  const [conns, setConns] = useState<Set<ConnectionState>>(new Set());
  const [stageKeys, setStageKeys] = useState<Set<string>>(new Set());
  const [notOpened, setNotOpened] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<{ company: string } | null>(null);
  const [openCompany, setOpenCompany] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(openAlerts);
  const alertsToday = usePostAlerts(people, account.alerts.perDay, timeZone).next.length;
  const [importing, setImporting] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pending, start] = useTransition();
  const search = useHeaderSearch(query);
  const staleDays = account.invites.staleDays;

  const companies = useMemo(() => groupByCompany(people, stages, companyRules), [people, stages, companyRules]);
  const byCompany = view === "companies";

  const q = query.trim().toLowerCase();
  const hasTag = (p: Person) => tagIds.size === 0 || p.tagIds.some((id) => tagIds.has(id));
  const rows = useMemo(() => {
    const list = people.filter((p) => {
      if (tagIds.size && !p.tagIds.some((id) => tagIds.has(id))) return false;
      if (conns.size && !conns.has(connectionOf(p))) return false;
      if (stageKeys.size && !stageKeys.has(p.stage)) return false;
      if (notOpened && openedState(p.profileOpenedAt, timeZone) !== null) return false;
      if (q && !`${p.name} ${p.jobTitle} ${p.company} ${p.headline}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const time = (iso: string | undefined) => (iso ? new Date(iso).getTime() : 0);
    return list.sort((a, b) => time(lastTouch(b).at) - time(lastTouch(a).at));
  }, [people, tagIds, conns, stageKeys, notOpened, timeZone, q]);

  const companyRows = useMemo(
    () =>
      companies.filter((g) => {
        if (tagIds.size && !g.people.some((p) => p.tagIds.some((id) => tagIds.has(id)))) return false;
        if (conns.size && !g.people.some((p) => conns.has(connectionOf(p)))) return false;
        if (stageKeys.size && !stageKeys.has(g.stage)) return false;
        if (q && !`${g.name} ${g.people.map((p) => `${p.name} ${p.jobTitle}`).join(" ")}`.toLowerCase().includes(q)) return false;
        return true;
      }),
    [companies, tagIds, conns, stageKeys, q],
  );
  const guessed = byCompany ? companyRows.filter((g) => g.guessed).slice(0, 3) : [];
  const opened = openCompany === null ? null : (companies.find((g) => g.key === openCompany) ?? null);
  const renamed = renaming === null ? null : (companies.find((g) => g.key === renaming) ?? null);
  const companyNames = useMemo(() => companies.filter((g) => g.key).map((g) => g.name), [companies]);

  const shownIds = rows.map((p) => p.id);
  const chosen = shownIds.filter((id) => selected.has(id));
  const chosenPeople = rows.filter((p) => selected.has(p.id));
  const allOn = rows.length > 0 && chosen.length === rows.length;
  const filtered = tagIds.size + conns.size + stageKeys.size > 0 || notOpened;

  function clearFilters() {
    setTagIds(new Set());
    setConns(new Set());
    setStageKeys(new Set());
    setNotOpened(false);
    setSelected(new Set());
  }

  function switchView(next: View) {
    writeView(next);
    setSelected(new Set());
    setConfirmArchive(false);
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
  const withdrawable = chosenPeople.filter((p) => ["queued", "sending", "sent", "failed"].includes(p.invite?.status ?? ""));
  const now = new Date();
  const today = toWallInput(now, timeZone).slice(0, 10);
  const leadCount = people.length;
  const companyCount = companies.filter((g) => g.key).length;

  const tab = (key: "people" | "companies", label: string, count: number) => (
    <button
      type="button"
      aria-pressed={view === key}
      onClick={() => switchView(key)}
      className={cn(
        "-mb-px flex h-full items-center gap-2 border-b-2 border-transparent px-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
        view === key && "border-foreground font-semibold text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-px text-2xs font-semibold tabular-nums",
          view === key ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );

  return (
    <div className="relative flex h-full w-full flex-col">
      <PageHeader
        title="Leads"
        after={
          <nav aria-label="Show" className="ml-5 flex self-stretch">
            {tab("people", "People", leadCount)}
            {tab("companies", "Companies", companyCount)}
          </nav>
        }
        search={
          search.open ? (
            <HeaderSearch
              value={query}
              onChange={setQuery}
              placeholder={byCompany ? "Search companies" : "Search name, company, role"}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More" className="relative">
                  <MoreHorizontal />
                  {alertsToday > 0 && <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 rounded-full bg-amber-500" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setAlertsOpen(true)}>
                  <Bell />
                  Post alerts{alertsToday > 0 ? ` · ${alertsToday} today` : ""}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => switchView("week")}>
                  <CalendarDays />
                  Warm-up this week
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <HeaderAction icon={Plus} label="Add person" onClick={() => setAdding({ company: "" })} />
          </>
        }
      />

      <div className="flex min-h-0 flex-1">
        {view !== "week" && (
          <FilterPanel
            people={people}
            tags={tags}
            stages={stages}
            byCompany={byCompany}
            tagIds={tagIds}
            conns={conns}
            stageKeys={stageKeys}
            notOpened={notOpened}
            timeZone={timeZone}
            onTag={(id) => setTagIds(toggleIn(tagIds, id))}
            onConn={(c) => setConns(toggleIn(conns, c))}
            onStage={(s) => setStageKeys(toggleIn(stageKeys, s))}
            onNotOpened={() => setNotOpened(!notOpened)}
            onClear={filtered ? clearFilters : undefined}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            {view === "week" && (
              <>
                <div className="flex items-center gap-2 px-6 pt-4">
                  <h2 className="text-md font-semibold">Warm-up this week</h2>
                  <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => switchView("people")}>
                    <X />
                    Back to people
                  </Button>
                </div>
                <WarmupWeek people={people.filter(hasTag)} needed={account.alerts.touchesToConnect} />
              </>
            )}

            {byCompany && (
              <>
                {guessed.map((g) => (
                  <GuessBar key={g.key} group={g} onRename={() => setRenaming(g.key)} />
                ))}
                <CompaniesTable groups={companyRows} stages={stages} tags={tags} onOpen={setOpenCompany} />
                {companyRows.length === 0 && (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    {people.length === 0 ? "No one yet. Import a list or add your first person." : "No companies match."}
                  </div>
                )}
              </>
            )}

            {view === "people" && (
              <Table className="table-fixed">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow className="text-2xs tracking-wider uppercase">
                    <TableHead className="w-12 pl-5">
                      <Checkbox
                        aria-label="Select everyone shown"
                        checked={allOn}
                        onCheckedChange={(on) => setSelected(on ? new Set(shownIds) : new Set())}
                      />
                    </TableHead>
                    <TableHead className="w-[24%]">Name</TableHead>
                    <TableHead className="w-[17%]">Company</TableHead>
                    <TableHead className="w-44">Connection</TableHead>
                    <TableHead className="w-36">Stage</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead className="w-36 pr-5">Last activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => {
                    const on = selected.has(p.id);
                    const myTags = tags.filter((t) => p.tagIds.includes(t.id));
                    return (
                      <TableRow
                        key={p.id}
                        data-state={on ? "selected" : undefined}
                        className="group cursor-pointer"
                        onClick={() => router.push(`/inbox?person=${p.id}`)}
                      >
                        <TableCell className="pl-5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox aria-label={`Select ${p.name}`} checked={on} onCheckedChange={(v) => toggle(p.id, v === true)} />
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <PersonAvatar person={p} className="size-8" />
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span data-private className="truncate text-sm font-semibold">
                                  {p.name}
                                </span>
                                <OpenedDot person={p} timeZone={timeZone} now={now} />
                                {p.linkedinUrl && (
                                  <a
                                    href={p.linkedinUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={`Open ${p.name} on LinkedIn`}
                                    title="Open LinkedIn profile"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      noteOpened(p.id);
                                    }}
                                    className="flex shrink-0 rounded-[3px] opacity-70 transition-opacity hover:opacity-100"
                                  >
                                    <LinkedInMark className="size-3.5 text-[8px]" />
                                  </a>
                                )}
                              </div>
                              <div data-private className="truncate text-xs text-muted-foreground">
                                {p.jobTitle || p.headline}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <CompanyName name={p.company} />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <ConnectionCell person={p} timeZone={timeZone} today={today} staleDays={staleDays} now={now} pending={pending} onAct={bulk} />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <StageCell person={p} stages={stages} pending={pending} onAct={bulk} />
                        </TableCell>
                        <TableCell>
                          <TagsLine tags={myTags} />
                        </TableCell>
                        <TableCell className="pr-5 text-xs text-muted-foreground" suppressHydrationWarning>
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
                {people.length === 0 ? "No one yet. Import a list or add your first person." : "No one matches these filters."}
              </div>
            )}
            {/* Room so the last rows clear the selection bar. */}
            {chosen.length > 0 && <div className="h-20" />}
          </div>

          {view !== "week" && (
            <div className="flex h-11 shrink-0 items-center gap-3 border-t px-5 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {byCompany
                  ? `${companyRows.length} of ${companyCount} ${companyCount === 1 ? "company" : "companies"}`
                  : `${rows.length} of ${leadCount} ${leadCount === 1 ? "person" : "people"}`}
              </span>
              {!byCompany && (
                <span className="ml-auto">
                  <ProfilePaceNote pace={account.profiles} timeZone={timeZone} />
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {chosen.length > 0 && view === "people" && (
        <div
          role="toolbar"
          aria-label="Selected people"
          className="absolute bottom-14 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-primary py-1.5 pr-1.5 pl-4 text-md whitespace-nowrap text-primary-foreground shadow-lg"
        >
          <span className="mr-2 font-semibold">{chosen.length} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary" disabled={pending}>
                <UserCheck />
                Connection
                <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuItem onSelect={() => bulk(() => markRequestSent(chosen), (n) => `${people1(n)} marked as request sent today.`)}>
                <Send />
                Request sent today
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => bulk(() => markAccepted(chosen), (n) => `${people1(n)} marked as connected today.`)}>
                <Check />
                Connected today
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => bulk(() => markWithdrawn(chosen), (n) => (n === 1 ? "1 request marked as withdrawn." : `${n} requests marked as withdrawn.`))}>
                <Undo2 />
                I withdrew it on LinkedIn
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => bulk(() => markNotConnected(chosen), (n) => `${people1(n)} marked as not connected.`)}>
                <X />
                Not connected
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="hover:bg-primary-foreground/10 hover:text-primary-foreground" disabled={pending}>
                <MoveRight />
                Stage
                <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              {laterStages(stages).map((s) => (
                <DropdownMenuItem key={s.key} onSelect={() => bulk(() => bulkSetStage(chosen, s.key), (n) => `${people1(n)} moved to ${s.label}.`)}>
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="hover:bg-primary-foreground/10 hover:text-primary-foreground" disabled={!tags.length || pending}>
                <TagIcon />
                Tag
                <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              {tags.map((t) => (
                <DropdownMenuItem key={t.id} onSelect={() => bulk(() => bulkAddTag(chosen, t.id), (n) => `${t.label} added to ${people1(n)}.`)}>
                  <TagDot color={t.color} />
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="hover:bg-primary-foreground/10 hover:text-primary-foreground" disabled={pending}>
                More
                <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuItem onSelect={() => bulk(() => markProfilesOpened(chosen), (n) => `${people1(n)} marked as opened today.`)}>
                <span className="size-2 rounded-full bg-blue-500" aria-hidden="true" />
                Mark opened
              </DropdownMenuItem>
              {/* Message all and Withdraw go out through the Chrome helper, so only while it runs. */}
              {account.helper.connected && (
                <DropdownMenuItem onSelect={() => setMessaging(true)}>
                  <Send />
                  Message all
                </DropdownMenuItem>
              )}
              {account.helper.connected && withdrawable.length > 0 && (
                <DropdownMenuItem
                  onSelect={() =>
                    bulk(
                      () => withdrawInvites(withdrawable.map((p) => p.id)),
                      (n) => `Withdrawing ${n === 1 ? "1 request" : `${n} requests`}. The helper does it on LinkedIn in the next minute or so.`,
                    )
                  }
                >
                  <Undo2 />
                  Withdraw on LinkedIn
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => bulk(() => moveToOther(chosen), (n) => `${people1(n)} moved to Other. Their conversations stay in the Inbox.`)}>
                <MessageSquare />
                Not leads
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {confirmArchive ? (
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => bulk(() => bulkArchive(chosen), (n) => `${people1(n)} archived.`)}>
              <Archive />
              Archive {chosen.length}?
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="hover:bg-primary-foreground/10 hover:text-primary-foreground" onClick={() => setConfirmArchive(true)}>
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
      <PostAlertsPanel open={alertsOpen} onOpenChange={setAlertsOpen} people={people} perDay={account.alerts.perDay} timeZone={timeZone} />
      <CompanyPanel
        group={opened}
        staleDays={staleDays}
        onOpenChange={(open) => !open && setOpenCompany(null)}
        onRename={() => opened && setRenaming(opened.key)}
        onAddPerson={(company) => setAdding({ company })}
      />
      <CompanyNameDialog group={renamed} others={companyNames.filter((n) => n !== renamed?.name)} onOpenChange={(open) => !open && setRenaming(null)} />
      <ImportDialog open={importing} onOpenChange={setImporting} stages={stages} tags={tags} />
      <MessageAllDialog
        open={messaging}
        onOpenChange={setMessaging}
        title={`Message ${people1(chosenPeople.length)}`}
        groupName=""
        people={chosenPeople}
        templates={templates}
        account={account}
      />
    </div>
  );
}

function FilterSection({ title, n, children }: { title: string; n: number; children: React.ReactNode }) {
  return (
    <div className="border-b px-3 pt-3 pb-2 last:border-b-0">
      <div className="flex items-center justify-between px-1.5 pb-1 text-xs font-semibold text-foreground">
        {title}
        {n > 0 && <span className="rounded-full bg-muted px-1.5 text-2xs text-muted-foreground tabular-nums">{n}</span>}
      </div>
      {children}
    </div>
  );
}

function FilterOption({ on, onClick, label, count, dot }: { on: boolean; onClick: () => void; label: string; count: number; dot?: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      onClick={onClick}
      className="flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm text-foreground/85 hover:bg-muted"
    >
      <span
        aria-hidden="true"
        className={cn("flex size-4 shrink-0 items-center justify-center rounded-[4px] border", on ? "border-foreground bg-foreground text-background" : "border-input")}
      >
        {on && <Check className="size-3" />}
      </span>
      {dot}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </button>
  );
}

function MenuChoice({ on, pending, onClick, children }: { on: boolean; pending: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted", on && "font-semibold")}
    >
      <span className="w-4">{on && <Check className="size-3.5" />}</span>
      {children}
    </button>
  );
}

/** The left column: tick tags, connection, stage, or not opened lately. Counts are for everyone. */
function FilterPanel({
  people,
  tags,
  stages,
  byCompany,
  tagIds,
  conns,
  stageKeys,
  notOpened,
  timeZone,
  onTag,
  onConn,
  onStage,
  onNotOpened,
  onClear,
}: {
  people: Person[];
  tags: Tag[];
  stages: StageDef[];
  byCompany: boolean;
  tagIds: Set<string>;
  conns: Set<ConnectionState>;
  stageKeys: Set<string>;
  notOpened: boolean;
  timeZone: string;
  onTag: (id: string) => void;
  onConn: (c: ConnectionState) => void;
  onStage: (key: string) => void;
  onNotOpened: () => void;
  onClear?: () => void;
}) {
  const counts = useMemo(() => {
    const tag = new Map<string, number>();
    const conn = new Map<ConnectionState, number>();
    const stage = new Map<string, number>();
    let fresh = 0;
    for (const p of people) {
      for (const id of p.tagIds) tag.set(id, (tag.get(id) ?? 0) + 1);
      const c = connectionOf(p);
      conn.set(c, (conn.get(c) ?? 0) + 1);
      stage.set(p.stage, (stage.get(p.stage) ?? 0) + 1);
      if (openedState(p.profileOpenedAt, timeZone) === null) fresh += 1;
    }
    return { tag, conn, stage, fresh };
  }, [people, timeZone]);


  return (
    <aside aria-label="Filters" className="flex w-60 shrink-0 flex-col overflow-y-auto border-r bg-muted/20">
      {tags.length > 0 && (
        <FilterSection title="Tags" n={tagIds.size}>
          {tags.map((t) => (
            <FilterOption key={t.id} on={tagIds.has(t.id)} onClick={() => onTag(t.id)} label={t.label} count={counts.tag.get(t.id) ?? 0} dot={<TagDot color={t.color} />} />
          ))}
        </FilterSection>
      )}
      <FilterSection title="Connection" n={conns.size}>
        {CONNECTIONS.map((c) => (
          <FilterOption key={c.key} on={conns.has(c.key)} onClick={() => onConn(c.key)} label={c.label} count={counts.conn.get(c.key) ?? 0} />
        ))}
      </FilterSection>
      <FilterSection title="Stage" n={stageKeys.size}>
        {laterStages(stages).map((s) => (
          <FilterOption key={s.key} on={stageKeys.has(s.key)} onClick={() => onStage(s.key)} label={s.label} count={counts.stage.get(s.key) ?? 0} />
        ))}
      </FilterSection>
      {!byCompany && (
        <FilterSection title="Opened" n={notOpened ? 1 : 0}>
          <FilterOption on={notOpened} onClick={onNotOpened} label="Not opened in 7 days" count={counts.fresh} dot={<span className="size-2 shrink-0 rounded-full bg-blue-500" />} />
        </FilterSection>
      )}
      {onClear && (
        <button type="button" onClick={onClear} className="mx-4 my-3 self-start text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Clear filters
        </button>
      )}
    </aside>
  );
}

function CompanyName({ name }: { name: string }) {
  if (!name) return <span className="text-xs text-muted-foreground">–</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-muted/60 text-2xs font-bold text-foreground/70">
        {name.charAt(0).toUpperCase()}
      </span>
      <span data-private className="truncate text-sm">
        {name}
      </span>
    </span>
  );
}

function TagsLine({ tags }: { tags: Tag[] }) {
  if (!tags.length) return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground/80" title={tags.map((t) => t.label).join(", ")}>
      <TagDot color={tags[0].color} />
      <span className="truncate">{tags[0].label}</span>
      {tags.length > 1 && <span className="shrink-0 text-muted-foreground">+{tags.length - 1}</span>}
    </span>
  );
}

const PILL = {
  connected: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400",
  pending: "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400",
  old: "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400",
  not: "bg-muted text-muted-foreground hover:bg-muted/70",
};

/**
 * Connection on a row: green Connected 19 Oct, amber Request sent 5d (red
 * after the old-request days), grey Not connected. Click to change it, with
 * the day it happened. You did it on LinkedIn; AILI only notes it.
 */
function ConnectionCell({
  person,
  timeZone,
  today,
  staleDays,
  now,
  pending,
  onAct,
}: {
  person: Person;
  timeZone: string;
  today: string;
  staleDays: number;
  now: Date;
  pending: boolean;
  onAct: (run: () => Promise<number>, done: (n: number) => string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(today);
  const state = connectionOf(person);
  const first = person.name.split(" ")[0];
  const waited = person.invite?.sentAt ? waitingDays(person.invite.sentAt, now) : null;
  const old = state === "pending" && waited !== null && waited > staleDays;
  const label =
    state === "connected"
      ? person.connectedAt
        ? `Connected · ${dayMonth(person.connectedAt, timeZone)}`
        : "Connected"
      : state === "pending"
        ? waited === null
          ? "Request sent"
          : `Request sent · ${waited === 0 ? "today" : `${waited}d`}`
        : "Not connected";
  const when = day === today ? "today" : dayMonth(`${day}T12:00:00`, "UTC");
  const act = (run: () => Promise<number>, done: string) => {
    setOpen(false);
    onAct(run, () => done);
  };
  const ids = [person.id];
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDay(today);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={pending}
          title="Change their connection: you did it on LinkedIn, AILI notes it"
          className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap transition-colors", PILL[old ? "old" : state])}
          suppressHydrationWarning
        >
          {label}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <div className="px-2 pt-1 pb-1 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Connection</div>
        <label className="flex items-center justify-between gap-2 px-2 pb-1.5 text-xs text-muted-foreground">
          On
          <input
            type="date"
            value={day}
            max={today}
            onChange={(e) => setDay(e.target.value || today)}
            className="h-7 rounded-md border bg-background px-2 text-xs text-foreground"
          />
        </label>
        <MenuChoice pending={pending} on={state === "not"} onClick={() => act(() => markNotConnected(ids), `${first} marked as not connected.`)}>
          Not connected
        </MenuChoice>
        <MenuChoice pending={pending} on={state === "pending"} onClick={() => act(() => markRequestSent(ids, day), `Request to ${first} noted as sent ${when}.`)}>
          Request sent
        </MenuChoice>
        <MenuChoice pending={pending} on={state === "connected"} onClick={() => act(() => markAccepted(ids, day), `${first} marked as connected ${when}.`)}>
          Connected
        </MenuChoice>
        {state === "pending" && (
          <MenuChoice pending={pending} on={false} onClick={() => act(() => markWithdrawn(ids), `Request to ${first} noted as withdrawn.`)}>
            I withdrew it on LinkedIn
          </MenuChoice>
        )}
        <p className="mt-1 border-t px-2 pt-1.5 pb-1 text-2xs leading-relaxed text-muted-foreground">You did it on LinkedIn; AILI only notes it, on the day above.</p>
      </PopoverContent>
    </Popover>
  );
}

function StageCell({
  person,
  stages,
  pending,
  onAct,
}: {
  person: Person;
  stages: StageDef[];
  pending: boolean;
  onAct: (run: () => Promise<number>, done: (n: number) => string) => void;
}) {
  const first = person.name.split(" ")[0];
  const early = CONNECTION_STAGES.has(person.stage);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className={cn(
            "inline-flex h-6 max-w-full items-center gap-1 rounded-md border px-2 text-xs font-medium whitespace-nowrap hover:bg-muted data-[state=open]:bg-muted",
            early && "border-dashed",
          )}
        >
          <span className={cn("truncate", early && "font-normal text-muted-foreground")}>{early ? "No stage yet" : stageLabel(stages, person.stage)}</span>
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {laterStages(stages).map((s) => (
          <DropdownMenuItem key={s.key} onSelect={() => onAct(() => bulkSetStage([person.id], s.key), () => `${first} moved to ${s.label}.`)}>
            <span className="w-4">{s.key === person.stage && <Check className="size-3.5" />}</span>
            {s.label}
          </DropdownMenuItem>
        ))}
        {!early && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAct(() => bulkSetStage([person.id], earlyStageFor(person)), () => `${first} has no stage now.`)}>
              <span className="w-4" />
              No stage yet
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Companies: one row per firm, with its people, how many are connected, how far the firm got, tags and the latest activity. */
function CompaniesTable({ groups, stages, tags, onOpen }: { groups: CompanyGroup[]; stages: StageDef[]; tags: Tag[]; onOpen: (key: string) => void }) {
  return (
    <Table className="table-fixed">
      <TableHeader className="sticky top-0 z-10 bg-background">
        <TableRow className="text-2xs tracking-wider uppercase">
          <TableHead className="w-[30%] pl-5">Company</TableHead>
          <TableHead className="w-44">People</TableHead>
          <TableHead className="w-48">Connected</TableHead>
          <TableHead className="w-36">Furthest stage</TableHead>
          <TableHead>Tags</TableHead>
          <TableHead className="w-32 pr-5">Last activity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((g) => {
          const states = g.people.map(connectionOf);
          const connected = states.filter((s) => s === "connected").length;
          const waiting = states.filter((s) => s === "pending").length;
          const groupTags = tags.filter((t) => g.people.some((p) => p.tagIds.includes(t.id)));
          return (
            <TableRow key={g.key || "none"} className={cn(g.key && "cursor-pointer")} onClick={() => g.key && onOpen(g.key)}>
              <TableCell className="pl-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/60 text-xs font-bold text-foreground/70">
                    {g.key ? g.name.charAt(0).toUpperCase() : "–"}
                  </span>
                  <div className="min-w-0">
                    <div data-private className={cn("truncate text-sm font-semibold", !g.key && "font-medium text-muted-foreground")}>
                      {g.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{g.people.length === 1 ? "1 person" : `${g.people.length} people`}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-1.5">
                  <span className="flex -space-x-1.5">
                    {g.people.slice(0, 4).map((p) => (
                      <PersonAvatar key={p.id} person={p} className="size-6 text-2xs ring-2 ring-background" link={false} />
                    ))}
                  </span>
                  {g.people.length > 4 && <span className="text-xs text-muted-foreground">+{g.people.length - 4}</span>}
                </span>
              </TableCell>
              <TableCell className="text-sm">
                {connected} of {g.people.length} connected
                {waiting > 0 && <span className="text-muted-foreground"> · {waiting} waiting</span>}
              </TableCell>
              <TableCell>
                {g.key &&
                  (CONNECTION_STAGES.has(g.stage) ? (
                    <span className="text-xs text-muted-foreground">No stage yet</span>
                  ) : (
                    <span className="inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium">{stageLabel(stages, g.stage)}</span>
                  ))}
              </TableCell>
              <TableCell>
                <TagsLine tags={groupTags} />
              </TableCell>
              <TableCell className="pr-5 text-xs text-muted-foreground" suppressHydrationWarning>
                {ago(g.lastAt)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
