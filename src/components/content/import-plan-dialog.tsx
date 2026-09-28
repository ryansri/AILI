"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ArrowRight, FileUp, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { importPlan } from "@/lib/client-actions";
import { dayLabel } from "@/lib/plan";
import {
  buildEntries,
  channelValues,
  detectOrder,
  FIELD_LABEL,
  guessTableFields,
  parseDay,
  parseTable,
  planScore,
  tidy,
  type DateOrder,
  type Field,
} from "@/lib/plan-import";
import { readXlsxSheets, type Sheet } from "@/lib/xlsx";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const FIELD_ORDER: Field[] = ["day", "time", "kind", "topic", "pillar", "goal", "hook", "notes", "text", "status", "channel", "note", "skip"];

/**
 * Bring a content plan in: upload an Excel or CSV file, or paste rows copied
 * from a sheet. AILI guesses what each column is; the user checks and imports.
 */
export function ImportPlanDialog({
  open,
  onOpenChange,
  mode,
  today,
  timeZone,
  hasPlan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Start with the file picker or the paste box. */
  mode: "file" | "paste";
  today: string;
  timeZone: string;
  hasPlan: boolean;
}) {
  const [source, setSource] = useState<"file" | "paste">(mode);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  /** Every sheet of an Excel file, when it has more than one; the one in use is `sheet`. */
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheet, setSheet] = useState(0);
  const [table, setTable] = useState<string[][] | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [order, setOrder] = useState<DateOrder>("dmy");
  const [orderSure, setOrderSure] = useState(true);
  const [replace, setReplace] = useState(false);
  /** Channel values (e.g. Company page) whose rows stay out. */
  const [leaveOut, setLeaveOut] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function reset() {
    setText("");
    setFileName("");
    setSheets([]);
    setSheet(0);
    setTable(null);
    setFields([]);
    setReplace(false);
  }

  function close(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function takeTable(rows: string[][], name: string, quiet = false) {
    const t = tidy(rows);
    if (t.length < 2) {
      if (!quiet) toast.error("No rows found. The first row should be the headings, like Date, Type, Topic.");
      setTable(t.length ? t : null);
      setFields(t.length ? t[0].map(() => "skip") : []);
      return;
    }
    const guessed = guessTableFields(t, today, timeZone);
    const dayCol = guessed.indexOf("day");
    const detected = detectOrder(dayCol >= 0 ? t.slice(1).map((r) => r[dayCol] ?? "") : [], timeZone);
    setTable(t);
    setFields(guessed);
    setLeaveOut([]);
    setOrder(detected.order);
    setOrderSure(detected.sure);
    setFileName(name);
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    try {
      if (/\.xlsx$/i.test(file.name)) {
        // A workbook often has a summary or notes tab first: start on the sheet that looks most like a plan.
        const all = readXlsxSheets(new Uint8Array(await file.arrayBuffer()));
        const scores = all.map((s) => planScore(tidy(s.rows)));
        const best = scores.indexOf(Math.max(...scores));
        setSheets(all.length > 1 ? all : []);
        setSheet(best);
        takeTable(all[best].rows, file.name);
      }
      else if (/\.xls$/i.test(file.name)) toast.error("That is an old Excel file. Save it as .xlsx or .csv and try again.");
      else takeTable(parseTable(await file.text()), file.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That file could not be read.");
    } finally {
      setReading(false);
    }
  }

  const result = useMemo(
    () => (table ? buildEntries(table, fields, order, today, { leaveOut }) : null),
    [table, fields, order, today, leaveOut],
  );
  const channels = useMemo(() => (table ? channelValues(table, fields) : []), [table, fields]);
  const dated = result?.entries.filter((e) => e.day).map((e) => e.day!).sort() ?? [];
  const articles = result?.entries.filter((e) => e.kind === "article").length ?? 0;
  const posts = (result?.entries.length ?? 0) - articles;
  const hasDay = fields.includes("day");
  const hasTopic = fields.some((f) => f === "topic" || f === "hook" || f === "text");

  function setField(i: number, f: Field) {
    setFields((prev) =>
      prev.map((old, j) => {
        if (j === i) return f;
        // One column per field: the one it came from lets go.
        if (old === f && f !== "note" && f !== "skip") return "note";
        return old;
      }),
    );
  }

  function run() {
    if (!result) return;
    start(async () => {
      try {
        const r = await importPlan({ entries: result.entries, replace });
        toast.success(
          `Added ${r.added} ${r.added === 1 ? "row" : "rows"} to your plan.` +
            (r.replaced ? ` ${r.replaced} old ${r.replaced === 1 ? "row" : "rows"} replaced.` : "") +
            (r.drafts ? ` ${r.drafts} with their text, saved as drafts.` : ""),
        );
        close(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not import.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-3xl">
        {!table ? (
          <>
            <DialogHeader>
              <DialogTitle>Bring in your content plan</DialogTitle>
              <DialogDescription>
                One row per post or article. Only a date and a topic are needed; any other columns are kept.
              </DialogDescription>
            </DialogHeader>
            <div className="flex w-fit rounded-lg bg-muted p-[3px]" role="tablist">
              {(["file", "paste"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={source === s}
                  onClick={() => setSource(s)}
                  className={cn(
                    "h-7 rounded-md px-4 text-md",
                    source === s ? "bg-background font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s === "file" ? "Upload a file" : "Paste from a sheet"}
                </button>
              ))}
            </div>
            {source === "file" ? (
              <button
                type="button"
                onClick={() => input.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void readFile(e.dataTransfer.files[0]);
                }}
                className="flex h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-md text-muted-foreground hover:bg-muted/50"
              >
                {reading ? <Loader2 className="size-5 animate-spin" /> : <FileUp className="size-5" />}
                <span className="font-medium text-foreground">Choose an Excel or CSV file</span>
                <span className="text-xs">or drop it here · .xlsx, .csv</span>
                <input
                  ref={input}
                  type="file"
                  accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    void readFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <Textarea
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={"Select the rows in Excel or Google Sheets, headings included, copy, and paste here.\n\nDate\tType\tTopic\n6/10/2026\tPost\tWhy your follow-ups get ignored"}
                  className="h-44 font-mono text-xs"
                  aria-label="Rows from your sheet"
                />
                <Button className="self-end" disabled={!text.trim()} onClick={() => takeTable(parseTable(text), "Pasted rows")}>
                  Next
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Match your columns</DialogTitle>
              <DialogDescription>
                {fileName} · {table.length - 1} {table.length === 2 ? "row" : "rows"} · AILI guessed these; change any that are wrong.
              </DialogDescription>
            </DialogHeader>
            {sheets.length > 1 && (
              <div className="flex items-center gap-3 text-md">
                <span>Sheet</span>
                <Select
                  value={String(sheet)}
                  onValueChange={(v) => {
                    setSheet(Number(v));
                    takeTable(sheets[Number(v)].rows, fileName, true);
                  }}
                >
                  <SelectTrigger size="sm" className="w-64" aria-label="Sheet">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sheets.map((s, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">Pick the tab with your posts, one per row.</span>
              </div>
            )}
            <div className="max-h-[46vh] overflow-y-auto rounded-xl border">
              <div className="grid grid-cols-[1fr_20px_190px_1.3fr] items-center gap-x-3 bg-muted/50 px-3 py-2 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                <span>Your column</span>
                <span />
                <span>In AILI</span>
                <span>Example</span>
              </div>
              {table[0].map((heading, i) => {
                const example = table.slice(1).find((r) => r[i])?.[i] ?? "";
                return (
                  <div key={i} className="grid grid-cols-[1fr_20px_190px_1.3fr] items-center gap-x-3 border-t px-3 py-1.5 text-md">
                    <span className="truncate font-medium">{heading || `Column ${i + 1}`}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <Select value={fields[i]} onValueChange={(v) => setField(i, v as Field)}>
                      <SelectTrigger size="sm" className="w-full" aria-label={`${heading || `Column ${i + 1}`} is`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_ORDER.map((f) => (
                          <SelectItem key={f} value={f}>
                            {FIELD_LABEL[f]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="truncate text-xs text-muted-foreground">
                      {/* Excel keeps dates as numbers (46293): show the day AILI reads. */}
                      {fields[i] === "day" && parseDay(example, order, today) ? dayLabel(parseDay(example, order, today)!) : example}
                    </span>
                  </div>
                );
              })}
            </div>

            {hasDay && !orderSure && (
              <div className="flex items-center gap-3 text-md">
                <span>Dates like 6/10 mean</span>
                <Select value={order} onValueChange={(v) => setOrder(v as DateOrder)}>
                  <SelectTrigger size="sm" className="w-52" aria-label="Date order">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dmy">6 October (day first)</SelectItem>
                    <SelectSeparator />
                    <SelectItem value="mdy">June 10 (month first)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {(!hasDay || !hasTopic || (result && (result.badDates.length > 0 || result.undated > 0))) && (
              <div className="flex flex-col gap-1 rounded-lg bg-amber-50 px-3 py-2 text-md text-amber-900">
                {!hasTopic && (
                  <p className="flex items-center gap-2">
                    <TriangleAlert className="size-4 shrink-0" /> Pick which column is the Topic.
                  </p>
                )}
                {!hasDay && (
                  <p className="flex items-center gap-2">
                    <TriangleAlert className="size-4 shrink-0" /> No Date column: every row comes in as Not planned.
                  </p>
                )}
                {hasDay && result && result.undated > 0 && (
                  <p className="flex items-center gap-2">
                    <TriangleAlert className="size-4 shrink-0" />
                    {result.undated} {result.undated === 1 ? "row has" : "rows have"} no date AILI can read
                    {result.badDates.length ? ` (row ${result.badDates.slice(0, 5).join(", ")}${result.badDates.length > 5 ? "…" : ""})` : ""}. They come
                    in as Not planned, so you can give them a day later.
                  </p>
                )}
              </div>
            )}

            {channels.length > 1 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-md">
                <span>Bring in rows for</span>
                {channels.map((c) => (
                  <label key={c.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-foreground"
                      checked={!leaveOut.includes(c.value)}
                      onChange={(e) =>
                        setLeaveOut((prev) => (e.target.checked ? prev.filter((v) => v !== c.value) : [...prev, c.value]))
                      }
                    />
                    {c.value} <span className="text-muted-foreground">{c.count}</span>
                  </label>
                ))}
                <span className="basis-full text-xs text-muted-foreground">AILI publishes to your own LinkedIn profile; posts for a company page are yours to put up there.</span>
              </div>
            )}

            {hasPlan && (
              <div className="flex flex-col gap-1.5 text-md">
                {[
                  [false, "Add these rows to my plan"],
                  [true, "Replace the rows ahead that are not written yet (use this for an updated sheet)"],
                ].map(([value, label]) => (
                  <label key={String(value)} className="flex items-center gap-2.5">
                    <input type="radio" name="replace" checked={replace === value} onChange={() => setReplace(value as boolean)} className="accent-foreground" />
                    {label}
                  </label>
                ))}
              </div>
            )}

            <DialogFooter className="items-center sm:justify-between">
              <span className="text-md text-muted-foreground">
                {result && result.entries.length > 0
                  ? `${posts} ${posts === 1 ? "post" : "posts"}${articles ? ` and ${articles} ${articles === 1 ? "article" : "articles"}` : ""}` +
                    (dated.length ? ` from ${dayLabel(dated[0])} to ${dayLabel(dated[dated.length - 1])}` : "") +
                    (result.posted ? `, ${result.posted} already posted` : "")
                  : "No rows to bring in yet."}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setTable(null)}>
                  Back
                </Button>
                <Button disabled={pending || !result || result.entries.length === 0 || !hasTopic} onClick={run}>
                  {pending && <Loader2 className="animate-spin" />}
                  Import {result?.entries.length ?? 0} {result?.entries.length === 1 ? "row" : "rows"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
