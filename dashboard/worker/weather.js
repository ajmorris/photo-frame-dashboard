import { bad, json, tz } from './util.js';

const CACHE_TTL = 1800; // 30 minutes

function codeToCond(code, hour) {
  const night = hour < 6 || hour >= 20;
  if (code === 0) return night ? 'moon' : 'sun';
  if (code <= 2) return 'partly';
  if (code <= 48) return 'cloud';
  return 'rain';
}

export async function handleWeather(request, env, ctx) {
  if (request.method !== 'GET') return bad('GET only', 405);
  const lat = env.WEATHER_LAT || '42.84226';
  const lon = env.WEATHER_LON || '-84.56915';
  const cache = caches.default;
  const key = new Request(new URL(request.url).origin + '/api/weather?lat=' + lat + '&lon=' + lon);
  const hit = await cache.match(key);
  if (hit) return hit;

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('timezone', tz(env));
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
  url.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability');

  let res;
  try {
    res = await fetch(url.toString(), { headers: { accept: 'application/json' } });
  } catch (err) {
    return bad('weather fetch failed: ' + (err.message || err), 502);
  }
  if (!res.ok) return bad('weather upstream ' + res.status, 502);
  const raw = await res.json();
  const temps = raw.hourly?.temperature_2m || [];
  const codes = raw.hourly?.weather_code || [];
  const probs = raw.hourly?.precipitation_probability || [];
  const t = [], c = [], p = [];
  for (let h = 0; h < 24; h++) {
    t.push(Math.round(temps[h] ?? 0));
    c.push(codeToCond(codes[h] ?? 0, h));
    p.push(Math.round(probs[h] ?? 0));
  }
  const body = {
    hi: Math.round(raw.daily?.temperature_2m_max?.[0] ?? Math.max.apply(null, t)),
    lo: Math.round(raw.daily?.temperature_2m_min?.[0] ?? Math.min.apply(null, t)),
    t, c, p,
    place: 'DeWitt, MI',
    source: 'Open-Meteo',
  };
  const out = json(body, 200, { 'cache-control': 'public, max-age=' + CACHE_TTL });
  ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}
