"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { changePassword, moveEveryoneToOther, updateAccount } from "@/lib/client-actions";
import { logout } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Group, Row, SettingsPage } from "./settings-parts";
import { TimeZoneRow } from "./time-zone-row";

/** Settings, Account: name and email save when you leave the field; password in a small dialog; log out. */
export function AccountView({
  name: savedName,
  email: savedEmail,
  timeZone,
  timeZoneAuto,
}: {
  name: string;
  email: string;
  timeZone: string;
  timeZoneAuto: boolean;
}) {
  const [name, setName] = useState(savedName);
  const [email, setEmail] = useState(savedEmail);
  const [saved, setSaved] = useState({ name: savedName, email: savedEmail });
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [pending, start] = useTransition();

  function save() {
    if (name.trim() === saved.name && email.trim() === saved.email) return;
    start(async () => {
      try {
        await updateAccount({ name, email });
        setSaved({ name: name.trim(), email: email.trim() });
        toast.success("Saved.");
      } catch (err) {
        toast.error(err instanceof Error ? `${err.message}.` : "That did not save.");
      }
    });
  }

  return (
    <SettingsPage title="Account" lead="Your AILI login. Separate from LinkedIn.">
      <Group>
        <div className="flex flex-col gap-1.5 px-4 py-3.5">
          <Label htmlFor="account-name">Name</Label>
          <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={save} autoComplete="name" />
        </div>
        <div className="flex flex-col gap-1.5 px-4 py-3.5">
          <Label htmlFor="account-email">Email</Label>
          <Input
            id="account-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={save}
            autoComplete="email"
          />
        </div>
      </Group>
      <Group>
        <TimeZoneRow zone={timeZone} auto={timeZoneAuto} />
        <Row title="Password" status="Used to log in to AILI.">
          <Button size="sm" variant="outline" onClick={() => setPasswordOpen(true)}>
            Change password
          </Button>
        </Row>
      </Group>
      <Group>
        <Row title="Start Leads over" status="Moves everyone to Other. Stages, tags, notes and messages stay. Then add back the ones who are leads.">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Move everyone in Leads to Other? You can add each one back to Leads at any time.")) return;
              start(async () => {
                try {
                  const n = await moveEveryoneToOther();
                  toast.success(n ? `Moved ${n} ${n === 1 ? "person" : "people"} to Other.` : "Leads was already empty.");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "That did not work.");
                }
              });
            }}
          >
            Move everyone to Other
          </Button>
        </Row>
      </Group>
      <div>
        <Button variant="outline" disabled={pending} onClick={() => start(() => logout())}>
          Log out
        </Button>
      </div>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-sm">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              start(async () => {
                try {
                  await changePassword({ current: String(f.get("current")), next: String(f.get("next")) });
                  toast.success("Password changed.");
                  setPasswordOpen(false);
                } catch (err) {
                  toast.error(err instanceof Error ? `${err.message}.` : "That did not save.");
                }
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Change password</DialogTitle>
              <DialogDescription>At least 8 characters.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="current-password">Current password</Label>
              <Input id="current-password" name="current" type="password" autoComplete="current-password" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" name="next" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPasswordOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Change password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}
