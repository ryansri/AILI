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

- Runs in the extension's background worker. Once a minute it checks LinkedIn
  is logged in and delivers at most one queued message.
- On first connect it imports your history: one inbox page per minute,
  Focused then Other, until it reaches conversations older than 180 days.
  The popup shows the count as it goes. Keep Chrome open.
- After that, every other minute it re-reads the first pages of your inbox
  and pushes anything with new activity to AILI.
- Uses the LinkedIn cookies already in your browser. Nothing is copied
  elsewhere. Requests to LinkedIn carry those cookies through a
  declarativeNetRequest rule scoped to this extension only.
- **The popup** shows one thing at a time. On someone's LinkedIn profile:
  who it is and Add to AILI, with the stage and tag in one line underneath
  (it keeps your last pick). Clicking Add reads that one profile from
  LinkedIn and adds the name, headline, photo, current title and company to
  People. If they are already in AILI it says so and offers Open in AILI.
  Anywhere else it says it is syncing. It only speaks up when something needs
  you, like LinkedIn being logged out. Sync now, Open AILI and Disconnect are
  in the ••• menu. Nothing is added to LinkedIn's page: the popup only reads
  the tab's address and title.
- Group threads are skipped. Conversations idle for more than 180 days are
  not imported.

## Risk

LinkedIn's user agreement does not allow third-party tools to read or send
messages. This is the same category of tool as every LinkedIn inbox product.
Keep volumes human: the daily cap in AILI Settings exists for that reason.

## Credit

The LinkedIn client and response parsing are adapted from
[inflow](https://github.com/grinich/inflow) by Michael Grinich, MIT licensed.
