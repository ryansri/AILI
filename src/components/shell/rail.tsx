"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FileText, Inbox, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { syncedLabel } from "@/lib/next-step";
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

/** One dot for the Chrome helper. Green is synced, amber needs attention, grey never paired. */
function HelperDot({ helper, sentLine }: { helper: HelperStatus; sentLine: string }) {
  const text = helper.connected && helper.outdated
    ? "The helper in Chrome is out of date. Settings says how to update it."
    : helper.connected
    ? `Helper ${syncedLabel(helper.lastSeenAt!).toLowerCase()}. ${sentLine}`
    : helper.state === "logged_out"
      ? "Helper running but LinkedIn is logged out in Chrome. Replies are not coming in."
      : helper.state === "error"
        ? "The helper hit an error. Open its popup for details."
        : "Helper not connected. Sends are copy and paste until it is.";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/settings"
          aria-label="Helper status"
          className="flex size-8 items-center justify-center rounded-md hover:bg-foreground/[0.05]"
        >
          <span
            className={cn(
              "inline-block size-2 rounded-full",
              helper.connected && !helper.outdated
                ? "bg-emerald-500"
                : helper.state === "never"
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
          href="/settings"
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
