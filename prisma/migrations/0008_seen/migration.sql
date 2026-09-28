-- Read receipts: when the other person last read the conversation on LinkedIn.
-- Added as columns: rebuilding the Person table would cascade-delete its messages on Turso.
ALTER TABLE "Person" ADD COLUMN "seenAt" DATETIME;
ALTER TABLE "Person" ADD COLUMN "seenCheckedAt" DATETIME;
