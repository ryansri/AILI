"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { logMessage } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Paste what the prospect wrote on LinkedIn so AILI knows they replied. */
export function LogReplyDialog({
  open,
  onOpenChange,
  personId,
  personName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  personName: string;
}) {
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");

  function save() {
    start(async () => {
      try {
        await logMessage({ personId, direction: "in", body });
        toast.success(`Logged ${personName.split(" ")[0]}'s reply.`);
        setBody("");
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not log the reply.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log their reply</DialogTitle>
          <DialogDescription>
            Paste what {personName} wrote. Any reply stops the follow-up sequence and moves them to
            Reply needed.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="Their message"
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !body.trim()}>
            Log reply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
