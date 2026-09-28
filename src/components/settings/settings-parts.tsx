import { cn } from "@/lib/utils";

/*
 * The building blocks of every Settings page: a title and one line, then
 * grouped rows (like iOS Settings). Each row says what it is, a status line,
 * and holds at most one button plus a ••• menu.
 */

export function SettingsPage({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-md text-muted-foreground">{lead}</p>
      </div>
      {children}
    </div>
  );
}

export function Group({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-xl border bg-background [&>*+*]:border-t", className)}>{children}</div>;
}

export type Tone = "ok" | "warn" | "off";

export function StatusDot({ tone }: { tone: Tone }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-[7px] shrink-0 rounded-full",
        tone === "ok" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-stone-300",
      )}
    />
  );
}

export function Row({
  icon,
  title,
  status,
  tone,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  /** One line under the title. With a tone it gets the dot. */
  status?: React.ReactNode;
  tone?: Tone;
  /** The row's button and ••• menu. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5">
      {icon}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-md font-semibold">{title}</span>
        {status && (
          <span
            className={cn("flex items-center gap-1.5 text-xs", tone === "warn" ? "text-amber-800" : "text-muted-foreground")}
            suppressHydrationWarning
          >
            {tone && <StatusDot tone={tone} />}
            <span className="min-w-0">{status}</span>
          </span>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </div>
  );
}

/** The square mark at the start of a connection row. */
export function RowIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[9px] text-xs font-bold", className)}>
      {children}
    </span>
  );
}
