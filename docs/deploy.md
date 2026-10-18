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

## Frame kiosk

Change `DEFAULT_URL` in `dashboard/kiosk/src/com/wesbos/homehq/MainActivity.java` to your workers.dev URL and rebuild the kiosk APK when you want the tablet pointed at your deploy.
