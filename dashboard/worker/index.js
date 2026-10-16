import { loadCalendar } from './calendar.js';
import { handleChores, handleShopping } from './lists.js';
import { handleMcp } from './mcp.js';
import { handlePhotos } from './photos.js';
import { handlePresence } from './presence.js';
import { bad, json } from './util.js';
import { handleWeather } from './weather.js';

const CAL_TTL = 300;

function feedsFrom(env) {
  if (env.CALENDAR_FEEDS) return JSON.parse(env.CALENDAR_FEEDS);
  return [];
}

async function handleCalendar(request, env, ctx) {
  if (request.method !== 'GET') return bad('GET only', 405);
  const cache = caches.default;
  const key = new Request(new URL(request.url).origin + '/api/calendar');
  const hit = await cache.match(key);
  if (hit) return hit;

  let body, status = 200;
  try {
    const feeds = feedsFrom(env);
    if (!feeds.length) throw new Error('CALENDAR_FEEDS is not set');
    body = await loadCalendar(feeds);
    if (!body.events.length && body.errors.length) status = 502;
  } catch (err) {
    body = { events: [], errors: [String(err.message || err)] };
    status = 500;
  }
  const res = json(body, status, { 'cache-control': 'public, max-age=' + CAL_TTL });
  if (status === 200) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/calendar') return await handleCalendar(request, env, ctx);
      if (path === '/api/weather') return await handleWeather(request, env, ctx);
      if (path === '/api/presence') return await handlePresence(request, env);
      if (path === '/api/photos') return await handlePhotos(request, env, ctx);
      if (path === '/api/chores') return await handleChores(request, env);
      if (path === '/api/shopping') return await handleShopping(request, env);
      if (path === '/mcp') return await handleMcp(request, env);
    } catch (err) {
      return json({ error: String(err.message || err) }, 500);
    }

    return env.ASSETS.fetch(request);
  },
};
