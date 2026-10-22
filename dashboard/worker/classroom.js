// Google Classroom assignments for a kid — served from KV (filled by the Playwright scraper).
import { bearerOk, clampStr, json, bad, todayKey, tz, shiftDayKey } from './util.js';

const DUE_WINDOW_DAYS = 14;
const PAST_CAP = 6;
const DUE_CAP = 8;
const KIDS = { maya: true, otto: true };

function kvKey(kid) {
  return 'classroom:' + kid;
}

function empty(kid, now = new Date()) {
  return {
    kid,
    configured: false,
    source: null,
    fetchedAt: now.toISOString(),
    pastDue: [],
    due: [],
    truncated: { pastDue: 0, due: 0 },
  };
}

function daysBetweenCivil(fromKey, toKey) {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 864e5);
}

function civilInTz(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Normalize ingest items into pastDue / due using dashboard TZ. */
export function splitAssignments(items, env, now = new Date()) {
  const timeZone = tz(env);
  const today = todayKey(env, now);
  const horizon = shiftDayKey(today, DUE_WINDOW_DAYS);
  const pastDue = [];
  const due = [];

  for (const raw of items || []) {
    const title = clampStr(raw.title, 160);
    if (!title) continue;
    const course = clampStr(raw.course || '', 80);
    const id = clampStr(raw.id || (course + ':' + title), 120) || title;
    let when = null;
    if (raw.due) {
      const d = new Date(raw.due);
      if (!Number.isNaN(d.getTime())) when = d;
    }
    if (!when && raw.missing) {
      // Missing with no parseable date → treat as past due as of yesterday.
      when = new Date(shiftDayKey(today, -1) + 'T12:00:00');
    }
    if (!when) continue;

    const dueCivil = civilInTz(when, timeZone);
    const item = {
      id,
      title,
      course,
      due: when.toISOString(),
      daysLate: null,
    };
    if (raw.missing || dueCivil < today) {
      item.daysLate = Math.max(1, daysBetweenCivil(dueCivil, today));
      pastDue.push(item);
    } else if (dueCivil <= horizon) {
      due.push(item);
    }
  }

  pastDue.sort((a, b) => new Date(a.due) - new Date(b.due));
  due.sort((a, b) => new Date(a.due) - new Date(b.due));

  return {
    pastDue,
    due,
    truncated: {
      pastDue: Math.max(0, pastDue.length - PAST_CAP),
      due: Math.max(0, due.length - DUE_CAP),
    },
  };
}

async function loadStored(env, kid) {
  if (!env.STORE) return null;
  return env.STORE.get(kvKey(kid), 'json');
}

async function saveStored(env, kid, data) {
  if (!env.STORE) throw new Error('STORE KV binding is missing');
  await env.STORE.put(kvKey(kid), JSON.stringify(data));
}

export async function loadClassroom(kid, env, now = new Date()) {
  if (!KIDS[kid]) return empty(kid, now);
  const stored = await loadStored(env, kid);
  if (!stored || !stored.configured) return empty(kid, now);
  return {
    kid,
    configured: true,
    source: stored.source || 'scrape',
    fetchedAt: stored.fetchedAt || now.toISOString(),
    pastDue: stored.pastDue || [],
    due: stored.due || [],
    truncated: stored.truncated || { pastDue: 0, due: 0 },
  };
}

export async function handleClassroom(request, env, ctx) {
  const url = new URL(request.url);
  const kid = url.searchParams.get('kid') || 'maya';
  if (!KIDS[kid]) return bad('unknown kid', 400);

  if (request.method === 'GET') {
    const cache = caches.default;
    const key = new Request(url.origin + '/api/classroom?kid=' + kid);
    const hit = await cache.match(key);
    if (hit) return hit;

    const body = await loadClassroom(kid, env);
    const res = json(body, 200, { 'cache-control': 'public, max-age=60' });
    if (body.configured) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  }

  if (request.method !== 'POST') return bad('GET or POST only', 405);
  // Same write token as MCP / presence-style automations.
  if (!bearerOk(request, env.AGENT_TOKEN) && !bearerOk(request, env.PRESENCE_TOKEN)) {
    return bad('unauthorized', 401);
  }

  let body;
  try { body = await request.json(); } catch { return bad('invalid JSON'); }

  const items = Array.isArray(body.items) ? body.items
    : [].concat(body.pastDue || [], body.due || []).map((x) => ({
      ...x,
      missing: !!(body.pastDue && body.pastDue.indexOf(x) >= 0),
    }));

  // Prefer explicit pastDue/due from scraper when provided.
  let pastDue;
  let due;
  let truncated;
  if (Array.isArray(body.pastDue) && Array.isArray(body.due)) {
    pastDue = body.pastDue.map((x) => ({
      id: clampStr(x.id || x.title, 120),
      title: clampStr(x.title, 160),
      course: clampStr(x.course || '', 80),
      due: x.due,
      daysLate: x.daysLate == null ? null : Math.max(0, Math.round(Number(x.daysLate))),
    })).filter((x) => x.title && x.due);
    due = body.due.map((x) => ({
      id: clampStr(x.id || x.title, 120),
      title: clampStr(x.title, 160),
      course: clampStr(x.course || '', 80),
      due: x.due,
      daysLate: null,
    })).filter((x) => x.title && x.due);
    pastDue.sort((a, b) => new Date(a.due) - new Date(b.due));
    due.sort((a, b) => new Date(a.due) - new Date(b.due));
    truncated = {
      pastDue: Math.max(0, pastDue.length - PAST_CAP),
      due: Math.max(0, due.length - DUE_CAP),
    };
  } else {
    const split = splitAssignments(items, env);
    pastDue = split.pastDue;
    due = split.due;
    truncated = split.truncated;
  }

  const now = new Date();
  const stored = {
    kid,
    configured: true,
    source: clampStr(body.source || 'scrape', 40) || 'scrape',
    fetchedAt: now.toISOString(),
    pastDue,
    due,
    truncated,
  };
  await saveStored(env, kid, stored);

  // Bust CDN cache for this kid.
  try {
    const cache = caches.default;
    await cache.delete(new Request(url.origin + '/api/classroom?kid=' + kid));
  } catch (_) { /* ignore */ }

  return json(stored);
}

export { KIDS, PAST_CAP, DUE_CAP, DUE_WINDOW_DAYS };
