# Presence Shortcuts

The Today name row shows Home / Out / At the office / At school from each phone. A Shortcut posts to the dashboard; the frame polls every minute.

## Endpoint

```
POST https://home-dashboard.aj-morris.workers.dev/api/presence
Authorization: Bearer YOUR_PRESENCE_TOKEN
Content-Type: application/json
```

`YOUR_PRESENCE_TOKEN` is the `PRESENCE_TOKEN` worker secret (also in local `.dev.vars`).

Body:

```json
{"person":"alex","status":"Home","home":true}
```

| Field | Notes |
| --- | --- |
| `person` | `alex` AJ · `jordan` Nicole · `maya` Chloe · `otto` Hudson |
| `status` | Short label, max 40 characters |
| `home` | `true` only when at the house |
| `eta` | Optional minutes. When set and not home, the row shows “ETA N min” |

A check-in older than 12 hours is marked **Stale** on the frame.

## Curl test

```bash
curl -sS -X POST "https://home-dashboard.aj-morris.workers.dev/api/presence" \
  -H "Authorization: Bearer YOUR_PRESENCE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"person":"alex","status":"Home","home":true}'
```

```bash
curl -sS "https://home-dashboard.aj-morris.workers.dev/api/presence"
```

## Personal Automations (per phone)

In Shortcuts → Automation → Personal Automation. Turn **Ask Before Running** off, then run each once so iOS allows it.

Use **Get Contents of URL**:

- Method: POST
- Headers: `Authorization` = `Bearer YOUR_PRESENCE_TOKEN`, `Content-Type` = `application/json`
- Request Body: JSON with the fields below

Suggested automations for that phone’s person id:

1. **Arrive Home** → `{"person":"…","status":"Home","home":true}`
2. **Leave Home** → `{"person":"…","status":"Out","home":false}`
3. **Arrive Work** or **Work Focus turns on** → `{"person":"…","status":"At the office","home":false}`
4. **Arrive School** (kids) → `{"person":"…","status":"At school","home":false}`

Optional later: leave-work with an `eta` from a travel-time action.

## Security

One family `PRESENCE_TOKEN` is shared across phones. Anyone with the token can update any person. If a phone is lost, rotate the secret (`wrangler secret put PRESENCE_TOKEN`) and update every Shortcut.

GET `/api/presence` has no token; anyone who can open the dashboard URL can see the statuses.
