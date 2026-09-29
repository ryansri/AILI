"use client";

import { useRef, useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { PLAN_WARNING_DAYS } from "@/lib/plan";
import { setAlertSettings, setInviteSettings, setPlanWarning, updateDailyCap, updateFirstCommentDelay, updateNotifyReplies } from "@/lib/client-actions";
import { INVITE_CAPS, STALE_DAYS } from "@/lib/invites";
import { ALERTS_PER_DAY, TOUCHES_TO_CONNECT } from "@/lib/alerts";
import type { Account } from "@/lib/types";
import { delayLabel, FIRST_COMMENT_DELAYS } from "@/lib/linkedin-text";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Group, Row, SettingsPage } from "./settings-parts";

const MIN = 1;
const MAX = 100;

/**
 * Settings, Sending: messages a day, reply notifications, connection requests,
 * and when a post's first comment follows. All save as you change them.
 */
export function SendingView({
  dailyCap,
  sentToday,
  notifyReplies,
  firstCommentDelay,
  runwayAlertDays,
  invites,
  alerts,
}: {
  dailyCap: number;
  sentToday: number;
  notifyReplies: boolean;
  firstCommentDelay: number;
  runwayAlertDays: number;
  invites: Account["invites"];
  alerts: Account["alerts"];
}) {
  const [cap, setCap] = useState(dailyCap);
  const [notify, setNotify] = useState(notifyReplies);
  const [delay, setDelay] = useState(String(firstCommentDelay));
  const [runway, setRunway] = useState(String(runwayAlertDays));
  const [inviteCap, setInviteCap] = useState(String(invites.cap));
  const [accepts, setAccepts] = useState(invites.notifyAccepts);
  const [staleDays, setStaleDays] = useState(String(invites.staleDays));
  const [nudge, setNudge] = useState(alerts.nudge);
  const [perDay, setPerDay] = useState(String(alerts.perDay));
  const [needed, setNeeded] = useState(String(alerts.touchesToConnect));

  function saveAlerts(input: Parameters<typeof setAlertSettings>[0], done: string, undo: () => void) {
    start(async () => {
      try {
        await setAlertSettings(input);
        toast.success(done);
      } catch (e) {
        undo();
        toast.error(e instanceof Error ? e.message : "That did not save.");
      }
    });
  }

  function saveInvites(input: Parameters<typeof setInviteSettings>[0], done: string, undo: () => void) {
    start(async () => {
      try {
        await setInviteSettings(input);
        toast.success(done);
      } catch (e) {
        undo();
        toast.error(e instanceof Error ? e.message : "That did not save.");
      }
    });
  }
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
    <SettingsPage title="Sending" lead="Messages, connection requests, replies and posts: how much goes out, and when.">
      <h2 className="-mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Messages</h2>
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
      <h2 className="-mb-1 mt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Connection requests</h2>
      <Group>
        <Row title="Requests a day" status={`Separate from messages. ${invites.today} sent today, ${invites.week} in the last 7 days.`}>
          <Select
            value={inviteCap}
            onValueChange={(value) => {
              const previous = inviteCap;
              setInviteCap(value);
              saveInvites({ cap: Number(value) }, `Up to ${value} requests a day.`, () => setInviteCap(previous));
            }}
          >
            <SelectTrigger aria-label="Requests a day" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {INVITE_CAPS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} a day
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row title="When someone accepts" status="A desktop notice with Say hello, for leads, while Chrome is open.">
          <Switch
            aria-label="Notice when someone accepts"
            checked={accepts}
            onCheckedChange={(next) => {
              setAccepts(next);
              saveInvites({ notifyAccepts: next }, next ? "Accept notices on." : "Accept notices off.", () => setAccepts(!next));
            }}
          />
        </Row>
        <Row title="Old requests" status="Requests waiting longer than this show in amber under Request sent, with Withdraw.">
          <Select
            value={staleDays}
            onValueChange={(value) => {
              const previous = staleDays;
              setStaleDays(value);
              saveInvites({ staleDays: Number(value) }, `Requests count as old after ${Number(value) / 7} weeks.`, () => setStaleDays(previous));
            }}
          >
            <SelectTrigger aria-label="Old requests" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {STALE_DAYS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  After {d / 7} weeks
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Group>
      <p className="text-xs leading-relaxed text-muted-foreground">
        LinkedIn allows roughly 100 requests a week. Each one is your click in AILI, sent from your Chrome.
      </p>
      <h2 className="-mb-1 mt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Post alerts</h2>
      <Group>
        <Row title="Morning reminder" status="At 9 am, a desktop notice with leads to tap the bell for on LinkedIn.">
          <Switch
            aria-label="Morning reminder"
            checked={nudge}
            onCheckedChange={(next) => {
              setNudge(next);
              saveAlerts({ nudge: next }, next ? "Morning reminder on." : "Morning reminder off.", () => setNudge(!next));
            }}
          />
        </Row>
        <Row title="How many a day" status="A few a day looks like ordinary use of LinkedIn.">
          <Select
            value={perDay}
            onValueChange={(value) => {
              const previous = perDay;
              setPerDay(value);
              saveAlerts({ perDay: Number(value) }, `${value} leads a day.`, () => setPerDay(previous));
            }}
          >
            <SelectTrigger aria-label="How many a day" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {ALERTS_PER_DAY.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} a day
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row title="Comments before connecting" status="After this many comments on their posts, AILI says it's a good time to connect.">
          <Select
            value={needed}
            onValueChange={(value) => {
              const previous = needed;
              setNeeded(value);
              saveAlerts({ touchesToConnect: Number(value) }, `${value} comments before connecting.`, () => setNeeded(previous));
            }}
          >
            <SelectTrigger aria-label="Comments before connecting" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {TOUCHES_TO_CONNECT.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} comments
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Group>
      <p className="text-xs leading-relaxed text-muted-foreground">
        AILI never taps the bell or comments for you. It reminds you, and the Chrome helper notices when you tap the bell.
      </p>
      <h2 className="-mb-1 mt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Posts</h2>
      <Group>
        <Row title="First comment" status="When a post has a first comment, it goes up this long after the post.">
          <Select
            value={delay}
            onValueChange={(value) => {
              const previous = delay;
              setDelay(value);
              start(async () => {
                try {
                  await updateFirstCommentDelay(Number(value));
                  toast.success(`First comment: ${delayLabel(Number(value)).toLowerCase()} the post.`);
                } catch {
                  setDelay(previous);
                  toast.error("That did not save.");
                }
              });
            }}
          >
            <SelectTrigger aria-label="First comment timing" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {FIRST_COMMENT_DELAYS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {delayLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row title="Plan warning" status="Warn me when a planned post is not written, or not scheduled, this many days before its day. 3 days to start with.">
          <Select
            value={runway}
            onValueChange={(value) => {
              const previous = runway;
              setRunway(value);
              start(async () => {
                try {
                  await setPlanWarning(Number(value));
                  toast.success(value === "0" ? "Plan warning off." : `Plan warning: ${value} ${value === "1" ? "day" : "days"} before.`);
                } catch {
                  setRunway(previous);
                  toast.error("That did not save.");
                }
              });
            }}
          >
            <SelectTrigger aria-label="Plan warning" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {PLAN_WARNING_DAYS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d === 0 ? "Off" : `${d} ${d === 1 ? "day" : "days"} before`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Group>
    </SettingsPage>
  );
}
