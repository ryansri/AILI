import { Skeleton } from "@/components/ui/skeleton";

/*
 * What a page shows the moment you click to it, while its data loads: the
 * page's own outline in grey. The real page replaces it as soon as it arrives.
 */

function Rows({ count, avatar = true }: { count: number; avatar?: boolean }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b px-4 py-3.5">
          {avatar && <Skeleton className="size-10 shrink-0 rounded-full" />}
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Header({ width = "w-24" }: { width?: string }) {
  return (
    <div className="flex h-14 shrink-0 items-center border-b px-4">
      <Skeleton className={`h-5 ${width}`} />
    </div>
  );
}

/** A list beside a pane: Inbox and Posts. */
export function ListPaneSkeleton({ listWidth = "w-[360px]" }: { listWidth?: string }) {
  return (
    <div className="flex min-w-0 flex-1" aria-busy="true" aria-label="Loading">
      <div className={`flex ${listWidth} shrink-0 flex-col border-r`}>
        <Header />
        <Rows count={8} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-sidebar">
        <Header width="w-40" />
      </div>
    </div>
  );
}

/** A full-width page: People and Today. */
export function TableSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col" aria-busy="true" aria-label="Loading">
      <Header />
      <div className="flex gap-3 border-b px-4 py-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 flex-1 rounded-lg" />
        ))}
      </div>
      <Rows count={8} />
    </div>
  );
}

/** A Settings page, inside the Settings menu. */
export function SettingsSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-6 py-10" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-72" />
      <div className="overflow-hidden rounded-xl border">
        <Rows count={4} />
      </div>
    </div>
  );
}
