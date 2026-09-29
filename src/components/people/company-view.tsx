"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, ChevronRight, MessageSquare, MoreHorizontal, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { keepCompaniesApart, nameCompany } from "@/lib/client-actions";
import { companyTimeline, deciderRank, shortRole, type CompanyGroup, type Tone } from "@/lib/companies";
import { relativeTime } from "@/lib/next-step";
import { stageLabel, type Person, type StageDef, type Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TagChip } from "@/components/tag-chip";
import { PersonAvatar } from "@/components/person-avatar";
import { LinkedInButton } from "@/components/linkedin-bits";

/*
 * Leads, Companies: one row per company with who you know there, how far the
 * company got, whether anyone is talking and what to do next. The arrow shows
 * the people inside; the name opens the company.
 */

const TALKING_STAGES = ["conversation", "call", "pilot", "won"];

const ago = (iso: string | undefined) => {
  if (!iso) return "";
  const t = relativeTime(iso);
  return t === "now" ? "just now" : `${t} ago`;
};

const firstName = (p: Person) => p.name.trim().split(/\s+/)[0] || p.name;

function StageBadge({ stages, stage }: { stages: StageDef[]; stage: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TALKING_STAGES.includes(stage) ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-foreground/[0.06]",
        stage === "lost" && "text-muted-foreground",
      )}
    >
      {stageLabel(stages, stage)}
    </span>
  );
}

/** The roles you know at a company, decision makers dark and first. */
function Roles({ people, onAdd }: { people: Person[]; onAdd?: () => void }) {
  const roles = people
    .map((p) => {
      const title = p.jobTitle || p.headline;
      return { id: p.id, name: p.name, role: shortRole(title) || firstName(p), rank: deciderRank(title) };
    })
    .sort((a, b) => (a.rank < 0 ? 9 : a.rank) - (b.rank < 0 ? 9 : b.rank));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {roles.map((r) => (
        <span
          key={r.id}
          title={r.name}
          className={cn(
            "inline-flex h-5.5 items-center rounded-full px-2 text-xs whitespace-nowrap",
            r.rank >= 0 ? "bg-foreground text-background" : "bg-muted text-foreground/80",
          )}
        >
          {r.role}
        </span>
      ))}
      {onAdd && people.length === 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="inline-flex h-5.5 items-center rounded-full border border-dashed px-2 text-xs whitespace-nowrap text-muted-foreground hover:text-foreground"
        >
          + someone else
        </button>
      )}
    </div>
  );
}

const TONE_DOT: Record<Tone, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", muted: "bg-muted-foreground/50" };

function Advice({ text, tone }: { text: string; tone: Tone }) {
  if (!text) return null;
  return (
    <span className={cn("flex min-w-0 items-start gap-2 text-xs", tone === "warn" ? "text-amber-800 dark:text-amber-300" : "text-foreground/80")}>
      <span aria-hidden="true" className={cn("mt-1 size-1.5 shrink-0 rounded-full", TONE_DOT[tone])} />
      <span>{text}</span>
    </span>
  );
}

function Talking({ group }: { group: CompanyGroup }) {
  if (!group.talking.length) return <span className="text-xs text-muted-foreground">{group.people.length > 1 ? "No one yet" : "Not yet"}</span>;
  return <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Yes, {group.talking.map(firstName).slice(0, 2).join(" and ")}</span>;
}

export function CompanyTable({
  groups,
  stages,
  tags,
  onOpen,
  onAddPerson,
}: {
  groups: CompanyGroup[];
  stages: StageDef[];
  tags: Tag[];
  onOpen: (key: string) => void;
  onAddPerson: (company: string) => void;
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

  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 pl-6" />
          <TableHead className="w-[24%]">Company</TableHead>
          <TableHead className="w-[20%]">Who you know there</TableHead>
          <TableHead className="w-36">Furthest step</TableHead>
          <TableHead className="w-28">Talking?</TableHead>
          <TableHead className="w-24">Last touch</TableHead>
          <TableHead className="pr-6">What next</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((g) => {
          const isOpen = open.has(g.key) || !g.key;
          const Chevron = isOpen ? ChevronDown : ChevronRight;
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
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/60 text-xs font-bold text-foreground/70"
                    >
                      {g.key ? g.name.charAt(0).toUpperCase() : <Building2 className="size-4" />}
                    </span>
                    <div className="min-w-0">
                      <div className={cn("truncate text-md font-semibold", !g.key && "font-medium text-muted-foreground")}>{g.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {g.people.length === 1 ? "1 person" : `${g.people.length} people`}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{g.key && <Roles people={g.people} onAdd={() => onAddPerson(g.name)} />}</TableCell>
                <TableCell>{g.key && <StageBadge stages={stages} stage={g.stage} />}</TableCell>
                <TableCell>{g.key && <Talking group={g} />}</TableCell>
                <TableCell className="text-xs text-muted-foreground" suppressHydrationWarning>
                  {g.key && ago(g.lastAt)}
                </TableCell>
                <TableCell className="pr-6 whitespace-normal">
                  <Advice {...g.advice} />
                </TableCell>
              </TableRow>
              {isOpen &&
                g.people.map((p) => (
                  <TableRow key={p.id} className="group cursor-pointer bg-muted/40 hover:bg-muted/70" onClick={() => router.push(`/inbox?person=${p.id}`)}>
                    <TableCell className="pl-6" />
                    <TableCell>
                      <div className={cn("flex min-w-0 items-center gap-2.5", g.key && "pl-5")}>
                        <PersonAvatar person={p} className="size-7" />
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-sm font-semibold">{p.name}</span>
                            <LinkedInButton person={p} className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" />
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{p.jobTitle || p.headline}</div>
                        </div>
                      </div>
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
                    <TableCell>
                      <StageBadge stages={stages} stage={p.stage} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.messages.some((m) => m.direction === "in") ? <span className="font-semibold text-emerald-700 dark:text-emerald-400">Yes</span> : "No"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground" suppressHydrationWarning>
                      {ago(p.messages[p.messages.length - 1]?.sentAt ?? p.connectedAt ?? p.requestedAt ?? p.createdAt)}
                    </TableCell>
                    <TableCell className="pr-6 text-xs text-muted-foreground">Open conversation →</TableCell>
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
  stages,
  onOpenChange,
  onRename,
  onAddPerson,
}: {
  group: CompanyGroup | null;
  stages: StageDef[];
  onOpenChange: (open: boolean) => void;
  onRename: () => void;
  onAddPerson: (company: string) => void;
}) {
  const events = useMemo(() => (group ? companyTimeline(group.people, 10) : []), [group]);
  const next = group ? group.talking[0] ?? group.people.find((p) => p.stage === "connected") ?? null : null;

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
                  <SheetDescription className="truncate text-xs">
                    {group.raws.length > 1 ? `On LinkedIn as ${group.raws.join(", ")}` : group.raws[0] !== group.name ? `On LinkedIn as ${group.raws[0]}` : "Company"}
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
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border px-3 py-2">
                  <div className="text-xs text-muted-foreground">People</div>
                  <div className="text-md font-semibold">{group.people.length}</div>
                </div>
                <div className="rounded-lg border px-3 py-2">
                  <div className="text-xs text-muted-foreground">Furthest step</div>
                  <div className={cn("truncate text-md font-semibold", TALKING_STAGES.includes(group.stage) && "text-emerald-700 dark:text-emerald-400")}>
                    {stageLabel(stages, group.stage)}
                  </div>
                </div>
                <div className="rounded-lg border px-3 py-2">
                  <div className="text-xs text-muted-foreground">Last touch</div>
                  <div className="truncate text-md font-semibold" suppressHydrationWarning>
                    {ago(group.lastAt) || "Never"}
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
              {group.advice.text && (
                <div
                  className={cn(
                    "flex flex-col gap-2.5 rounded-xl border px-4 py-3",
                    group.advice.tone === "ok"
                      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
                      : group.advice.tone === "warn"
                        ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
                        : "bg-muted/50",
                  )}
                >
                  <span className="text-md font-semibold">Next</span>
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
                  const sent = p.messages.filter((m) => m.direction === "out").length;
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
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <StageBadge stages={stages} stage={p.stage} />
                        <span className="text-2xs text-muted-foreground tabular-nums">
                          {sent} sent · {p.messages.length - sent} got
                        </span>
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
