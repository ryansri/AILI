"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { setTimeZone } from "@/lib/client-actions";
import { offsetLabel } from "@/lib/time-zone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Row } from "./settings-parts";

const COMMON = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Adelaide",
  "Australia/Perth",
  "Pacific/Auckland",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
];

function city(zone: string) {
  return zone.split("/").pop()!.replace(/_/g, " ");
}

function allZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? COMMON;
  } catch {
    return COMMON;
  }
}

/**
 * Settings, Account: the time zone for scheduling and the content plan.
 * Automatic follows the browser; a picked one stays put, e.g. when travelling.
 */
export function TimeZoneRow({ zone, auto }: { zone: string; auto: boolean }) {
  const [value, setValue] = useState(auto ? "auto" : zone);
  const [pending, start] = useTransition();
  const zones = useMemo(() => {
    const rest = allZones().filter((z) => !COMMON.includes(z));
    return [...COMMON, ...rest];
  }, []);
  const now = new Date();

  return (
    <Row title="Time zone" status={`Scheduled posts, your plan and "Tuesday 9am" in Claude use this. Now ${offsetLabel(now, zone)}.`}>
      <Select
        value={value}
        disabled={pending}
        onValueChange={(next) => {
          const previous = value;
          setValue(next);
          const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
          start(async () => {
            try {
              await setTimeZone(next, browser);
              toast.success(next === "auto" ? `Time zone: automatic (${city(browser)}).` : `Time zone: ${city(next)}.`);
            } catch (err) {
              setValue(previous);
              toast.error(err instanceof Error ? err.message : "That did not save.");
            }
          });
        }}
      >
        <SelectTrigger aria-label="Time zone" className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" className="max-h-80">
          <SelectItem value="auto">Automatic: {city(zone)}</SelectItem>
          {zones.map((z) => (
            <SelectItem key={z} value={z}>
              {city(z)} <span className="text-muted-foreground">({z.split("/")[0]})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  );
}
