# AILI

An organised inbox and follow-up tracker for LinkedIn outreach. AILI shows every
conversation with one clear next step, tells you who to reply to and who to chase
today, and keeps sends human-clicked and capped so the account stays safe.

## Status

Step 2 of 4. The app runs on a local database with real people, tags, notes,
snooze, and a manual send-and-log flow. Nothing connects to LinkedIn yet.

| Step | What it adds | State |
| --- | --- | --- |
| 1 | Rail, sidebar, Notion-grey theme, inbox with the next-step engine | Done |
| 2 | Database, people you can add and edit, tags, notes, snooze, manual send and reply logging, People and Today pages | Done |
| 3 | Chrome helper (forked from inflow) and live inbox sync, human-click sending, login | Next |
| 4 | AI drafting with Claude or ChatGPT, official LinkedIn posting | |

## Run it

```bash
npm install          # also generates the Prisma client
npm run db:push      # creates prisma/dev.db (SQLite)
npm run db:seed      # loads eight sample people so there is something to click
npm run dev
```

Open http://localhost:3000. It redirects to `/inbox`.

No `.env` file is needed for local use. To point at another database, copy
`.env.example` to `.env` and change `DATABASE_URL`.

Other scripts:

```bash
npm run typecheck   # generates Next route types, then tsc
npm run lint
npm test            # vitest, covers the next-step engine
npm run build
npm run db:seed     # wipes and reloads the sample data
```

## What you can do today

- **Inbox.** Four colour lists, tag filters, search, sort. Pick a person, read
  the thread, see the next step in words.
- **Send.** Type a message, press Send. AILI copies it, opens their LinkedIn
  profile, and logs it once you confirm you sent it. Follow-ups are numbered
  automatically. The daily cap greys out Send when reached.
- **Log their reply.** Paste what they wrote. The sequence stops and they move
  to Reply needed.
- **Snooze.** 3 days to a quarter, or pick a date. They come back on that day.
- **Details.** Change stage, add or create tags, write notes, edit the person.
  The more menu marks call earned, won, lost, or archives.
- **People.** Everyone as a table with stage and tag filters. Add a person by
  hand until the Chrome helper does it for you.
- **Today.** Reply, chase, decide, withdraw old requests, warm up. One page
  each morning.

## How the inbox decides the next step

`src/lib/next-step.ts` is a pure function that reads a person's messages and
returns one of four states. The rules come from the outreach playbook.

| Colour | State | Rule |
| --- | --- | --- |
| Red | Reply needed | They wrote last, or they accepted and you have not messaged |
| Amber | Chase today | You wrote last and follow-up 1 (day 4) or follow-up 2 (day 9) is due, or a snooze ended |
| Violet | Gone quiet | Two follow-ups sent and five more silent days |
| Blue | Waiting | You wrote last and nothing is due yet, or the person is snoozed |

Any reply from the prospect resets the sequence. The tests in
`src/lib/next-step.test.ts` spell out each rule.

## Stack

- Next.js 16, React 19, TypeScript
- Tailwind CSS 4 with shadcn/ui components (Stone base, copied into
  `src/components/ui`)
- Prisma 6 with SQLite locally; the schema moves to Postgres by changing the
  datasource provider
- Geist Sans and Geist Mono
- Vitest for unit tests

## Layout

```
prisma/
  schema.prisma       Workspace, Person, Tag, PersonTag, Message
  seed.ts, seed-data.ts
src/
  app/
    (app)/            sections behind the icon rail
      inbox/ people/ today/   live pages
      posts/ settings/        placeholders for later steps
  components/
    shell/rail.tsx    left icon rail
    inbox/            sidebar, people list, conversation pane, details panel,
                      send dialog, log-reply dialog, snooze menu
    people/           people table, add/edit dialog, tag picker
    ui/               shadcn components
  lib/
    next-step.ts      the follow-up engine
    rows.ts           sorting shared by inbox, people and today
    data.ts           database reads
    actions.ts        server actions (writes)
    types.ts          Person, Message, Tag, Stage
```

## Design rules

White page, stone-50 panels, stone-800 text, stone-500 muted text, stone-200
borders, 6px radius, no shadows, one near-black primary button. Colour is used
only for the status dot and tag dots. Every send is a human click; there is no
auto-send and there will not be one.
