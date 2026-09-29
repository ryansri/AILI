-- One status, in plain words. Only stages still carrying the old default name
-- are renamed; a name the user chose stays.
UPDATE "Stage" SET "label" = 'Not connected' WHERE "key" = 'warming' AND "label" = 'Warming up';
UPDATE "Stage" SET "label" = 'Talking' WHERE "key" = 'conversation' AND "label" = 'In conversation';
UPDATE "Stage" SET "label" = 'Call booked' WHERE "key" = 'call' AND "label" = 'Call earned';
UPDATE "Stage" SET "label" = 'Client' WHERE "key" = 'won' AND "label" = 'Won';
UPDATE "Stage" SET "label" = 'Not a fit' WHERE "key" = 'lost' AND "label" = 'Lost';
