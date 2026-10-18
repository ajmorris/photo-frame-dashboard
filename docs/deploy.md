# Deploy Home HQ (Cloudflare Workers, free)

## One-time setup

1. Cloudflare account (free Workers plan).
2. From `dashboard/`:

```bash
npx wrangler login
npx wrangler kv namespace create STORE
```

3. Put the returned namespace id into `wrangler.jsonc` under `kv_namespaces[0].id` and `preview_id`.
4. Set secrets (never commit these):

```bash
npx wrangler secret put CALENDAR_FEEDS   # JSON array of {url, people}
npx wrangler secret put PRESENCE_TOKEN
npx wrangler secret put AGENT_TOKEN
# later:
# npx wrangler secret put PHOTO_ALBUM
# npx wrangler secret put CLASSROOM_MAYA   # Chloe Classroom OAuth JSON (see below)
```

`WEATHER_LAT`, `WEATHER_LON`, and `DASHBOARD_TZ` are already set in `wrangler.jsonc` for DeWitt, Michigan.

5. Deploy:

```bash
npm run deploy
```

Live URL: **https://home-dashboard.aj-morris.workers.dev**

## Local API + UI

Terminal A (after a build once, or whenever worker code changes):

```bash
npm run build
npm run dev:worker
```

Terminal B:

```bash
npm run dev
```

Vite proxies `/api` and `/mcp` to port 8787. Copy `.dev.vars.example` → `.dev.vars` and fill tokens / calendar feed.

## Grok connector

1. Deploy so `/mcp` is on a public `https://…workers.dev/mcp` URL.
2. grok.com/connectors → New Connector → Custom.
3. URL: `https://home-dashboard.aj-morris.workers.dev/mcp`
4. Auth: Bearer `AGENT_TOKEN` (same value as the worker secret / `.dev.vars`)

Tools: shopping list, today’s chores, Up for grabs, kid defaults. Person ids: `alex` AJ, `jordan` Nicole, `maya` Chloe, `otto` Hudson, `any` Up for grabs.

## Photos

When you have a public Shared Album link:

```bash
npx wrangler secret put PHOTO_ALBUM
```

Until then `/api/photos` returns `{ configured: false }` and the frame keeps placeholder images.

## Chloe · Google Classroom (browser scrape)

School Workspace domains usually block third-party Classroom API OAuth. This dashboard does **not** call the Classroom API. A small Playwright script on a computer signs into Classroom as Chloe (once), scrapes the student **Missing** and **Assigned** To-do pages, and POSTs JSON to the Worker. The frame only reads `GET /api/classroom?kid=maya`.

### One-time login + scrape

1. From `dashboard/`, install browsers once:

```bash
npm install
npx playwright install chromium
```

2. Ensure `.dev.vars` has `AGENT_TOKEN` (same value as production `wrangler secret`). For production pushes:

```bash
CLASSROOM_URL=https://home-dashboard.aj-morris.workers.dev
```

3. First run opens a real browser — sign in with **Chloe’s school Google account**, then wait until Classroom loads:

```bash
npm run classroom:login
```

Session cookies are stored in `dashboard/.classroom-profile/maya/` (gitignored).

4. Later refreshes (headless):

```bash
npm run classroom:scrape
# or dry-run without posting:
npm run classroom:scrape -- --dry-run --headed --debug
```

5. Optional: schedule every 15–30 minutes with `launchd` or cron while the Mac is on. If Google expires the session, re-run `npm run classroom:login`.

### API shape

- `GET /api/classroom?kid=maya` → `{ configured, pastDue, due, truncated, fetchedAt, source }`
- `POST /api/classroom?kid=maya` with `Authorization: Bearer AGENT_TOKEN` and body `{ pastDue, due }` (or `{ items }`) stores the snapshot in KV

Until the first successful scrape, `configured` is false and the Chloe page keeps mock / last-good data with **Classroom isn’t connected**.

## School lunch (Nutrislice)

Lunch comes from Nutrislice’s public week JSON — no API key or secret. The Worker fetches this week and next week, caches for 6 hours, and serves `GET /api/lunch?kid=maya|otto` (default `maya`).

| Kid | School | Menu |
|-----|--------|------|
| Chloe (`maya`) | Herbison Woods | [lunch 3–6](https://dewittschools.nutrislice.com/menu/herbison-woods/lunch-3-6) |
| Hudson (`otto`) | Scott | [lunch 3–6](https://dewittschools.nutrislice.com/menu/scott/lunch-3-6) |

School slugs are hardcoded in `dashboard/worker/lunch.js`. The frame polls both kids about every 30 minutes and keeps last-good copies in `localStorage`.

## Hudson

Hudson’s page shows a two-week schedule of his calendar events (anything tagged `otto` from `CALENDAR_FEEDS`) plus Scott lunch. There is **no** Google Classroom scrape for Hudson yet.

## Frame kiosk

Change `DEFAULT_URL` in `dashboard/kiosk/src/com/wesbos/homehq/MainActivity.java` to your workers.dev URL and rebuild the kiosk APK when you want the tablet pointed at your deploy.
