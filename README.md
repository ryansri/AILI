# AILI

An organised inbox and follow-up tracker for LinkedIn outreach. AILI shows every
conversation with one clear next step, tells you who to reply to and who to chase
today, and keeps sends human-clicked and capped so the account stays safe.

## Status

Step 3 of 4. Login, a Chrome helper that syncs your real LinkedIn inbox and
delivers the messages you click Send on, and a Settings page.

| Step | What it adds | State |
| --- | --- | --- |
| 1 | Rail, sidebar, Notion-grey theme, inbox with the next-step engine | Done |
| 2 | Database, people you can add and edit, tags, notes, snooze, manual send and reply logging, People and Today pages | Done |
| 3 | Login, Chrome helper (LinkedIn client adapted from inflow), live inbox sync, sends delivered by the helper, Settings | Done |
| 4 | AI drafting with Claude or ChatGPT, official LinkedIn posting | Next |

## Run it

```bash
npm install          # also generates the Prisma client
npm run db:push      # creates prisma/dev.db (SQLite)
npm run db:seed      # loads eight sample people so there is something to click
npm run helper:build # bundles the Chrome helper into extension/dist
npm run dev          # also syncs the database layout and rebuilds the helper
```

Open http://localhost:3000. The first visit asks you to create your account.
After that it is a normal login.

On a Mac, `scripts/setup-mac.sh` does all of the above in one go.

No `.env` file is needed for local use. To point at another database, copy
`.env.example` to `.env` and change `DATABASE_URL`. Set `AUTH_SECRET` to any
long random string when you host it; locally a random one is kept in
`prisma/.auth-secret`.

Other scripts:

```bash
npm run typecheck   # generates Next route types, then tsc
npm run lint
npm test            # vitest: next-step engine, auth, sync parsing, LinkedIn response parsing
npm run build       # helper bundle plus the Next.js production build
npm run db:seed     # wipes and reloads the sample data
npm run reset:conversations -- you@example.com --yes  # clears one account's people and messages to re-import
npm run reset:conversations -- you@example.com --all --yes  # also tags, templates and stages: a fresh account, same login
```

## The Chrome helper

The helper is the bridge to LinkedIn. Without it, AILI still works in manual
mode: you copy each message, paste it into LinkedIn, and log replies by hand.

1. `npm run helper:build`, then open `chrome://extensions`, turn on Developer
   mode, Load unpacked, choose `extension/dist`.
2. Log in to LinkedIn in Chrome.
3. In AILI go to Settings, copy the helper token. Click the AILI helper icon in
   Chrome, paste `http://localhost:3000` and the token, press Connect.

After a `git pull` that changes the helper, start AILI with `npm run dev`
(it rebuilds `extension/dist`), then press the reload arrow on AILI helper in
`chrome://extensions`. If an old helper is still loaded, Settings, the inbox
footer and the status dot all say it is out of date. Bump the version in both
`extension/manifest.json` and `src/lib/helper-version.ts` when the helper changes.

On first connect the helper imports your history, one inbox page a minute,
back to conversations 180 days old. From then on, once a minute while Chrome
is open:

- new conversations and replies appear in AILI on their own,
- a message you clicked Send on in AILI is delivered from your LinkedIn
  account, one per minute, never more than the daily cap,
- the sidebar shows when the helper last synced,
- a new reply pops up as a desktop notification (up to three, then one
  summary). Clicking it opens that conversation in AILI. Turn it off in
  Settings, Notifications. The history import does not notify, and neither
  does a reply older than six hours. On a Mac, Chrome also needs to be allowed
  in System Settings, Notifications.

AILI itself always says what sync is doing:

- Before anything has synced, the inbox shows a setup card that ticks its own
  steps: helper installed (AILI asks the page script the helper adds to the
  AILI page only), connected with your token (with Copy buttons for the
  address and token), LinkedIn logged in. In Safari or Firefox it says to open
  AILI in Chrome.
- During the first import, a progress card shows how many conversations are
  in, which inbox and page is next, and how many are leads or in Other. The
  page refreshes itself every few seconds while setting up or importing.
- After that, one line at the top of the list: "Synced 1m ago" when all is
  well, amber with the reason and the fix when not (sync stopped, LinkedIn
  logged out, slowed down by LinkedIn, helper out of date, an error). The dot
  on the icon rail matches it.

The helper never sends anything you did not click. Details and the risk note
are in `extension/README.md`.

## What you can do

- **Inbox.** A sidebar next to the icon rail picks who the list shows: All,
  Now, Waiting, Starred, any tag or any stage, each with a count. Now is
  grouped the way an outreach expert works it: They replied, New connections,
  Follow up today, Last try. Tag and stage views use the same groups plus
  Waiting and Older. Every group folds. One header spans the sidebar and the
  list, with a small breadcrumb for the view (Inbox › Waiting). The icon
  before "Inbox" hides the sidebar; the icon at the right of the conversation header shows the
  details. Both are remembered. Search and an Airtable-style filter narrow
  whatever is open.
- **Leads and Other.** Only leads count: they are in All, Now, Waiting,
  People, the funnel, the Inbox badge and every number. Everyone else synced
  from LinkedIn sits in **Other** at the bottom of the views. Their whole
  conversation is there and you reply as normal; they just are not tracked.
  **Track as lead** (in the conversation, or the helper popup on their
  profile) asks for a stage and tag and brings them in. The more menu on a
  lead, or **Not leads** on ticked rows in People, moves them to Other.
  Who starts as a lead: anyone you added (by hand, Import, the helper popup),
  tagged, starred, moved to a stage or acted on in AILI, and anyone you wrote
  to first. People who wrote to you first start in Other. People already in
  AILI are sorted by the same rule once. Desktop notifications and profile
  lookups are for leads only.
- **Tags and stages.** Add a tag (name and colour) or a stage from the plus in
  the sidebar. Hover a tag for its ••• menu to rename, recolour or delete it;
  deleting takes it off everyone and keeps the people. Stages have the same
  menu: rename, or delete after picking where their people go. Warming up,
  Request sent, Connected and In conversation drive AILI's rules, so they can
  be renamed but not deleted. Drag stages to reorder them; the order is used
  everywhere.
- **Done.** Hover a row or press E. Nothing more to do until they write
  back; the person moves to Waiting. Reopen puts them back.
- **Keyboard.** J and K move, R focuses the composer, E is done, S opens
  snooze, Cmd+Enter sends.
- **Next step card.** Above the composer: what to do and why, with Not now
  (snooze) and Draft with AI.
- **Send.** Type a message, press Send. With the helper connected it is
  delivered from your account. Without it, AILI copies the message, opens
  their profile, and logs it once you confirm. Follow-ups are numbered
  automatically. Send greys out at the daily cap.
- **Templates.** Save messages in Settings, Templates. {first_name},
  {name}, {company} and {title} fill in for each person; the Insert buttons put
  them at the cursor. In a conversation, the page icon left of the message box
  fills a template in for that person to edit before sending. If a field is
  empty for someone, it is left out and AILI says so.
- **Message all.** In a tag or stage view, Message all writes one message for
  everyone shown (search and filter narrow who). Pick a template or write it,
  step through the preview person by person, then queue it. People not matched
  on LinkedIn yet, or with a message already waiting, are skipped, and it stops
  at the daily cap. The helper still sends one a minute, and each queued
  message can be cancelled from its conversation until it goes.
- **Replies.** Synced by the helper, or pasted in by hand. Either way the
  sequence stops and they move to Reply needed.
- **Snooze.** 3 days to a quarter, or pick a date.
- **Details.** Stage, tags, notes, edit the person. The more menu marks call
  earned, won, lost, or archives.
- **People.** The tracking page. On top, your funnel: every stage in your
  order with how many people reached it, the rate from the step before, how
  many are there now, and Lost on its own. Narrow it to a tag or to people
  added in the last 7, 30 or 90 days. One line names the biggest drop and
  shows the people stuck there. Click a stage to list who is in it now. The
  table shows stage, tags, last touch, messages sent and received, and days in
  stage (sort by it to find who has stalled); click a row to open the
  conversation. Tick rows to Message all, Add tag, Move to stage or Archive.
  Import takes a CSV, including LinkedIn's own Connections export, and skips
  anyone already in AILI.
  Or add people one at a time from LinkedIn: on their profile, click the AILI
  helper icon in Chrome, pick a stage and tag, and press Add to AILI.
  "Reached" is worked out from each person's current stage plus what their
  record proves (request and connect dates, messages, a reply). People the
  helper imported only count as In conversation once they have replied.
- **Today.** Reply, chase, decide, withdraw old requests, warm up.
- **Settings.** Helper token and status, daily cap, templates, notifications,
  your account, log out.

## How the inbox decides the next step

`src/lib/next-step.ts` is a pure function that reads a person's messages and
returns one of four states. The rules come from the outreach playbook.

| Colour | State | Rule |
| --- | --- | --- |
| Red | Reply needed | They wrote last, or they accepted and you have not messaged |
| Amber | Chase today | You wrote last and follow-up 1 (day 4) or follow-up 2 (day 9) is due, or a snooze ended |
| Violet | Gone quiet | Two follow-ups sent and five more silent days |
| Blue | Waiting | You wrote last and nothing is due yet, the person is snoozed, or you pressed Done |
| Grey | Older | Nothing from either side, and no action by you, for 30 days |

Any reply from the prospect resets the sequence.

## Stack

- Next.js 16, React 19, TypeScript
- Tailwind CSS 4 with shadcn/ui components (Stone base, copied into
  `src/components/ui`)
- Prisma 6 with SQLite locally; the schema moves to Postgres by changing the
  datasource provider
- Chrome extension, Manifest V3, bundled with esbuild
- Geist Sans and Geist Mono
- Vitest for unit tests

## Layout

```
extension/
  manifest.json, popup.html, build.mjs
  src/background.ts     once a minute: deliver outbox, sync inbox, report status
  src/popup.ts          pairing and status
  src/aili.ts           calls to the AILI server
  src/linkedin/         Voyager client, encoding, parsing (adapted from inflow)
prisma/
  schema.prisma         Workspace, Person, Stage, Tag, PersonTag, Message, Outbox, Template
  seed.ts, seed-data.ts
scripts/setup-mac.sh
src/
  proxy.ts              sends logged-out visitors to /login
  app/
    login/              first-run registration and login
    (app)/              inbox, people, today, settings, posts (placeholder)
    api/helper/         sync, status, outbox routes the helper calls
  components/
    shell/rail.tsx      left icon rail with the Now count badge and helper dot
    inbox/              sidebar (views, tags, stages), people list, conversation
                        pane, details panel, send dialog, log-reply dialog, snooze menu
    people/             funnel, people table and bulk bar, import, add/edit dialog, tag picker
    settings/           settings page
    templates/          template editor, picker, settings list, Message all dialog
    ui/                 shadcn components
  lib/
    next-step.ts        the follow-up engine
    rows.ts             sorting shared by inbox, people and today
    data.ts             database reads for the logged-in workspace
    actions.ts          server actions (writes), including the send queue
    auth.ts             passwords and session cookies
    helper-sync.ts      applies what the helper saw to the database
    funnel.ts           who reached each stage, rates, the biggest drop
    leads.ts            who starts as a lead and who starts in Other
    csv.ts              reads CSV imports, including LinkedIn's Connections export
    templates.ts        fills {first_name} and the other fields for a person
    types.ts            Person, Message, Tag, Stage, Account
```

## Design rules

White page, stone-50 panels, stone-800 text, stone-500 muted text, stone-200
borders, 6px radius, no shadows, one near-black primary button. Colour is used
only for the status dot and tag dots. Every send is a human click; there is no
auto-send and there will not be one.
