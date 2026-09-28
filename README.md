# AILI

An organised inbox and follow-up tracker for LinkedIn outreach. AILI shows every
conversation with one clear next step, tells you who to reply to and who to chase
today, and keeps sends human-clicked and capped so the account stays safe.

## Status

Step 4 of 4. Login, a Chrome helper that syncs your real LinkedIn inbox and
delivers the messages you click Send on, AILI inside Claude and ChatGPT, and
LinkedIn posts you can publish or schedule.

| Step | What it adds | State |
| --- | --- | --- |
| 1 | Rail, sidebar, Notion-grey theme, inbox with the next-step engine | Done |
| 2 | Database, people you can add and edit, tags, notes, snooze, manual send and reply logging, People and Today pages | Done |
| 3 | Login, Chrome helper (LinkedIn client adapted from inflow), live inbox sync, sends delivered by the helper, Settings | Done |
| 4 | AILI as a connector in Claude and ChatGPT (summaries, reply drafts, posts), Posts page, official LinkedIn posting and scheduling, articles opened in LinkedIn's editor | Done |

## Run it

```bash
npm install          # also generates the Prisma client
npm run db:push      # creates prisma/dev.db (SQLite)
npm run db:seed      # loads eight sample people so there is something to click
npm run helper:build # bundles the Chrome helper into extension/dist
npm run dev          # also syncs the database layout and rebuilds the helper
```

Open http://localhost:3000 and create your account. Anyone can sign up from
the log in screen; each account has its own separate inbox. Forgot your
password? With `RESEND_API_KEY` set, Forgot password emails a one-time link
(30 minutes); without it, `npm run reset:password -- you@example.com` prints
the link.

After sign up comes a full-screen setup of three steps, each moving on by
itself: install the extension (checked once when the page loads; if it is
missing, Install extension then Next, which reloads and checks again; once
found AILI connects it, nothing to paste), log in to LinkedIn (skipped if you
already are), sync. As soon as the
first conversations are in, "You are all set" opens the inbox; the rest keep
importing, shown in the line at the top of the list. Skip for now goes
straight to the app. The Install button opens the Chrome Web Store; set
`NEXT_PUBLIC_EXTENSION_URL` to the extension's store page once it is published.

The extension runs in Chrome, Edge, Brave, Arc, Opera and Vivaldi on a
computer. Safari, Firefox and phones get "Open AILI in Chrome" during setup.
Once set up, AILI works in any browser: syncing happens in Chrome, so with
Chrome open it stays current; with Chrome closed the top line says when it
last synced, and replies wait in the queue until Chrome is open again.

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
npm run reset:password -- you@example.com  # prints a one-time link to set a new password
# After a reset the helper re-imports by itself: AILI tells it it has none of the history.
```

## Host it (Vercel + Turso)

Free to start: Vercel runs the app, Turso holds the database (SQLite in the
cloud, same schema). Vercel's free Hobby plan is for non-commercial use; move
to Pro once AILI earns money.

1. **Turso database.** In the Turso dashboard create a database (pick the
   region closest to your Vercel region), then copy its URL (`libsql://...`)
   and create a token. Or with the CLI: `turso db create aili`,
   `turso db show aili --url`, `turso db tokens create aili`.
2. **Copy your local data (optional).** On the computer that has
   `prisma/dev.db`:
   ```bash
   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:copy          # shows what it would copy
   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:copy -- --yes # copies it
   ```
   It creates the tables and copies accounts, people, messages, tags, stages
   and templates. It refuses if Turso already has accounts. Skip it to start
   empty.
3. **Vercel project.** Add New, Project, import this GitHub repository. Before
   Deploy, add Environment Variables:
   - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`: from step 1
   - `AUTH_SECRET`: any long random string (`openssl rand -base64 32`)
   - `APP_URL`: the site's address, e.g. `https://aili.vercel.app` (add it
     after the first deploy shows the address, then redeploy)
   - optional `RESEND_API_KEY`, `RESEND_FROM` for password reset emails.
     Resend's test sender `onboarding@resend.dev` only delivers to your own
     Resend email; verify a domain to email anyone.
   Deploy. Each build runs `db:deploy`, which creates or updates the Turso
   tables, so schema changes go out with the code.
4. **Point the extension at it.** Add `AILI_URL=https://your-address` to
   `.env` (or put it in front of the command), run `npm run helper:build`, and
   press the reload arrow on the AILI helper in `chrome://extensions`. Then open
   your hosted AILI and log in; it connects the extension by itself. The
   extension talks only to that exact address and localhost, never a wildcard.

## Claude, ChatGPT and LinkedIn posts

AILI is an MCP connector: people add it to Claude or ChatGPT and ask things
like "summarize my conversation with Rachel", "draft a reply and put it in
AILI", or "write a post about onboarding and schedule it for Tuesday 9am".
It runs on their own Claude or ChatGPT plan; AILI holds no AI key.

- **What it can do:** read conversations, save a draft in a conversation's
  message box, write, schedule and publish posts, save articles. It has no
  way to send a LinkedIn message: a draft waits, labelled "Draft from
  Claude", until you click Send in AILI.
- **Connect (each user, once):** Settings, Connections, Connect on the Claude or ChatGPT row shows the
  connector address, `https://your-address/mcp`.
  - Claude: Settings, Connectors, Add custom connector, paste the address,
    Connect, then Allow on AILI's screen.
  - ChatGPT: Settings, Apps and Connectors, turn on Developer mode, create a
    connector with the address, then Allow. (Custom connectors need a paid
    ChatGPT plan.)
  - Disconnect any time in Settings. Behind it is standard OAuth with PKCE
    and dynamic client registration; tokens are stored hashed.

**LinkedIn posting (once per AILI):** posts go out through LinkedIn's
official API, which needs a free LinkedIn developer app.

1. At https://developer.linkedin.com create an app (it needs a LinkedIn
   company page to attach to; any page you admin works).
2. Products: add **Sign In with LinkedIn using OpenID Connect** and **Share on
   LinkedIn**.
3. Auth: add the redirect URL `https://your-address/api/linkedin/callback`.
4. In Vercel add `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` (Secret)
   and redeploy. Then each user clicks Connect on the LinkedIn posting row in Settings, Connections. LinkedIn
   asks them to reconnect every 60 days; AILI shows when.

**Scheduled posts timer:** set `CRON_SECRET` in Vercel to a long random
string and redeploy. At https://cron-job.org (free) create a job that calls
`https://your-address/api/cron/posts?key=<CRON_SECRET>` every minute.
Scheduled posts and first comments then go out within a minute of their
time, with your computer off.

**First comment:** a post can carry a first comment (a link, say, so the post
itself is not shown less for linking out). AILI posts it under the post, as
you, a set time after the post goes live: Settings, Sending, First comment
(right away, or 1 to 30 minutes after). Claude and ChatGPT can set it too. If
LinkedIn refuses the comment, the post stays up and the comment shows "Not
posted" with Try again. Without it they still go out, but only while Chrome is open
with the extension (it checks in every minute).

**Content plan:** Content, Plan holds your 30, 60 or 90-day plan, one row
per post or article: a day and a topic, plus pillar, goal, hook and notes if
you have them. Bring it in from Excel (.xlsx) or CSV, paste rows straight from
a sheet, or ask Claude to add them (add_plan_rows); AILI guesses what each
column is and you check. A blank template is under •••. Each row's status
comes from its post, so nobody updates a status column: planned, written,
scheduled, posted, or missed when its day passes with nothing out. Skip a row
to take it out of the count; Mark as posted covers posts put up straight on
LinkedIn. Move or swap days from the row or by dragging in the calendar (a
scheduled post moves with its row). The Needs you box, and a bar across the
app, warn when a row due within the Plan warning (Settings, Sending, 3 days
to start with) is not written or not scheduled. Claude reads the plan with
get_plan, writes a row with create_post or save_article and its plan_row_id,
and changes rows with update_plan_row. Times use the account's time zone:
automatic from the browser, or picked in Settings, Account.

**Articles:** LinkedIn does not let apps publish articles. Claude or ChatGPT
saves them in AILI; Open in LinkedIn opens LinkedIn's article editor and the
extension fills in the title and text (they are also put on the clipboard in
case LinkedIn's editor changes). You publish or schedule it there, then mark
it as published in AILI.

Changing the database layout later: edit `prisma/schema.prisma`, run
`npm run db:migration -- short_name` to write the SQL into
`prisma/migrations`, commit it, and the next deploy applies it.

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
  Leads, the funnel, the Inbox badge and every number. Everyone else synced
  from LinkedIn sits in **Other** at the bottom of the views. Their whole
  conversation is there and you reply as normal; they just are not tracked.
  Leads are only the people you chose: anyone you added (by hand, Import,
  the helper popup) or moved there. Everyone synced from LinkedIn starts in
  Other, even when you wrote first, and nothing moves on its own. **Add to
  Leads** (in the conversation, or the helper popup on their profile) asks
  for a stage and tag and brings them in; the more menu on a lead, or **Not
  leads** on ticked rows in Leads, moves them to Other. When you start a new
  conversation on LinkedIn, the helper asks within a minute or two with a
  desktop notice (Add to Leads or Not a lead), and the conversation shows
  **Lead?** in Other until you answer. Settings, Account, Move everyone to
  Other starts Leads over. Reply notices and profile lookups are for leads only.
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
