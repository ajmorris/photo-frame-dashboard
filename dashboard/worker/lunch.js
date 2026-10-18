// Herbison Woods lunch via Nutrislice public week JSON (no auth).
import { bad, json, todayKey } from './util.js';

const DISTRICT = 'dewittschools';
const SCHOOL = 'herbison-woods';
const MENU_TYPE = 'lunch-3-6';
const SCHOOL_LABEL = 'Herbison Woods';
const TTL = 21600; // 6 hours

/** Sunday of the week containing `date` (dashboard TZ civil calendar). */
function weekAnchor(date, timeZone) {
  // Use dashboard TZ civil date, then back to Sunday of that week.
  const key = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const [y, mo, d] = key.split('-').map(Number);
  const local = new Date(y, mo - 1, d);
  local.setDate(local.getDate() - local.getDay());
  return {
    y: local.getFullYear(),
    m: String(local.getMonth() + 1).padStart(2, '0'),
    d: String(local.getDate()).padStart(2, '0'),
  };
}

function shiftLocalDays(anchor, days) {
  const dt = new Date(+anchor.y, +anchor.m - 1, +anchor.d + days);
  return {
    y: dt.getFullYear(),
    m: String(dt.getMonth() + 1).padStart(2, '0'),
    d: String(dt.getDate()).padStart(2, '0'),
  };
}

function entreesFromDay(day) {
  const out = [];
  const seen = new Set();
  for (const it of day.menu_items || []) {
    if (it.is_section_title) continue;
    if (String(it.category || '').toLowerCase() !== 'entree') continue;
    const name = it.food && it.food.name;
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

async function fetchWeek(anchor) {
  const url = 'https://' + DISTRICT + '.api.nutrislice.com/menu/api/weeks/school/'
    + SCHOOL + '/menu-type/' + MENU_TYPE + '/'
    + anchor.y + '/' + anchor.m + '/' + anchor.d + '/?format=json';
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'home-dashboard/1.0' },
  });
  if (!res.ok) throw new Error('Nutrislice HTTP ' + res.status);
  return res.json();
}

export async function loadLunch(env, now = new Date()) {
  const tz = env.DASHBOARD_TZ || 'America/Detroit';
  const thisWeek = weekAnchor(now, tz);
  const nextWeek = shiftLocalDays(thisWeek, 7);

  const [a, b] = await Promise.all([
    fetchWeek(thisWeek),
    fetchWeek(nextWeek),
  ]);

  const byDate = new Map();
  for (const week of [a, b]) {
    for (const day of week.days || []) {
      if (!day.date) continue;
      byDate.set(day.date, {
        date: day.date,
        entrees: entreesFromDay(day),
      });
    }
  }

  const days = Array.from(byDate.values()).sort((x, y) => x.date.localeCompare(y.date));

  return {
    school: SCHOOL_LABEL,
    menuType: MENU_TYPE,
    source: 'nutrislice',
    menuUrl: 'https://dewittschools.nutrislice.com/menu/herbison-woods/lunch-3-6',
    fetchedAt: now.toISOString(),
    today: todayKey(env, now),
    days,
  };
}

export async function handleLunch(request, env, ctx) {
  if (request.method !== 'GET') return bad('GET only', 405);

  const cache = caches.default;
  const key = new Request(new URL(request.url).origin + '/api/lunch');
  const hit = await cache.match(key);
  if (hit) return hit;

  let body;
  let status = 200;
  try {
    body = await loadLunch(env);
  } catch (err) {
    body = {
      school: SCHOOL_LABEL,
      error: String(err.message || err),
      days: [],
      fetchedAt: new Date().toISOString(),
    };
    status = 502;
  }

  const res = json(body, status, { 'cache-control': 'public, max-age=' + TTL });
  if (status === 200) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
