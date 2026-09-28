-- For a new conversation you started on LinkedIn, AILI asks whether the
-- person is a lead instead of deciding. Added as a column: rebuilding the
-- Person table would cascade-delete its messages on Turso.
ALTER TABLE "Person" ADD COLUMN "askLead" BOOLEAN NOT NULL DEFAULT false;
