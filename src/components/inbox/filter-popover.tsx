"use client";

import { ListFilter, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusKind } from "@/lib/next-step";
import { activeConditions, FILTER_FIELDS, type Condition, type FilterField, type FilterOp } from "@/lib/rows";
import { STAGES, type Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS, StatusDot } from "@/components/status-dot";
import { TagDot } from "@/components/tag-chip";

const STATUS_ORDER: StatusKind[] = ["reply", "chase", "quiet", "waiting", "stale"];

function newId() {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Airtable-style filter: a button that opens a panel of "where Field is Value"
 * rows. The button tints and names the fields while a filter is on.
 */
export function FilterPopover({
  conditions,
  onChange,
  tags,
  counts,
}: {
  conditions: Condition[];
  onChange: (next: Condition[]) => void;
  tags: Tag[];
  counts: Record<StatusKind, number>;
}) {
  const active = activeConditions(conditions);
  const fieldLabel = (f: FilterField) => FILTER_FIELDS.find((x) => x.id === f)?.label ?? f;
  const label = active.length
    ? `Filtered by ${[...new Set(active.map((c) => fieldLabel(c.field)))].join(", ")}`
    : "Filter";

  function update(id: string, patch: Partial<Condition>) {
    onChange(conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function remove(id: string) {
    onChange(conditions.filter((c) => c.id !== id));
  }
  function add() {
    onChange([...conditions, { id: newId(), field: "status", op: "is", value: "" }]);
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              aria-pressed={active.length > 0}
              className={cn(active.length && "bg-foreground text-background hover:bg-foreground/85 hover:text-background")}
            >
              <ListFilter />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-[560px] p-3">
        <div className="mb-2 text-xs text-muted-foreground">
          {conditions.length ? "Show conversations where" : "No filter. Add a condition to narrow the list."}
        </div>

        <div className="flex flex-col gap-2">
          {conditions.map((c, i) => (
            <div key={c.id} className="grid grid-cols-[52px_1fr_96px_1fr_28px] items-center gap-2">
              <span className="text-right text-xs text-muted-foreground">{i === 0 ? "where" : "and"}</span>

              <Select value={c.field} onValueChange={(field) => update(c.id, { field: field as FilterField, value: "" })}>
                <SelectTrigger size="sm" className="w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_FIELDS.map((f) => (
                    <SelectItem key={f.id} value={f.id} className="text-xs">
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={c.op} onValueChange={(op) => update(c.id, { op: op as FilterOp })}>
                <SelectTrigger size="sm" className="w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="is" className="text-xs">is</SelectItem>
                  <SelectItem value="is_not" className="text-xs">is not</SelectItem>
                </SelectContent>
              </Select>

              <ValueSelect condition={c} tags={tags} counts={counts} onChange={(value) => update(c.id, { value })} />

              <Button variant="ghost" size="icon-xs" aria-label="Remove condition" onClick={() => remove(c.id)}>
                <X />
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between border-t pt-2">
          <Button variant="ghost" size="sm" onClick={add}>
            <Plus />
            Add condition
          </Button>
          {conditions.length > 0 && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onChange([])}>
              Clear all
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ValueSelect({
  condition,
  tags,
  counts,
  onChange,
}: {
  condition: Condition;
  tags: Tag[];
  counts: Record<StatusKind, number>;
  onChange: (value: string) => void;
}) {
  const c = condition;
  return (
    <Select value={c.value || undefined} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-full text-xs">
        <SelectValue placeholder="Choose" />
      </SelectTrigger>
      <SelectContent>
        {c.field === "status" &&
          STATUS_ORDER.map((k) => (
            <SelectItem key={k} value={k} className="text-xs">
              <StatusDot kind={k} />
              {STATUS[k].label}
              <span className="text-muted-foreground">{counts[k]}</span>
            </SelectItem>
          ))}
        {c.field === "tag" &&
          (tags.length ? (
            tags.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                <TagDot color={t.color} />
                {t.label}
              </SelectItem>
            ))
          ) : (
            <SelectItem value="__none" disabled className="text-xs">
              No tags yet
            </SelectItem>
          ))}
        {c.field === "stage" &&
          STAGES.map((s) => (
            <SelectItem key={s.id} value={s.id} className="text-xs">
              {s.label}
            </SelectItem>
          ))}
        {c.field === "starred" && (
          <>
            <SelectItem value="yes" className="text-xs">Starred</SelectItem>
            <SelectItem value="no" className="text-xs">Not starred</SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
