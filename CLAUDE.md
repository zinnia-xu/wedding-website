# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

A wedding website for **Zinnia & Andrew** (May 24, 2026, Hawaii). It is a
**static multi-page site** (hand-written HTML/CSS/vanilla JS, no build step,
no framework) plus a set of **Netlify serverless functions** that power
interactive features — a guest points/leaderboard game, a beach competition
scorecard, recipe submissions, a Eurovision quiz, and Slack-based admin
approval flows.

Deployed on **Netlify** at `https://andrewzinniawedding.netlify.app`.

## Architecture

```
*.html                    Each page is a standalone, self-contained file.
                          All CSS is inlined in a <style> block; all JS is
                          inlined in <script>. No shared CSS/JS files, no
                          bundler, no imports between pages.

netlify/functions/*.js    Serverless backend (Node, CommonJS). Reads/writes
                          state via Netlify Blobs. Talks to Slack.

netlify.toml              Netlify build config + scheduled function cron.
package.json              Only runtime dep: @netlify/blobs.
*.jpg / *.jpeg / *.png    Page images, committed directly to the repo.
Photos/ , Uni/            Image galleries used by photos.html / uni.html.
leaderboard-data.json     Seed/reference shape for the leaderboard blob (NOT
                          read at runtime — the live data lives in Blobs).
guest-list.csv            Reference guest list (not used at runtime).
```

### Front end
- **No framework.** Every `.html` file is independent and self-contained.
  Shared look-and-feel is achieved by copy-pasting the `<nav>`, the `:root`
  CSS custom properties, and footer markup between pages — there is no shared
  stylesheet. If you change the nav or color palette, you must update each
  page that uses it.
- **Design tokens** (defined per-page in `:root`): jungle greens
  (`--jungle`, `--jungle-mid`, `--jungle-light`), hot pink (`--hot-pink`,
  `--pink-light`, `--pink-soft`), orange (`--orange`, `--orange-light`), and
  cream backgrounds (`--cream`, `--cream-dark`). Fonts: **DM Serif Display**
  (headings) and **DM Sans** (body), loaded from Google Fonts.
- Pages call the backend with `fetch('/.netlify/functions/<name>')`.
- Charts (e.g. `wedding-recap.html`, `points.html`) use Chart.js loaded from
  a CDN.

### Back end (Netlify Functions)
- **CommonJS** modules exporting `exports.handler = async (event) => {...}`.
- Every handler follows the same shape:
  1. Define CORS `headers` (`Access-Control-Allow-Origin: *`).
  2. Short-circuit `OPTIONS` with `200`.
  3. Validate `event.httpMethod` (return `405` if wrong).
  4. `try/catch`, returning `{ statusCode, headers, body: JSON.stringify(...) }`.
     Errors log to `console.error` and return `500`.
- **State lives in Netlify Blobs**, accessed via
  `getStore({ name, siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN })`.
  There are two stores:
  - `leaderboard` — the guest points game. Single key `"data"` holding
    `{ guests: [{name, points}], feed: [...], hidden, feedHidden }`.
  - `beach-competition` — the beach scorecard / team standings.
- Several functions integrate with **Slack** for human approval (a guest
  requests points → Slack message with Approve/Adjust/Deny buttons →
  `approve-points`/`adjust-points`/`direct-award` mutate the blob).

### Key function groups
- **Points game:** `get-leaderboard`, `submit-points`, `approve-points`,
  `adjust-points`, `direct-award`, `admin-award`, `admin-update`.
- **Beach competition:** `get-beach-scores`, `submit-beach-score`,
  `set-beach-teams`, `reset-beach-teams`, `update-team-name`,
  `set-beach-standings`, `clear-beach-scores`, `beach-visibility`,
  `migrate-snorkeling`.
- **Other:** `submit-recipe`, `daily-summary` (scheduled — see below).

### Scheduled function
`daily-summary` posts the leaderboard to Slack daily. Cron is configured in
`netlify.toml`: `schedule = "0 7 * * *"` (07:00 UTC = 9pm Hawaii, UTC-10).

## Environment variables (set in Netlify dashboard, not in repo)
- `SITE_ID`, `NETLIFY_TOKEN` — required for Blobs access in every function.
- `ADMIN_KEY` — guards admin mutation endpoints.
- `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_SIGNING_SECRET`,
  `SLACK_ADMIN_USER_IDS` — Slack bot integration.
- `SLACK_WEBHOOK_URL`, `WEDDING_POINTS_SLACK_WEBHOOK`,
  `WEDDING_RECIPES_SLACK_WEBHOOK` — incoming webhooks (legacy/fallback).
- `DISABLE_SLACK=true` — disables all Slack posting (useful for testing).
- `URL` — site URL (provided by Netlify); used to build approval links.

## Local development
- **Static preview only:** `python3 -m http.server 8000` then open
  `http://localhost:8000` (this is the configured launch task in
  `.claude/launch.json`). Serverless functions will NOT run under this — calls
  to `/.netlify/functions/*` will 404.
- **Full local stack (functions + Blobs):** use the Netlify CLI —
  `npm install -g netlify-cli` then `netlify dev`. Requires the env vars above
  to exercise Blobs/Slack.
- There is **no test suite, linter, or build step.** "Building" is just
  serving the files; Netlify deploys the repo as-is and bundles functions with
  esbuild.

## Conventions & gotchas
- **Self-contained pages:** keep new pages standalone (inline CSS/JS). Match
  the existing palette, fonts, and nav markup by copying from an existing page
  like `index.html`.
- **Editing the backend:** preserve the CORS + OPTIONS + method-check +
  try/catch boilerplate when adding a function. Always pass
  `siteID`/`token` to `getStore`.
- **Blob data shape:** mutate the single `"data"` key in place
  (read → modify → `setJSON`); don't assume fields exist (older entries may
  lack `hidden`/`feedHidden` — default them).
- **`index-backup.html`, `beach-competition-test.html`** are throwaway
  backup/scratch copies. Don't treat them as canonical; the live pages are
  `index.html` and `beach-scorecard.html`.
- **Images are committed to git** (some are multi-MB). `.gitignore` excludes
  `*.zip`, `node_modules/`, and OS cruft. Be mindful of repo size when adding
  photos.
- **Admin features** in pages (e.g. `points.html`, `leaderboard.html`,
  `beach-scorecard.html`) are gated by a client-side prompt and a server-side
  `ADMIN_KEY` check — the client gate is convenience only, not real security.

## Git workflow
- `save-snapshot.sh "message"` is a convenience script that does
  `git add -A && git commit -m "message"` and prints the recent log. Commit
  messages in history are short, descriptive, and emoji-friendly
  (e.g. _"Merge 4 bird categories into Bird Sightings 🐦 in activity charts"_).
- Match that style: concise, present-tense, describe the user-visible change.
- Deployment is automatic — pushing to the deployed branch triggers a Netlify
  build/deploy. There is no manual deploy step.
