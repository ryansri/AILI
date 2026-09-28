"use client";

import { useRef, useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { updateDailyCap, updateNotifyReplies } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Group, Row, SettingsPage } from "./settings-parts";

const MIN = 1;
const MAX = 100;

/** Settings, Sending: how many messages a day, and reply notifications. Both save as you change them. */
export function SendingView({ dailyCap, sentToday, notifyReplies }: { dailyCap: number; sentToday: number; notifyReplies: boolean }) {
  const [cap, setCap] = useState(dailyCap);
  const [notify, setNotify] = useState(notifyReplies);
  const [, start] = useTransition();
  const timer = useRef<number | undefined>(undefined);

  function changeCap(next: number) {
    const value = Math.max(MIN, Math.min(MAX, next));
    setCap(value);
    // Save once the clicking stops.
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      start(async () => {
        try {
          await updateDailyCap(value);
          toast.success(`Daily limit: ${value} messages.`);
        } catch {
          toast.error("That did not save.");
        }
      });
    }, 700);
  }

  return (
    <SettingsPage title="Sending" lead="How much goes out, and when AILI tells you about replies.">
      <Group>
        <Row title="Daily limit" status={`Messages a day, sent and queued. ${sentToday} of ${cap} used today.`}>
          <div className="flex h-8 items-center overflow-hidden rounded-md border" role="group" aria-label="Daily limit">
            <Button variant="ghost" size="icon-sm" className="rounded-none" aria-label="Fewer" disabled={cap <= MIN} onClick={() => changeCap(cap - 1)}>
              <Minus />
            </Button>
            <span className="w-11 border-x text-center text-md leading-8 font-semibold tabular-nums" aria-live="polite">
              {cap}
            </span>
            <Button variant="ghost" size="icon-sm" className="rounded-none" aria-label="More" disabled={cap >= MAX} onClick={() => changeCap(cap + 1)}>
              <Plus />
            </Button>
          </div>
        </Row>
        <Row title="Reply notifications" status="A desktop notice when someone replies, while Chrome is open.">
          <Switch
            aria-label="Reply notifications"
            checked={notify}
            onCheckedChange={(next) => {
              setNotify(next);
              start(async () => {
                try {
                  await updateNotifyReplies(next);
                  toast.success(next ? "Reply notifications on." : "Reply notifications off.");
                } catch {
                  setNotify(!next);
                  toast.error("That did not save.");
                }
              });
            }}
          />
        </Row>
      </Group>
      <p className="text-xs leading-relaxed text-muted-foreground">
        LinkedIn is fine with a handful of messages a day, not hundreds. No notification on a Mac? Allow Chrome in System
        Settings, Notifications.
      </p>
    </SettingsPage>
  );
}
