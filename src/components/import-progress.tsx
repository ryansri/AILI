/**
 * A bar that fills as the import brings conversations in. LinkedIn does not
 * say how many there are in total, so it eases towards the end as the count
 * grows and only reaches it when the import is done. Moving stripes show it
 * is still working between pages.
 */
export function ImportProgress({ imported, done = false }: { imported: number; done?: boolean }) {
  const pct = done ? 100 : Math.min(95, 8 + 87 * (1 - Math.exp(-imported / 60)));
  return (
    <div
      role="progressbar"
      aria-label="Import progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-foreground transition-[width] duration-1000 ease-out"
        style={{
          width: `${pct}%`,
          backgroundImage:
            "linear-gradient(45deg, rgb(255 255 255 / 0.18) 25%, transparent 25%, transparent 50%, rgb(255 255 255 / 0.18) 50%, rgb(255 255 255 / 0.18) 75%, transparent 75%, transparent)",
          backgroundSize: "16px 16px",
          animation: done ? undefined : "aili-stripes 0.8s linear infinite",
        }}
      />
    </div>
  );
}
