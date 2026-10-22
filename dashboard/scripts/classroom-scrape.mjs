#!/usr/bin/env node
/**
 * Scrape Chloe's Google Classroom To-do lists (Missing + Assigned) and POST to the dashboard.
 *
 * First run opens a real browser so you can sign in as Chloe once. Cookies stay in
 * .classroom-profile/<kid>/ (gitignored). Later runs are headless and reuse that session.
 *
 * Usage (from dashboard/):
 *   npm run classroom:scrape              # maya / Chloe, push to worker
 *   npm run classroom:scrape -- --login   # force headed login / re-auth
 *   npm run classroom:scrape -- --dry-run    # print JSON, do not POST
 *   npm run classroom:scrape -- --push-last  # POST last saved scrape (no browser)
 *   npm run classroom:scrape -- --headed     # show browser while scraping
 *
 * Env:
 *   CLASSROOM_KID=maya
 *   CLASSROOM_URL=https://home-dashboard.aj-morris.workers.dev  (default: http://127.0.0.1:8787)
 *   AGENT_TOKEN=…   (or PRESENCE_TOKEN) — write token for POST /api/classroom
 *   CLASSROOM_TZ=America/Detroit
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadDotEnv() {
  const p = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}
loadDotEnv();

const KID = process.env.CLASSROOM_KID || 'maya';
const TZ = process.env.CLASSROOM_TZ || 'America/Detroit';
const BASE = (process.env.CLASSROOM_URL || process.env.DASHBOARD_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const PROFILE = path.join(ROOT, '.classroom-profile', KID);

const args = new Set(process.argv.slice(2));
const FORCE_LOGIN = args.has('--login');
const DRY = args.has('--dry-run');
const PUSH_LAST = args.has('--push-last');
const HEADED = args.has('--headed') || FORCE_LOGIN;
const DEBUG = args.has('--debug');
const LAST_FILE = path.join(ROOT, '.classroom-profile', KID + '-last.json');

const MISSING_URL = 'https://classroom.google.com/a/missing/all';
const ASSIGNED_URL = 'https://classroom.google.com/a/not-turned-in/all';

function civilToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function shiftCivil(day, delta) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const WEEKDAYS = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6,
};

/** Parse Classroom due phrases → ISO instant (noon local when no time). */
function parseDueText(text, preferPast = false) {
  if (!text) return null;
  const s = String(text).replace(/\s+/g, ' ').trim();
  const today = civilToday();
  const lower = s.toLowerCase();

  // "Posted …" is not a due date — only teachers' publish time.
  if (/^posted\b/i.test(s) && !/\bdue\b/i.test(s)) return null;
  if (/^no due date\b/i.test(s)) return null;

  if (/\btoday\b/.test(lower)) return localNoon(today);
  if (/\btomorrow\b/.test(lower)) return localNoon(shiftCivil(today, 1));
  if (/\byesterday\b/.test(lower)) return localNoon(shiftCivil(today, -1));

  // Prefer explicit calendar dates over bare weekdays ("Friday, Oct 9").
  const m = s.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?(?:[,\s]+(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?)?/);
  if (m && MONTHS[m[1].toLowerCase()] != null) {
    const mo = MONTHS[m[1].toLowerCase()];
    const day = +m[2];
    const year = m[3] ? +m[3] : +today.slice(0, 4);
    let h = 12;
    let mi = 0;
    if (m[4] != null) {
      h = +m[4];
      mi = +m[5];
      const ap = (m[6] || '').toUpperCase();
      if (ap === 'PM' && h < 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
    }
    const iso = year + '-' + String(mo + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    if (m[4] != null) return zonedInstant(iso, h, mi);
    return localNoon(iso);
  }

  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (new RegExp('\\b' + name + '\\b').test(lower)) {
      const [y, mo, d] = today.split('-').map(Number);
      const cur = new Date(y, mo - 1, d);
      let delta = (dow - cur.getDay() + 7) % 7;
      if (preferPast) {
        if (delta === 0) delta = -7;
        else delta = delta - 7;
      } else if (delta === 0) {
        delta = 7;
      }
      return localNoon(shiftCivil(today, delta));
    }
  }

  return null;
}

function localNoon(civil) {
  return zonedInstant(civil, 12, 0);
}

function zonedInstant(civil, h, mi) {
  // Approximate: build as Detroit offset via format dance
  const [y, mo, d] = civil.split('-').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const parts = {};
  for (const p of fmt.formatToParts(guess)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess.getTime() - (asUtc - guess.getTime())).toISOString();
}

function daysLateFor(dueIso) {
  const today = civilToday();
  const dueCivil = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(dueIso));
  const [fy, fm, fd] = dueCivil.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return Math.max(1, Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 864e5));
}

function isAccountsUrl(url) {
  const s = String(url || '');
  return /accounts\.google\.com|ServiceLogin|signin\/oauth|AccountChooser/i.test(s);
}

function isClassroomUrl(url) {
  const s = String(url || '');
  return /classroom\.google\.com/i.test(s) && !isAccountsUrl(s);
}

/** True when Classroom UI is showing (home, classes, to-do) — not the sign-in interstitial. */
async function pageLooksLoggedIn(p) {
  try {
    const url = p.url();
    if (!isClassroomUrl(url)) return false;
    return await p.evaluate(() => {
      const t = (document.body && document.body.innerText) || '';
      // Signed-out / blocked pages
      if (/Sign in|Couldn't sign you in|browser or app may not be secure/i.test(t) && t.length < 2000) {
        return false;
      }
      // Typical signed-in chrome
      return /To-do|Classwork|Classes|Calendar|Teaching|Enrolled|View all/i.test(t)
        || !!document.querySelector('a[href*="/a/"], a[href*="todo"], [data-nav-id], nav');
    });
  } catch (_) {
    return false;
  }
}

async function findClassroomPage(context) {
  for (const p of context.pages()) {
    if (await pageLooksLoggedIn(p)) return p;
    if (isClassroomUrl(p.url())) return p;
  }
  return null;
}

/**
 * Open Classroom and wait until a real signed-in session is visible.
 * Polls every few seconds (waitForURL alone often hangs after SSO / account picker).
 * Returns the page tab that has Classroom open.
 */
async function waitForLogin(context, page) {
  console.log('\nSign in as Chloe’s school Google account in the browser window.');
  console.log('Stay on Classroom until you see your classes / To-do list.');
  console.log('This script polls every few seconds (not just the URL)…\n');

  try {
    await page.goto('https://classroom.google.com/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  } catch (err) {
    console.log('Initial navigation note:', err.message);
  }

  const deadline = Date.now() + 10 * 60 * 1000;
  let lastLog = '';
  while (Date.now() < deadline) {
    // Prefer any tab that already looks signed in.
    let hit = await findClassroomPage(context);
    if (hit && await pageLooksLoggedIn(hit)) {
      console.log('Logged in — Classroom session detected on', hit.url());
      await hit.bringToFront().catch(() => {});
      await hit.waitForTimeout(1500);
      return hit;
    }

    // Soft match: on classroom.google.com and not an accounts URL — try loading home again.
    const urls = context.pages().map((p) => {
      try { return p.url(); } catch (_) { return '(closed)'; }
    });
    const line = urls.join(' | ');
    if (line !== lastLog) {
      console.log('Waiting… tabs:', line);
      lastLog = line;
    }

    // If a tab landed on Classroom but SPA hasn’t painted yet, give it a moment + reload once.
    hit = context.pages().find((p) => {
      try { return isClassroomUrl(p.url()); } catch (_) { return false; }
    });
    if (hit) {
      try {
        await hit.waitForTimeout(2000);
        if (await pageLooksLoggedIn(hit)) {
          console.log('Logged in — Classroom session detected on', hit.url());
          return hit;
        }
      } catch (_) { /* tab may have navigated */ }
    }

    await page.waitForTimeout(3000);
  }
  throw new Error(
    'Timed out waiting for Classroom login. Finish sign-in in the Chrome window, '
    + 'make sure you can see your classes, then re-run: npm run classroom:login'
  );
}

async function expandCollapsedSections(page) {
  // "Earlier" / month groups on To-do are collapsed; expand so we see all missing work.
  for (let i = 0; i < 8; i++) {
    const btn = page.locator('button[aria-expanded="false"]').filter({ hasText: /Earlier|January|February|March|April|May|June|July|August|September|October|November|December|\d{4}/i }).first();
    if (await btn.count() === 0) break;
    try {
      await btn.click({ timeout: 2000 });
      await page.waitForTimeout(600);
    } catch (_) {
      break;
    }
  }
}

async function extractFromPage(page, kind) {
  try {
    await page.waitForSelector('[data-stream-item-id], a[href*="/a/"], [role="listitem"]', { timeout: 20000 });
  } catch (_) { /* may be empty */ }
  await page.waitForTimeout(1000);
  await expandCollapsedSections(page);
  await page.waitForTimeout(800);

  if (DEBUG) {
    const dump = path.join(ROOT, '.classroom-profile', KID + '-' + kind + '-debug.html');
    fs.mkdirSync(path.dirname(dump), { recursive: true });
    fs.writeFileSync(dump, await page.content());
    console.log('Wrote', dump);
  }

  return page.evaluate((kindName) => {
    const out = [];
    const seen = new Set();

    function clean(t) {
      return String(t || '').replace(/\s+/g, ' ').trim();
    }

    // Classroom To-do cards: data-stream-item-id with separate title / course / due nodes.
    const cards = document.querySelectorAll('[data-stream-item-id]');
    for (const card of cards) {
      const idAttr = card.getAttribute('data-stream-item-id') || '';
      const titleEl = card.querySelector('p.oDLUVd, p.VjRxGc.oDLUVd');
      const courseEl = card.querySelector('p.tWeh6');
      const dueEl = card.querySelector('p.pOf0gc, p.dnobx.pOf0gc');
      const link = card.closest('a[href]') || card.querySelector('a[href*="/details"], a[href*="/a/"]');
      const href = link ? (link.getAttribute('href') || '') : '';
      const title = clean(titleEl && titleEl.textContent);
      if (!title) continue;
      const course = clean(courseEl && courseEl.textContent);
      let dueText = clean(dueEl && dueEl.textContent);
      if (!dueText) {
        // Posted date sometimes replaces due date on assigned work without a deadline.
        const posted = Array.from(card.querySelectorAll('p')).map((p) => clean(p.textContent))
          .find((t) => /^posted\b/i.test(t) || /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),/i.test(t));
        dueText = posted || '';
      }
      const key = (href || idAttr) + '|' + title;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: href || (kindName + ':' + idAttr),
        title,
        course,
        dueText,
        missing: kindName === 'missing',
        kind: kindName,
      });
    }

    // Fallback if Google renames classes.
    if (!out.length) {
      for (const a of document.querySelectorAll('a[href*="/c/"][href*="/a/"]')) {
        const href = a.getAttribute('href') || '';
        const title = clean((a.querySelector('p.oDLUVd') || a).textContent).replace(/^assignment/i, '');
        if (!title || title.length < 2) continue;
        if (seen.has(href)) continue;
        seen.add(href);
        out.push({
          id: href,
          title,
          course: clean((a.querySelector('p.tWeh6') || {}).textContent || ''),
          dueText: clean((a.querySelector('p.pOf0gc') || {}).textContent || ''),
          missing: kindName === 'missing',
          kind: kindName,
        });
      }
    }

    return out;
  }, kind);
}

function toPayload(rawItems) {
  const pastDue = [];
  const due = [];
  const today = civilToday();
  const horizon = shiftCivil(today, 14);

  for (const raw of rawItems) {
    let dueIso = parseDueText(raw.dueText, !!raw.missing);
    if (!dueIso && raw.missing) {
      dueIso = localNoon(shiftCivil(today, -1));
    }
    if (!dueIso) continue;

    const dueCivil = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(dueIso));

    const item = {
      id: raw.id,
      title: raw.title,
      course: raw.course || '',
      due: dueIso,
      daysLate: null,
    };

    if (raw.missing || dueCivil < today) {
      item.daysLate = daysLateFor(dueIso);
      pastDue.push(item);
    } else if (dueCivil <= horizon) {
      due.push(item);
    }
  }

  // Dedupe by title+course
  function dedupe(list) {
    const s = new Set();
    return list.filter((x) => {
      const k = (x.course + '|' + x.title).toLowerCase();
      if (s.has(k)) return false;
      s.add(k);
      return true;
    });
  }

  const p = dedupe(pastDue).sort((a, b) => new Date(a.due) - new Date(b.due));
  const d = dedupe(due).sort((a, b) => new Date(a.due) - new Date(b.due));
  return {
    kid: KID,
    source: 'scrape',
    pastDue: p,
    due: d,
    truncated: {
      pastDue: Math.max(0, p.length - 6),
      due: Math.max(0, d.length - 8),
    },
  };
}

function saveLast(payload) {
  fs.mkdirSync(path.dirname(LAST_FILE), { recursive: true });
  fs.writeFileSync(LAST_FILE, JSON.stringify(payload, null, 2));
  console.log('Saved', LAST_FILE);
}

async function push(payload) {
  const token = process.env.AGENT_TOKEN || process.env.PRESENCE_TOKEN || '';
  if (!token) throw new Error('Set AGENT_TOKEN (or PRESENCE_TOKEN) in env or .dev.vars');
  saveLast(payload);
  const url = BASE + '/api/classroom?kid=' + encodeURIComponent(KID);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const tip = BASE.includes('127.0.0.1') || BASE.includes('localhost')
      ? 'Start the worker (`npm run build && npm run dev:worker`) or set CLASSROOM_URL to your workers.dev URL, then: npm run classroom:scrape -- --push-last'
      : 'Check CLASSROOM_URL / network, then: npm run classroom:scrape -- --push-last';
    throw new Error('fetch failed posting to ' + url + ' — ' + (err.cause || err.message || err) + '\n' + tip);
  }
  const text = await res.text();
  if (!res.ok) throw new Error('POST failed ' + res.status + ': ' + text.slice(0, 300));
  return JSON.parse(text);
}

async function main() {
  fs.mkdirSync(PROFILE, { recursive: true });

  if (PUSH_LAST) {
    if (!fs.existsSync(LAST_FILE)) {
      throw new Error('No saved scrape at ' + LAST_FILE + ' — run a scrape first');
    }
    const payload = JSON.parse(fs.readFileSync(LAST_FILE, 'utf8'));
    console.log('Pushing last scrape →', BASE, '(past due', payload.pastDue?.length, '| due', payload.due?.length + ')');
    if (DRY) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    const saved = await push(payload);
    console.log('Posted. Server now has', saved.pastDue.length, 'past due,', saved.due.length, 'due.');
    return;
  }

  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: !HEADED,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  let page = context.pages()[0] || await context.newPage();

  try {
    if (FORCE_LOGIN) {
      page = await waitForLogin(context, page);
    } else {
      await page.goto('https://classroom.google.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (isAccountsUrl(page.url()) || !(await pageLooksLoggedIn(page))) {
        if (!HEADED) {
          console.error('Session expired. Re-run with: npm run classroom:login');
          process.exit(2);
        }
        page = await waitForLogin(context, page);
      } else {
        console.log('Existing Classroom session OK —', page.url());
      }
    }

    console.log('Opening Missing…');
    await page.goto(MISSING_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    if (isAccountsUrl(page.url())) {
      throw new Error('Redirected to Google sign-in on Missing page — re-run npm run classroom:login');
    }
    const missing = await extractFromPage(page, 'missing');
    console.log('  found', missing.length, 'row(s)');

    console.log('Opening Assigned…');
    await page.goto(ASSIGNED_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    if (isAccountsUrl(page.url())) {
      throw new Error('Redirected to Google sign-in on Assigned page — re-run npm run classroom:login');
    }
    const assigned = await extractFromPage(page, 'assigned');
    console.log('  found', assigned.length, 'row(s)');

    // Assigned page includes missing items too — prefer missing flag from missing page.
    const byKey = new Map();
    for (const x of assigned) byKey.set((x.course + '|' + x.title).toLowerCase(), x);
    for (const x of missing) byKey.set((x.course + '|' + x.title).toLowerCase(), { ...x, missing: true });

    const payload = toPayload(Array.from(byKey.values()));
    console.log('\nPast due:', payload.pastDue.length, '| Due:', payload.due.length);
    saveLast(payload);
    if (DEBUG || DRY) console.log(JSON.stringify(payload, null, 2));

    if (DRY) {
      console.log('\nDry run — not posting.');
      return;
    }

    const saved = await push(payload);
    console.log('Posted to', BASE + '/api/classroom?kid=' + KID);
    console.log('Server now has', saved.pastDue.length, 'past due,', saved.due.length, 'due.');
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
