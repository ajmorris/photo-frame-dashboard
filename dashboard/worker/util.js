export const PEOPLE = ['alex', 'jordan', 'maya', 'otto'];
export const KIDS = ['maya', 'otto'];
export const PARENTS = ['alex', 'jordan'];
export const ROUTINES = ['morning', 'after', 'evening'];

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function bad(message, status = 400) {
  return json({ error: message }, status);
}

export function bearerOk(request, secret) {
  if (!secret) return false;
  const h = request.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return !!(m && m[1] === secret);
}

export function tz(env) {
  return env.DASHBOARD_TZ || 'America/Detroit';
}

export function todayKey(env, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz(env),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Weekday for a YYYY-MM-DD civil date (0=Sun … 6=Sat). */
export function weekdayForDayKey(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Shift a YYYY-MM-DD civil date by delta days. */
export function shiftDayKey(day, delta) {
  const [y, m, d] = String(day).split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return dt.getFullYear() + '-'
    + String(dt.getMonth() + 1).padStart(2, '0') + '-'
    + String(dt.getDate()).padStart(2, '0');
}

export function clampStr(s, max) {
  return String(s || '').trim().slice(0, max);
}

export function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
