// Fetches iCloud (or any) ICS feeds, expands recurring events and returns plain JSON for the dashboard.
import ICAL from 'ical.js';

const DAY = 864e5;

// Timed events -> ISO instant. All-day events -> 'YYYY-MM-DD' (timezone-neutral; end is exclusive).
function dateOnly(t) {
  const p = (n) => String(n).padStart(2, '0');
  return t.year + '-' + p(t.month) + '-' + p(t.day);
}

export function parseFeed(text, feed, from, to) {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    const id = tz.getFirstPropertyValue('tzid');
    if (id && !ICAL.TimezoneService.has(id)) ICAL.TimezoneService.register(tz);
  }

  // Group master events and their per-occurrence overrides by UID.
  const masters = new Map();
  const overrides = [];
  for (const v of root.getAllSubcomponents('vevent')) {
    if (v.hasProperty('recurrence-id')) overrides.push(v);
    else masters.set(v.getFirstPropertyValue('uid'), new ICAL.Event(v));
  }
  for (const v of overrides) {
    const m = masters.get(v.getFirstPropertyValue('uid'));
    if (m) m.relateException(v);
  }

  const out = [];
  const toMs = to.getTime();
  const fromMs = from.getTime();

  function push(ev, start, end, uidKey) {
    const allDay = start.isDate;
    const s = allDay ? dateOnly(start) : start.toJSDate().toISOString();
    const e = allDay ? dateOnly(end) : end.toJSDate().toISOString();
    const loc = ev.location || undefined;
    const notes = ev.description || undefined;
    out.push({
      id: uidKey, title: ev.summary || '(no title)', allDay, start: s, end: e,
      people: feed.people, loc, notes,
    });
  }

  for (const ev of masters.values()) {
    if (ev.isRecurring()) {
      const it = ev.iterator();
      let guard = 0;
      for (let next = it.next(); next && guard < 20000; next = it.next(), guard++) {
        const d = ev.getOccurrenceDetails(next);
        if (d.startDate.toJSDate().getTime() > toMs) break;
        if (d.endDate.toJSDate().getTime() < fromMs) continue;
        push(d.item, d.startDate, d.endDate, ev.uid + '@' + d.startDate.toString());
      }
    } else {
      const sMs = ev.startDate.toJSDate().getTime();
      const eMs = ev.endDate.toJSDate().getTime();
      if (sMs > toMs || eMs < fromMs) continue;
      push(ev, ev.startDate, ev.endDate, ev.uid);
    }
  }
  return out;
}

// feeds: [{ url, people: ['alex', ...] }]. Failures in one feed don't sink the others.
export async function loadCalendar(feeds, now = new Date()) {
  const from = new Date(now.getTime() - 45 * DAY);
  const to = new Date(now.getTime() + 75 * DAY);
  const results = await Promise.allSettled(feeds.map(async (feed) => {
    const url = feed.url.replace(/^webcal:/i, 'https:');
    const res = await fetch(url, { headers: { accept: 'text/calendar' } });
    if (!res.ok) throw new Error('feed ' + res.status);
    return parseFeed(await res.text(), feed, from, to);
  }));
  const events = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      r.value.forEach((e) => events.push({ ...e, id: i + ':' + e.id }));
    } else errors.push('feed ' + i + ': ' + r.reason.message);
  });
  return { events, errors, fetchedAt: now.toISOString() };
}
