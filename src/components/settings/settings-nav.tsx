"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareText, PlugZap, Send, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGES: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/settings/connections", label: "Connections", icon: PlugZap },
  { href: "/settings/sending", label: "Sending", icon: Send },
  { href: "/settings/templates", label: "Templates", icon: MessageSquareText },
  { href: "/settings/account", label: "Account", icon: UserRound },
];

/** Settings' own menu. An amber dot on Connections when something there needs you. */
export function SettingsNav({ warn }: { warn: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="flex w-[220px] shrink-0 flex-col gap-0.5 border-r bg-sidebar px-2 py-3">
      <h1 className="px-2.5 pt-2 pb-3 text-xl font-bold tracking-tight">Settings</h1>
      {PAGES.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-md transition-colors",
              active ? "bg-accent font-semibold text-foreground" : "text-foreground/80 hover:bg-muted",
            )}
          >
            <Icon className="size-4 text-muted-foreground" />
            {label}
            {warn && label === "Connections" && (
              <span aria-label="Needs attention" className="ml-auto size-[7px] rounded-full bg-amber-500" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
