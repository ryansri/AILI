"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FileText, Inbox, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ACCOUNT } from "@/lib/mock/data";

const SECTIONS = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/people", label: "People", icon: Users },
  { href: "/posts", label: "Posts", icon: FileText },
  { href: "/today", label: "Today", icon: CalendarDays },
] as const;

function RailLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Inbox;
  active: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            active && "bg-accent text-foreground",
          )}
        >
          <Icon className="size-[18px]" strokeWidth={1.75} />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Rail() {
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
        <RailLink key={s.href} {...s} active={pathname.startsWith(s.href)} />
      ))}
      <div className="mt-auto flex flex-col items-center gap-2">
        <RailLink
          href="/settings"
          label="Settings"
          icon={Settings}
          active={pathname.startsWith("/settings")}
        />
        <Avatar size="sm">
          <AvatarFallback className="text-[10px]">{ACCOUNT.initials}</AvatarFallback>
        </Avatar>
      </div>
    </nav>
  );
}
