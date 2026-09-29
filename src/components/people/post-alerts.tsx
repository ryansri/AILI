"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { openedForAlerts, setAlerts } from "@/lib/client-actions";
import { alertsQueue } from "@/lib/alerts";
import { localDay } from "@/lib/plan";
import type { Person } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PersonAvatar } from "@/components/person-avatar";

/*
 * Post alerts: a few leads a day to tap the bell for on LinkedIn, so LinkedIn
 * tells you when they post. Open profile opens their page; the helper notices
 * the tap and ticks them off. If it cannot, the row asks "Is the bell on?".
 */

export function usePostAlerts(people: Person[], perDay: number, timeZone: string) {
  return useMemo(() => alertsQueue(people, perDay, timeZone), [people, perDay, timeZone]);
}

function Row({ person, timeZone }: { person: Person; timeZone: string }) {
  const [pending, start] = useTransition();
  const first = person.name.split(" ")[0];
  const act = (fn: () => Promise<unknown>, done = "") =>
    start(async () => {
      try {
        await fn();
        if (done) toast.success(done);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That did not save.");
      }
    });
  const subtitle = [person.jobTitle || person.headline, person.company].filter(Boolean).join(" · ");
  const today = localDay(new Date(), timeZone);
  const opened = person.alertsOpenedAt && localDay(new Date(person.alertsOpenedAt), timeZone) === today;

  return (
    <li className="flex flex-col border-t border-border/60 first:border-t-0">
      <div className="flex items-center gap-3 py-3">
        <PersonAvatar person={person} className="size-8" />
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-md font-semibold", person.alerts && "text-muted-foreground")}>{person.name}</div>
          {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {person.alerts === "on" ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <Check className="size-3.5" />
            Bell on
          </span>
        ) : person.alerts === "impossible" ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <BellOff className="size-3.5" />
            No bell
          </span>
        ) : opened ? (
          <span className="text-xs text-muted-foreground">Opened</span>
        ) : (
          <Button size="sm" variant="outline" asChild>
            <a href={person.linkedinUrl} target="_blank" rel="noreferrer" onClick={() => act(() => openedForAlerts(person.id))}>
              Open profile
              <ExternalLink />
            </a>
          </Button>
        )}
      </div>
      {!person.alerts && opened && (
        <div className="mb-3 ml-11 flex flex-col gap-2 rounded-xl bg-muted/70 px-3.5 py-3">
          <span className="text-sm font-semibold">Is the bell on for {first}?</span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => act(() => setAlerts(person.id, "on"))}>
              <Check />
              Yes, it&rsquo;s on
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => setAlerts(person.id, "impossible"))}>
              No bell
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => setAlerts(person.id, "later"), `${first} tomorrow.`)}>
              Later
            </Button>
          </div>
          <span className="text-2xs text-muted-foreground">
            AILI ticks it off by itself when it sees you tap the bell. No bell: they only allow Connect, so AILI stops asking.
          </span>
        </div>
      )}
    </li>
  );
}

export function PostAlertsPanel({
  open,
  onOpenChange,
  people,
  perDay,
  timeZone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: Person[];
  perDay: number;
  timeZone: string;
}) {
  const router = useRouter();
  const queue = usePostAlerts(people, perDay, timeZone);
  const today = queue.doneToday.length + queue.next.length;

  // Back from LinkedIn: show what the helper ticked off meanwhile.
  useEffect(() => {
    if (!open) return;
    const again = () => router.refresh();
    window.addEventListener("focus", again);
    return () => window.removeEventListener("focus", again);
  }, [open, router]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="gap-3 border-b p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <Bell className="size-4" />
            </span>
            <SheetTitle className="text-lg">Post alerts</SheetTitle>
          </div>
          <SheetDescription className="text-sm leading-relaxed">
            Open each profile and tap the bell. LinkedIn then tells you when they post, so you can comment early. AILI ticks them off
            when it sees the tap.
          </SheetDescription>
          {today > 0 && (
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <span>
                <span className="font-semibold text-foreground">
                  {queue.doneToday.length} of {today}
                </span>{" "}
                today
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-foreground" style={{ width: `${Math.round((queue.doneToday.length / today) * 100)}%` }} />
              </span>
              <span>{queue.left} to go</span>
            </div>
          )}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          <ul className="flex flex-col">
            {[...queue.doneToday, ...queue.next].map((p) => (
              <Row key={p.id} person={p} timeZone={timeZone} />
            ))}
          </ul>
          {queue.next.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {queue.left === 0 ? "Every lead has post alerts on. New leads show up here." : "All done for today. The next ones come tomorrow."}
            </p>
          )}
        </div>
        <div className="border-t px-5 py-3.5 text-xs text-muted-foreground">
          {perDay} a day keeps it ordinary. Decision makers and leads you&rsquo;re warming up come first.
        </div>
      </SheetContent>
    </Sheet>
  );
}
