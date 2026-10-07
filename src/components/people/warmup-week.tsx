"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/types";
import { weekScore } from "@/lib/warmth";
import { WarmthChip } from "@/components/warmth-chip";

/** Comments a week that keep the warm-up going; the bar on the first number. */
const COMMENT_GOAL = 15;

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

/**
 * Leads, This week: the last 7 days from first comment to client, with how
 * many made it to each next step, and who to focus on now.
 */
export function WarmupWeek({ people, needed }: { people: Person[]; needed: number }) {
  const router = useRouter();
  const s = weekScore(people, needed);
  const steps = [
    { n: s.comments, label: "comments you made", note: s.comments >= COMMENT_GOAL ? `goal ${COMMENT_GOAL} ✓` : `goal ${COMMENT_GOAL}`, good: s.comments >= COMMENT_GOAL },
    // Likes on your own posts count here too, so this can be more than the comments.
    { n: s.replies, label: "replies and likes back", note: s.replies <= s.comments ? `${pct(s.replies, s.comments)} of comments` : "on comments and your posts" },
    { n: s.conversations, label: "conversations started", note: `${pct(s.conversations, s.replies)} of replies` },
    { n: s.calls, label: "calls booked", note: `${pct(s.calls, s.conversations)} of conversations` },
    { n: s.clients, label: s.clients === 1 ? "client" : "clients", note: `${pct(s.clients, s.calls)} of calls` },
  ];
  return (
    <div className="flex flex-col gap-5 px-6 pt-2 pb-10">
      <ol aria-label="This week" className="flex items-stretch gap-2">
        {steps.map((st, i) => (
          <li key={st.label} className="flex flex-1 items-stretch gap-2">
            {i > 0 && (
              <span aria-hidden="true" className="flex items-center text-border">
                →
              </span>
            )}
            <div className="flex flex-1 flex-col gap-0.5 rounded-xl border bg-background px-4 py-3">
              <b className="text-2xl font-semibold tracking-tight tabular-nums">{st.n}</b>
              <span className="text-sm text-muted-foreground">{st.label}</span>
              <span className={cn("text-xs font-medium", st.good ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                {st.note}
              </span>
            </div>
          </li>
        ))}
      </ol>

      <section aria-label="Who to focus on" className="overflow-hidden rounded-xl border bg-background">
        <div className="grid grid-cols-[minmax(0,1.3fr)_140px_minmax(0,2fr)_150px] gap-4 bg-muted/60 px-5 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <span>Who to focus on</span>
          <span>Warmth</span>
          <span>Why</span>
          <span>Do</span>
        </div>
        {s.focus.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            Nobody needs a move right now. Comment on a few posts from your leads to warm them up.
          </p>
        ) : (
          s.focus.map(({ person, warmth, move }) => (
            <button
              key={person.id}
              type="button"
              onClick={() => router.push(`/inbox?person=${person.id}`)}
              className="grid w-full grid-cols-[minmax(0,1.3fr)_140px_minmax(0,2fr)_150px] items-center gap-4 border-t px-5 py-3 text-left text-sm transition-colors hover:bg-muted/40"
            >
              <span className="truncate font-semibold">{person.name}</span>
              <span>
                <WarmthChip warmth={warmth} />
              </span>
              <span className="truncate text-muted-foreground">{move.long}</span>
              <span className={cn("font-semibold", move.due && "text-amber-700 dark:text-amber-400")}>{move.short}</span>
            </button>
          ))
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        The last 7 days. Comments you post in Chrome and the replies and likes in your LinkedIn notifications are counted by
        the AILI helper.
      </p>
    </div>
  );
}
