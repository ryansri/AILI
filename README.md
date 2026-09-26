# AILI

An organised inbox and follow-up tracker for LinkedIn outreach. AILI shows every
conversation with one clear next step, tells you who to reply to and who to chase
today, and keeps sends human-clicked and capped so the account stays safe.

## Status

Step 1 of 4: app shell and inbox running on sample data. Nothing connects to
LinkedIn yet.

| Step | What it adds | State |
| --- | --- | --- |
| 1 | Rail, sidebar, Notion-grey theme, inbox with next-step engine on mock data | Done |
| 2 | Database, people table, tags, snooze, notes, Today page | Next |
| 3 | Chrome helper (forked from inflow) and live inbox sync, human-click sending | |
| 4 | AI drafting with Claude or ChatGPT, official LinkedIn posting | |

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. It redirects to `/inbox`.

Other scripts:

```bash
npm run typecheck   # generates Next route types, then tsc
npm run lint
npm test            # vitest, covers the next-step engine
npm run build
```

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
- Geist Sans and Geist Mono
- Vitest for unit tests

## Layout

```
src/
  app/
    (app)/            sections behind the icon rail
      inbox/          the inbox
      people/ posts/ today/ settings/   placeholders for later steps
  components/
    shell/rail.tsx    left icon rail
    inbox/            sidebar, people list, conversation pane, details panel
    ui/               shadcn components
    status-dot.tsx    the four status colours
    tag-chip.tsx
  lib/
    next-step.ts      the follow-up engine
    types.ts          Person, Message, Tag, Stage
    mock/data.ts      sample people until live sync exists
```

## Design rules

White page, stone-50 panels, stone-800 text, stone-500 muted text, stone-200
borders, 6px radius, no shadows, one near-black primary button. Colour is used
only for the status dot and tag dots. Every send is a human click; there is no
auto-send and there will not be one.
