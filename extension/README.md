# AILI helper (Chrome extension)

Syncs your LinkedIn inbox with AILI and delivers the messages you click Send
on. It never sends anything on its own.

## Install

```bash
npm run helper:build      # from the project root, creates extension/dist
```

1. Open `chrome://extensions`, turn on Developer mode, click Load unpacked and
   pick the `extension/dist` folder.
2. Log in to LinkedIn in Chrome.
3. Click the AILI helper icon, paste the AILI address (for local use,
   `http://localhost:3000`) and the helper token from AILI Settings, press
   Connect.

Rebuild and click the reload icon on `chrome://extensions` after pulling
changes.

## How it works

- Runs in the extension's background worker, kept quiet on purpose: LinkedIn
  restricts accounts when a tool reads too much. Every 15 minutes, 7 am to
  9 pm, it checks LinkedIn is logged in and delivers at most one queued
  message. Clicking Send or Sync now in AILI runs it straight away.
- On first connect it imports your history: one inbox page per check,
  Focused then Other, until it reaches conversations older than 180 days.
  The popup shows the count as it goes. Keep Chrome open.
- After that, each check re-reads the first page of your inbox (the Other
  inbox once an hour) and pushes anything with new activity to AILI.
- It never reads profiles in the background or your notifications. A profile
  is read once only when you click Connect or Send for someone AILI has no
  LinkedIn id for yet. "Add to AILI" reads the page you have open.
- At most 200 LinkedIn requests a day. If LinkedIn pushes back once (429),
  it stops for a day.
- Uses the LinkedIn cookies already in your browser. Nothing is copied
  elsewhere. Requests to LinkedIn carry those cookies through a
  declarativeNetRequest rule scoped to this extension only.
- **The popup** shows one thing at a time. On someone's LinkedIn profile:
  who it is, a Stage and a Tag (pick one, or New tag… to type one), and Add
  to AILI. It keeps your last pick. On your own profile it just says so. Clicking Add takes the name, headline
  and photo from the page you have open (no request to LinkedIn) and adds them
  to People. If they are already in AILI it says so and offers Open in AILI. If they
  are in Other (in AILI but not a lead), the same form says Track as lead.
  Anywhere else it says it is syncing. It only speaks up when something needs
  you, like LinkedIn being logged out. Sync now and Disconnect are the two icons
  at the top right. Nothing is added to LinkedIn's page: the popup only reads
  the tab's address and title.
- A tiny script runs only on the AILI page (localhost) to tell AILI the
  helper is installed, its version and whether it is connected. During
  onboarding the logged-in page hands it the address and key, so it connects
  without anyone pasting a token (the popup's pairing form still works). It reads
  nothing from the page and never runs on LinkedIn or anywhere else.
- Each check-in also tells AILI how the import is going (conversations so
  far, which inbox and page, a pause or error), so AILI can show it.
- Group threads are skipped. Conversations idle for more than 180 days are
  not imported.

## Risk

LinkedIn's user agreement does not allow third-party tools to read or send
messages. This is the same category of tool as every LinkedIn inbox product.
Keep volumes human: the daily cap in AILI Settings exists for that reason.

## Credit

The LinkedIn client and response parsing are adapted from
[inflow](https://github.com/grinich/inflow) by Michael Grinich, MIT licensed.
