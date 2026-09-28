"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FileText, Inbox, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { syncLine } from "@/lib/sync-status";
import { useExtensionGone } from "@/components/inbox/sync-line";
import type { HelperStatus } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CountBadge } from "@/components/count-badge";

const SECTIONS = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/people", label: "People", icon: Users },
  { href: "/today", label: "Today", icon: CalendarDays },
  { href: "/posts", label: "Posts", icon: FileText },
] as const;

function RailLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: typeof Inbox;
  active: boolean;
  badge?: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={badge ? `${label}, ${badge} need you` : label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground",
            active && "bg-foreground/[0.08] text-foreground hover:bg-foreground/[0.08]",
          )}
        >
          <Icon className="size-4.5" strokeWidth={1.75} />
          {badge ? (
            <CountBadge count={badge} size="sm" className="absolute top-0.5 right-0.5 ring-2 ring-sidebar" />
          ) : null}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{badge ? `${label}, ${badge} need you` : label}</TooltipContent>
    </Tooltip>
  );
}

/** One dot for the Chrome helper, the same colour as the line at the top of the inbox list. */
function HelperDot({ helper, sentLine }: { helper: HelperStatus; sentLine: string }) {
  const gone = useExtensionGone(helper);
  const line = gone
    ? { tone: "warn" as const, title: "The AILI extension is off or missing.", detail: "Turn it on or reinstall it." }
    : syncLine(helper);
  const text = [line.title, line.detail, line.tone === "ok" ? sentLine : ""].filter(Boolean).join(" ");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/settings/connections"
          aria-label="Helper status"
          className="flex size-8 items-center justify-center rounded-md hover:bg-foreground/[0.05]"
        >
          <span
            className={cn(
              "inline-block size-2 rounded-full",
              line.tone === "ok" || line.tone === "busy"
                ? "bg-emerald-500"
                : line.tone === "off"
                  ? "bg-stone-300"
                  : "bg-amber-500",
            )}
          />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-56">
        <span suppressHydrationWarning>{text}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export function Rail({
  initials,
  pictureUrl,
  needsYou,
  helper,
  sentLine,
}: {
  initials: string;
  pictureUrl?: string;
  needsYou: number;
  helper: HelperStatus;
  sentLine: string;
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Sections"
      className="flex w-14 shrink-0 flex-col items-center gap-1.5 border-r bg-sidebar py-4"
    >
      <div className="mb-3 flex size-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
        A
      </div>
      {SECTIONS.map((s) => (
        <RailLink
          key={s.href}
          {...s}
          active={pathname.startsWith(s.href)}
          badge={s.href === "/inbox" ? needsYou : undefined}
        />
      ))}
      <div className="mt-auto flex flex-col items-center gap-2">
        <RailLink
          href="/settings/connections"
          label="Settings"
          icon={Settings}
          active={pathname.startsWith("/settings")}
        />
        <HelperDot helper={helper} sentLine={sentLine} />
        <Avatar size="sm">
          {pictureUrl && <AvatarImage src={pictureUrl} alt="" />}
          <AvatarFallback className="text-3xs">{initials}</AvatarFallback>
        </Avatar>
      </div>
    </nav>
  );
}
