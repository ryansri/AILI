"use client";

import { ClipboardPaste, FileUp, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { templateCsv } from "@/lib/plan-import";
import { downloadText } from "./plan-ui";

function Choice({ icon: Icon, title, note, primary, onClick }: { icon: typeof FileUp; title: string; note: string; primary?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors hover:bg-muted/50 " +
        (primary ? "border-foreground ring-1 ring-foreground" : "")
      }
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-muted">
        <Icon className="size-4" />
      </span>
      <b className="text-md font-semibold">{title}</b>
      <span className="text-xs leading-relaxed text-muted-foreground">{note}</span>
    </button>
  );
}

const SAMPLE = [
  ["Tue 6 Oct", "Post", "Sales tips", "Why your follow-ups get ignored"],
  ["Wed 7 Oct", "Post", "Founder story", "The deal I lost, and what it taught me"],
  ["Fri 9 Oct", "Article", "Client wins", "How a 6-person firm saved 11 hours a week"],
];

/** An empty plan: bring it in from a sheet, paste it, ask Claude, or start from a rhythm. */
export function PlanStart({
  today,
  onImport,
  onRhythm,
}: {
  today: string;
  onImport: (mode: "file" | "paste") => void;
  onRhythm: () => void;
}) {
  function askClaude() {
    const ask =
      "I want my LinkedIn content plan in AILI. Here it is (pasted from my sheet):\n\n[paste your plan here]\n\n" +
      "Add each row to AILI with add_plan_rows: date, type (post or article), topic, and pillar, goal, hook and notes where there are some. " +
      "Show me the rows first.";
    window.open("https://claude.ai/new", "_blank", "noopener");
    void navigator.clipboard.writeText(ask).then(
      () => toast.success("Copied. Paste it into Claude, then add your plan."),
      () => toast.error("Could not copy. Ask Claude to add your plan to AILI."),
    );
  }

  return (
    <div className="flex min-w-0 flex-1 justify-center overflow-y-auto px-6 py-16">
      <div className="flex w-full max-w-[660px] flex-col items-center gap-3 text-center">
        <h2 className="text-2xl font-bold tracking-tight">Bring in your content plan</h2>
        <p className="max-w-[480px] text-md leading-relaxed text-muted-foreground">
          Add your 30, 60 or 90 days of topics. AILI then shows what is posted, what is scheduled and what still needs writing, and warns you
          before a day is missed.
        </p>
        <div className="mt-4 grid w-full gap-3 sm:grid-cols-3">
          <Choice icon={FileUp} primary title="Upload a file" note="Excel or CSV. Any columns; you match them next." onClick={() => onImport("file")} />
          <Choice icon={ClipboardPaste} title="Paste from a sheet" note="Copy the rows in Excel or Google Sheets and paste them." onClick={() => onImport("paste")} />
          <Choice icon={Sparkles} title="Ask Claude" note="Paste your plan into Claude, or make one together." onClick={askClaude} />
        </div>
        <div className="mt-3 w-full overflow-hidden rounded-xl border text-left text-xs">
          <div className="grid grid-cols-[90px_64px_110px_1fr] gap-3 bg-muted/50 px-3 py-2 font-semibold text-muted-foreground">
            <span>Date</span>
            <span>Type</span>
            <span>Pillar</span>
            <span>Topic</span>
          </div>
          {SAMPLE.map((r) => (
            <div key={r[0]} className="grid grid-cols-[90px_64px_110px_1fr] gap-3 border-t px-3 py-2">
              {r.map((c) => (
                <span key={c} className="truncate">
                  {c}
                </span>
              ))}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Only Date and Topic are needed. Pillar, Goal, Hook and Notes are optional.</p>
        <div className="flex gap-5 text-md">
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => downloadText("content-plan-template.csv", templateCsv(today))}>
            Download the blank template
          </button>
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={onRhythm}>
            Start from a rhythm instead
          </button>
        </div>
      </div>
    </div>
  );
}
