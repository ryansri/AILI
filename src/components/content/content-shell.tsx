import Link from "next/link";
import { CalendarPlus, FileText, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type ContentTab = "plan" | "posts";

/** Content's top bar: Plan (the content plan) and Posts (the posts themselves), and New. */
export function ContentShell({ tab, children }: { tab: ContentTab; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b px-5">
        <h1 className="text-xl font-bold tracking-tight">Content</h1>
        <nav aria-label="Content" className="flex rounded-lg bg-muted p-[3px]">
          {(
            [
              ["plan", "Plan", "/posts?tab=plan"],
              ["posts", "Posts", "/posts?tab=posts"],
            ] as const
          ).map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              aria-current={tab === key ? "page" : undefined}
              className={cn(
                "flex h-7 items-center rounded-md px-4 text-md transition-colors",
                tab === key ? "bg-background font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="ml-auto">
              <Plus />
              New
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href="/posts?tab=posts&new=post">
                <Pencil />
                Post
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/posts?tab=posts&new=article">
                <FileText />
                Article
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/posts?tab=plan&add=1">
                <CalendarPlus />
                Plan row
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
