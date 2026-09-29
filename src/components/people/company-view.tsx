"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, ChevronRight, MessageSquare, MoreHorizontal, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { keepCompaniesApart, nameCompany } from "@/lib/client-actions";
import { companyTimeline, deciderRank, shortRole, type CompanyGroup } from "@/lib/companies";
import { companyNext, lastTouch, leadNext, type LeadNext } from "@/lib/lead-next";
import { relativeTime } from "@/lib/next-step";
import { stageLabel, type Person, type StageDef } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PersonAvatar } from "@/components/person-avatar";

/*
 * Leads, Companies: one row per company with who you know there, how far the
 * company got, whether anyone is talking and what to do next. The arrow shows
 * the people inside; the name opens the company.
 */

/** The early stages the ring on the photo already shows. Past them, the stage shows by the name. */
const RING_STAGES = new Set(["warming", "requested", "connected"]);

const ago = (iso: string | undefined) => {
  if (!iso) return "";
  const t = relativeTime(iso);
  return t === "now" ? "just now" : `${t} ago`;
};

const firstName = (p: Person) => p.name.trim().split(/\s+/)[0] || p.name;

/** Decision makers first; everyone else after. */
const seniority = (p: Person) => {
  const r = deciderRank(p.jobTitle || p.headline);
  return r < 0 ? 99 : r;
};

function StageWord({ stages, stage }: { stages: StageDef[]; stage: string }) {
  if (RING_STAGES.has(stage)) return null;
  return <span className="shrink-0 rounded-md bg-muted px-1.5 py-px text-xs font-medium text-muted-foreground">{stageLabel(stages, stage)}</span>;
}

function NextText({ next }: { next: LeadNext | null | undefined }) {
  if (!next) return null;
  return (
    <span className={cn("text-md", next.due ? "font-semibold text-amber-700 dark:text-amber-400" : "text-foreground/80")} suppressHydrationWarning>
      {next.text}
    </span>
  );
}

/** Who you know at a company: their photos with the LinkedIn ring, and their roles, decision makers in bold. */
function WhoYouKnow({ people }: { people: Person[] }) {
  const sorted = [...people].sort((a, b) => seniority(a) - seniority(b));
  const shown = sorted.slice(0, 4);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex shrink-0 items-center gap-1.5">
        {shown.map((p) => (
          <PersonAvatar key={p.id} person={p} className="size-6 text-2xs" link={false} />
        ))}
        {sorted.length > shown.length && <span className="text-xs text-muted-foreground">+{sorted.length - shown.length}</span>}
      </span>
      <span className="min-w-0 truncate text-xs text-foreground/80">
        {sorted.map((p, i) => {
          const title = p.jobTitle || p.headline;
          const role = shortRole(title) || firstName(p);
          return (
            <Fragment key={p.id}>
              {i > 0 && ", "}
              <span className={cn(deciderRank(title) >= 0 && "font-semibold text-foreground")}>{role}</span>
            </Fragment>
          );
        })}
      </span>
    </div>
  );
}

export function CompanyTable({
  groups,
  stages,
  staleDays,
  onOpen,
}: {
  groups: CompanyGroup[];
  stages: StageDef[];
  /** Days after which a connection request counts as old. */
  staleDays: number;
  onOpen: (key: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const nexts = useMemo(
    () => new Map(groups.map((g) => [g.key, g.key ? companyNext(g.people, staleDays, seniority) : null] as const)),
    [groups, staleDays],
  );

  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 pl-6" />
          <TableHead className="w-[28%] pl-4">Company</TableHead>
          <TableHead className="w-[24%]">Who you know</TableHead>
          <TableHead>Next</TableHead>
          <TableHead className="w-40 pr-6">Last touch</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((g) => {
          const isOpen = open.has(g.key) || !g.key;
          const Chevron = isOpen ? ChevronDown : ChevronRight;
          const next = nexts.get(g.key);
          return (
            <Fragment key={g.key || "none"}>
              <TableRow className={cn("cursor-pointer", isOpen && g.key && "bg-muted/40")} onClick={() => (g.key ? onOpen(g.key) : toggle(g.key))}>
                <TableCell className="pl-6">
                  {g.key && (
                    <button
                      type="button"
                      aria-label={isOpen ? `Hide the people at ${g.name}` : `Show the people at ${g.name}`}
                      aria-expanded={isOpen}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(g.key);
                      }}
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Chevron className="size-4" />
                    </button>
                  )}
                </TableCell>
                <TableCell className="pl-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/60 text-xs font-bold text-foreground/70"
                    >
                      {g.key ? g.name.charAt(0).toUpperCase() : <Building2 className="size-4" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={cn("truncate text-md font-semibold", !g.key && "font-medium text-muted-foreground")}>{g.name}</span>
                        {g.key && <StageWord stages={stages} stage={g.stage} />}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {g.people.length === 1 ? "1 person" : `${g.people.length} people`}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{g.key && <WhoYouKnow people={g.people} />}</TableCell>
                <TableCell className="whitespace-normal">
                  <NextText next={next} />
                </TableCell>
                <TableCell className="pr-6 text-xs text-muted-foreground" suppressHydrationWarning>
                  {g.key && ago(g.lastAt)}
                </TableCell>
              </TableRow>
              {isOpen &&
                g.people.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer bg-muted/40 hover:bg-muted/70" onClick={() => router.push(`/inbox?person=${p.id}`)}>
                    <TableCell className="pl-6" />
                    <TableCell className="pl-4">
                      <div className={cn("flex min-w-0 items-center gap-3", g.key && "pl-5")}>
                        <PersonAvatar person={p} className="size-7" />
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-semibold">{p.name}</span>
                            <StageWord stages={stages} stage={p.stage} />
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{p.jobTitle || p.headline}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell />
                    <TableCell className="whitespace-normal">
                      <NextText next={next ? next.people.get(p.id) : leadNext(p, staleDays)} />
                    </TableCell>
                    <TableCell className="pr-6 text-xs text-muted-foreground" suppressHydrationWarning>
                      {lastTouch(p).text}
                    </TableCell>
                  </TableRow>
                ))}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** A company put together from different spellings: say so, once, with Keep apart and Rename. */
export function GuessBar({ group, onRename }: { group: CompanyGroup; onRename: () => void }) {
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<void>, done: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(done);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That did not save.");
      }
    });
  const spelled = group.raws.map((r) => `“${r}”`);
  const list = spelled.length === 2 ? spelled.join(" and ") : `${spelled.slice(0, -1).join(", ")} and ${spelled[spelled.length - 1]}`;
  return (
    <div className="mx-6 mb-2 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-md dark:border-amber-900 dark:bg-amber-950/40">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-amber-500" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{list} look like the same company.</span> Shown together as {group.name}.
      </span>
      <Button size="sm" variant="outline" className="bg-background" disabled={pending} onClick={() => act(() => keepCompaniesApart(group.raws), "Kept apart.")}>
        Keep apart
      </Button>
      <Button size="sm" variant="outline" className="bg-background" disabled={pending} onClick={onRename}>
        Rename
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="bg-background"
        disabled={pending}
        onClick={() => act(() => nameCompany(group.raws, group.name), `${group.name} it is.`)}
      >
        That&rsquo;s right
      </Button>
    </div>
  );
}

/**
 * Rename a company, or pick which spellings belong to it. Giving it the name
 * of another company puts the two together.
 */
export function CompanyNameDialog({
  group,
  others,
  onOpenChange,
}: {
  group: CompanyGroup | null;
  others: string[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={group !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {group && <NameForm key={group.key} group={group} others={others} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function NameForm({ group, others, onDone }: { group: CompanyGroup; others: string[]; onDone: () => void }) {
  const [name, setName] = useState(group.name);
  const [picked, setPicked] = useState<Set<string>>(new Set(group.raws));
  const [pending, start] = useTransition();
  const who = (raw: string) =>
    group.people
      .filter((p) => p.company.replace(/\s+/g, " ").trim().toLowerCase() === raw.toLowerCase())
      .map((p) => p.name)
      .join(", ");
  const merging = others.find((o) => o.toLowerCase() === name.trim().toLowerCase() && o !== group.name);

  function save() {
    const keep = group.raws.filter((r) => picked.has(r));
    const out = group.raws.filter((r) => !picked.has(r));
    if (keep.length === 0) {
      toast.error("Tick at least one name.");
      return;
    }
    if (!name.trim()) {
      toast.error("The company needs a name.");
      return;
    }
    start(async () => {
      try {
        await nameCompany(keep, name);
        if (out.length) await keepCompaniesApart(out);
        toast.success(merging ? `Put together with ${merging}.` : "Saved.");
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That did not save.");
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <DialogHeader>
        <DialogTitle>{group.raws.length > 1 ? "Same company?" : "Rename company"}</DialogTitle>
        <DialogDescription>LinkedIn shows the company the way each person typed it. Only the name AILI groups by changes.</DialogDescription>
      </DialogHeader>
      {group.raws.length > 1 && (
        <div className="flex flex-col gap-2">
          {group.raws.map((raw) => (
            <label key={raw} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-md">
              <Checkbox
                checked={picked.has(raw)}
                onCheckedChange={(v) =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (v === true) next.add(raw);
                    else next.delete(raw);
                    return next;
                  })
                }
              />
              <span className="min-w-0 flex-1 truncate font-medium">{raw}</span>
              <span className="max-w-40 truncate text-xs text-muted-foreground">{who(raw)}</span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">Untick a name to keep it as a company of its own.</p>
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="company-name">Show {group.raws.length > 1 ? "them" : "it"} as</Label>
        <Input id="company-name" value={name} onChange={(e) => setName(e.target.value)} list="company-names" autoFocus maxLength={120} />
        <datalist id="company-names">
          {others.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <p className="text-xs text-muted-foreground">
          {merging ? `${merging} is already a company: saving puts the two together.` : "Pick another company's name to put the two together."}
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {merging ? "Put together" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** One company: the next step, who you know there, and everything that happened. */
export function CompanyPanel({
  group,
  staleDays,
  onOpenChange,
  onRename,
  onAddPerson,
}: {
  group: CompanyGroup | null;
  /** Days after which a connection request counts as old. */
  staleDays: number;
  onOpenChange: (open: boolean) => void;
  onRename: () => void;
  onAddPerson: (company: string) => void;
}) {
  const events = useMemo(() => (group ? companyTimeline(group.people, 10) : []), [group]);
  const next = group ? group.talking[0] ?? group.people.find((p) => p.stage === "connected") ?? null : null;
  const nexts = useMemo(() => (group ? companyNext(group.people, staleDays, seniority) : null), [group, staleDays]);

  return (
    <Sheet open={group !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md" showCloseButton={false}>
        {group && (
          <>
            <SheetHeader className="gap-3 border-b p-5">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted/60 text-base font-bold text-foreground/70">
                  {group.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-lg">{group.name}</SheetTitle>
                  <SheetDescription
                    className="truncate text-xs"
                    title={group.raws.some((r) => r !== group.name) ? `On LinkedIn as ${group.raws.join(", ")}` : undefined}
                    suppressHydrationWarning
                  >
                    {group.people.length === 1 ? "1 person" : `${group.people.length} people`}
                    {group.lastAt ? ` · last touch ${ago(group.lastAt)}` : ""}
                  </SheetDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label="More">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
                    <DropdownMenuItem onSelect={onRename}>
                      <Pencil />
                      Rename or put together…
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onAddPerson(group.name)}>
                      <Plus />
                      Add someone from {group.name}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={() => onOpenChange(false)}>
                  <X />
                </Button>
              </div>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
              {group.advice.text && (
                <div className="flex flex-col gap-2 rounded-xl border px-4 py-3">
                  <span className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">Next</span>
                  <span className="text-sm text-foreground/80">{group.advice.text}</span>
                  {next && (
                    <div>
                      <Button size="sm" asChild>
                        <Link href={`/inbox?person=${next.id}`}>
                          <MessageSquare />
                          Open {firstName(next)}&rsquo;s conversation
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <section className="flex flex-col">
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Who you know there</h3>
                {group.people.map((p) => {
                  const title = p.jobTitle || p.headline;
                  return (
                    <Link
                      key={p.id}
                      href={`/inbox?person=${p.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-lg border-t border-border/60 px-2 py-2.5 first-of-type:border-t-0 hover:bg-muted/50"
                    >
                      <PersonAvatar person={p} className="size-8" link={false} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-md font-semibold">
                          <span className="truncate">{p.name}</span>
                          {deciderRank(title) >= 0 && (
                            <span className="shrink-0 rounded-full bg-foreground px-1.5 py-px text-2xs font-semibold text-background">Decision maker</span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{title || "No job title yet"}</span>
                      </span>
                      <span className="shrink-0 text-right text-xs">
                        <NextText next={nexts?.people.get(p.id)} />
                      </span>
                    </Link>
                  );
                })}
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => onAddPerson(group.name)}>
                    <Plus />
                    Add someone from {group.name}
                  </Button>
                </div>
              </section>

              {events.length > 0 && (
                <section className="flex flex-col">
                  <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Everything with {group.name}</h3>
                  <ol className="flex flex-col">
                    {events.map((e, i) => (
                      <li key={`${e.personId}-${e.kind}-${e.at}-${i}`} className="grid grid-cols-[72px_12px_minmax(0,1fr)] items-start gap-2 py-1.5 text-xs">
                        <span className="text-muted-foreground" suppressHydrationWarning>
                          {new Date(e.at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-1 size-2 rounded-full",
                            e.kind === "in" ? "bg-emerald-500" : e.kind === "out" ? "bg-blue-500" : "bg-muted-foreground/40",
                          )}
                        />
                        <span className={cn(e.kind === "in" && "font-medium")}>{e.text}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
