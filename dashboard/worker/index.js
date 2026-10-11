import { loadCalendar } from './calendar.js';

const TTL = 300; // seconds

// CALENDAR_FEEDS (secret): JSON like [{"url":"webcal://...","people":["alex","jordan"]}]
function feedsFrom(env) {
  if (env.CALENDAR_FEEDS) return JSON.parse(env.CALENDAR_FEEDS);
  return [];
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/calendar') return env.ASSETS.fetch(request);

    const cache = caches.default;
    const key = new Request(url.origin + '/api/calendar');
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
    const res = new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=' + TTL },
    });
    if (status === 200) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  },
};
