import {
  KIDS, PARENTS, PEOPLE, ROUTINES, bad, clampStr, json, newId,
  shiftDayKey, todayKey, weekdayForDayKey,
} from './util.js';

const KEY = 'lists';

// days: 0=Sun … 6=Sat (JS getDay). everyOther: skip the day after last completion.
const DEFAULT_KID = {
  maya: [
    { r: 'morning', title: 'Brush teeth', emoji: '🪥' },
    { r: 'morning', title: 'Brush hair', emoji: '💇' },
    { r: 'morning', title: 'Pack backpack', emoji: '🎒' },
    { r: 'morning', title: 'Fill water bottle', emoji: '💧' },
    { r: 'morning', title: 'Pack snack', emoji: '🍎' },
    { r: 'after', title: 'Pack cheerleading bag', emoji: '📣', days: [1, 2] }, // Mon–Tue
    { r: 'after', title: 'Empty lunch pack', emoji: '🥪' },
    { r: 'after', title: 'Empty water bottle', emoji: '💧' },
    { r: 'after', title: 'Pull out homework', emoji: '📚' },
    { r: 'evening', title: 'Brush teeth', emoji: '🪥' },
    { r: 'evening', title: 'Set out clothes for tomorrow', emoji: '👕' },
    { r: 'evening', title: 'Brush hair', emoji: '💇' },
    { r: 'evening', title: 'Shower', emoji: '🚿', everyOther: true },
  ],
  otto: [
    { r: 'morning', title: 'Brush teeth', emoji: '🪥' },
    { r: 'morning', title: 'Brush hair', emoji: '💇' },
    { r: 'morning', title: 'Pack backpack', emoji: '🎒' },
    { r: 'morning', title: 'Fill water bottle', emoji: '💧' },
    { r: 'morning', title: 'Pack snack', emoji: '🍎' },
    { r: 'after', title: 'Pack soccer bag', emoji: '⚽', days: [2, 3] }, // Tue–Wed
    { r: 'after', title: 'Empty lunch pack', emoji: '🥪' },
    { r: 'after', title: 'Empty water bottle', emoji: '💧' },
    { r: 'after', title: 'Pull out homework', emoji: '📚' },
    { r: 'evening', title: 'Brush teeth', emoji: '🪥' },
    { r: 'evening', title: 'Set out clothes for tomorrow', emoji: '👕' },
    { r: 'evening', title: 'Shower', emoji: '🚿', everyOther: true },
  ],
};

const DAY_NAMES = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function normalizeDays(days) {
  if (!Array.isArray(days) || !days.length) return null;
  const out = [];
  for (const d of days) {
    if (typeof d === 'number' && d >= 0 && d <= 6) out.push(d);
    else {
      const n = DAY_NAMES[String(d).toLowerCase().trim()];
      if (n != null) out.push(n);
    }
  }
  return out.length ? Array.from(new Set(out)).sort() : null;
}

function normalizeTpl(it) {
  const title = clampStr(it.title, 80);
  if (!title) return null;
  const tpl = {
    r: ROUTINES.indexOf(it.r) >= 0 ? it.r : 'after',
    title,
    emoji: clampStr(it.emoji || '✅', 8) || '✅',
  };
  const days = normalizeDays(it.days);
  if (days) tpl.days = days;
  if (it.everyOther) tpl.everyOther = true;
  return tpl;
}

function everyOtherKey(who, title) {
  return who + ':' + String(title || '').toLowerCase();
}

function tplApplies(tpl, who, day, state) {
  if (tpl.days && tpl.days.length) {
    if (tpl.days.indexOf(weekdayForDayKey(day)) < 0) return false;
  }
  if (tpl.everyOther) {
    const last = (state.everyOtherDone || {})[everyOtherKey(who, tpl.title)];
    if (last && last === shiftDayKey(day, -1)) return false;
  }
  return true;
}

function choreFrom(tpl, who) {
  const c = {
    id: newId('c'),
    r: tpl.r,
    who,
    title: tpl.title,
    emoji: tpl.emoji || '✅',
    stars: 0,
    done: false,
  };
  if (tpl.everyOther) c.everyOther = true;
  return c;
}

function kidChoresForDay(state, who, day) {
  const defaults = state.kidDefaults[who] || [];
  return defaults
    .filter((tpl) => tplApplies(tpl, who, day, state))
    .map((tpl) => choreFrom(tpl, who));
}

function freshState() {
  return {
    day: null,
    chores: [],
    shopping: [],
    kidDefaults: JSON.parse(JSON.stringify(DEFAULT_KID)),
    everyOtherDone: {},
  };
}

async function loadRaw(env) {
  if (!env.STORE) return freshState();
  const raw = await env.STORE.get(KEY, 'json');
  if (!raw) return freshState();
  if (!raw.kidDefaults) raw.kidDefaults = JSON.parse(JSON.stringify(DEFAULT_KID));
  if (!raw.chores) raw.chores = [];
  if (!raw.shopping) raw.shopping = [];
  if (!raw.everyOtherDone) raw.everyOtherDone = {};
  return raw;
}

async function save(env, state) {
  if (!env.STORE) throw new Error('STORE KV binding is missing');
  await env.STORE.put(KEY, JSON.stringify(state));
}

function rollDay(state, day) {
  const openAny = state.chores.filter((c) => c.who === 'any' && !c.done);
  const chores = openAny.slice();
  for (const kid of KIDS) {
    kidChoresForDay(state, kid, day).forEach((c) => chores.push(c));
  }
  state.day = day;
  state.chores = chores;
  return state;
}

function noteEveryOther(state, c) {
  if (!c.everyOther) return;
  if (!state.everyOtherDone) state.everyOtherDone = {};
  const key = everyOtherKey(c.who, c.title);
  if (c.done) state.everyOtherDone[key] = state.day;
  else if (state.everyOtherDone[key] === state.day) delete state.everyOtherDone[key];
}

export async function ensureLists(env) {
  const day = todayKey(env);
  let state = await loadRaw(env);
  if (state.day !== day) {
    state = rollDay(state, day);
    await save(env, state);
  }
  return state;
}

function publicLists(state) {
  return {
    day: state.day,
    chores: state.chores,
    shopping: state.shopping,
    kidDefaults: state.kidDefaults,
  };
}

function applyKidDefaults(state, who, items) {
  state.kidDefaults[who] = items.map(normalizeTpl).filter(Boolean);
  state.chores = state.chores.filter((c) => c.who !== who);
  if (state.day) {
    kidChoresForDay(state, who, state.day).forEach((c) => state.chores.push(c));
  }
}

export async function handleChores(request, env) {
  const state = await ensureLists(env);
  if (request.method === 'GET') return json(publicLists(state));

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return bad('invalid JSON'); }
    const action = body.action || 'patch';

    if (action === 'toggle' || action === 'setDone') {
      const c = state.chores.find((x) => x.id === body.id);
      if (!c) return bad('chore not found', 404);
      c.done = body.done != null ? !!body.done : !c.done;
      if (body.doneBy) c.doneBy = clampStr(body.doneBy, 16);
      if (!c.done) delete c.doneBy;
      noteEveryOther(state, c);
      await save(env, state);
      return json(publicLists(state));
    }

    if (action === 'setToday') {
      const who = body.who;
      if (PARENTS.indexOf(who) < 0) return bad('setToday is for parents only');
      const items = Array.isArray(body.items) ? body.items : [];
      state.chores = state.chores.filter((c) => c.who !== who);
      items.forEach((it) => {
        const tpl = normalizeTpl(it);
        if (tpl) state.chores.push(choreFrom(tpl, who));
      });
      await save(env, state);
      return json(publicLists(state));
    }

    if (action === 'addOpen') {
      const r = ROUTINES.indexOf(body.r) >= 0 ? body.r : 'after';
      const title = clampStr(body.title, 80);
      if (!title) return bad('title required');
      state.chores.push(choreFrom({ r, title, emoji: body.emoji || '✅' }, 'any'));
      await save(env, state);
      return json(publicLists(state));
    }

    if (action === 'setKidDefaults') {
      const who = body.who;
      if (KIDS.indexOf(who) < 0) return bad('unknown kid');
      applyKidDefaults(state, who, Array.isArray(body.items) ? body.items : []);
      await save(env, state);
      return json(publicLists(state));
    }

    if (action === 'resetKidDefaults') {
      // Re-seed both kids from code defaults and rebuild today's kid lanes.
      state.kidDefaults = JSON.parse(JSON.stringify(DEFAULT_KID));
      state.chores = state.chores.filter((c) => c.who !== 'maya' && c.who !== 'otto');
      for (const kid of KIDS) {
        kidChoresForDay(state, kid, state.day).forEach((c) => state.chores.push(c));
      }
      await save(env, state);
      return json(publicLists(state));
    }

    return bad('unknown action');
  }

  return bad('GET or POST only', 405);
}

export async function handleShopping(request, env) {
  const state = await ensureLists(env);
  if (request.method === 'GET') return json({ shopping: state.shopping });

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return bad('invalid JSON'); }
    const action = body.action || 'add';

    if (action === 'add') {
      const name = clampStr(body.name, 80);
      if (!name) return bad('name required');
      const existing = state.shopping.find((g) => !g.done && g.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.qty = Math.max(1, (existing.qty || 1) + (body.qty ? Number(body.qty) : 1));
      } else {
        state.shopping.push({
          id: newId('g'),
          name,
          cat: clampStr(body.cat || 'Other', 40) || 'Other',
          qty: Math.max(1, Number(body.qty) || 1),
          store: clampStr(body.store || 'grocer', 20) || 'grocer',
          done: false,
          note: clampStr(body.note || '', 120),
        });
      }
      await save(env, state);
      return json({ shopping: state.shopping });
    }

    if (action === 'check' || action === 'setDone') {
      const g = state.shopping.find((x) => x.id === body.id);
      if (!g) return bad('item not found', 404);
      g.done = body.done != null ? !!body.done : true;
      await save(env, state);
      return json({ shopping: state.shopping });
    }

    if (action === 'qty') {
      const g = state.shopping.find((x) => x.id === body.id);
      if (!g) return bad('item not found', 404);
      g.qty = Math.max(1, Number(body.qty) || 1);
      await save(env, state);
      return json({ shopping: state.shopping });
    }

    if (action === 'clearDone') {
      state.shopping = state.shopping.filter((g) => !g.done);
      await save(env, state);
      return json({ shopping: state.shopping });
    }

    if (action === 'replace') {
      if (!Array.isArray(body.shopping)) return bad('shopping array required');
      state.shopping = body.shopping.map((g) => ({
        id: g.id || newId('g'),
        name: clampStr(g.name, 80),
        cat: clampStr(g.cat || 'Other', 40) || 'Other',
        qty: Math.max(1, Number(g.qty) || 1),
        store: clampStr(g.store || 'grocer', 20) || 'grocer',
        done: !!g.done,
        note: clampStr(g.note || '', 120),
      })).filter((g) => g.name);
      await save(env, state);
      return json({ shopping: state.shopping });
    }

    return bad('unknown action');
  }

  return bad('GET or POST only', 405);
}

// Helpers used by MCP tools
export async function listShopping(env) {
  const state = await ensureLists(env);
  return state.shopping.filter((g) => !g.done);
}

export async function addShoppingItem(env, args) {
  const state = await ensureLists(env);
  const name = clampStr(args.name, 80);
  if (!name) throw new Error('name required');
  const existing = state.shopping.find((g) => !g.done && g.name.toLowerCase() === name.toLowerCase());
  if (existing) existing.qty += 1;
  else {
    state.shopping.push({
      id: newId('g'), name, cat: args.cat || 'Other', qty: 1,
      store: args.store || 'grocer', done: false, note: args.note || '',
    });
  }
  await save(env, state);
  return state.shopping.filter((g) => !g.done);
}

export async function checkShoppingItem(env, args) {
  const state = await ensureLists(env);
  let g = state.shopping.find((x) => x.id === args.id);
  if (!g && args.name) {
    g = state.shopping.find((x) => !x.done && x.name.toLowerCase() === String(args.name).toLowerCase());
  }
  if (!g) throw new Error('item not found');
  g.done = true;
  await save(env, state);
  return { ok: true, id: g.id, name: g.name };
}

export async function listChores(env) {
  const state = await ensureLists(env);
  return state.chores;
}

export async function setTodayChores(env, args) {
  const who = args.who;
  if (PARENTS.indexOf(who) < 0) throw new Error('who must be alex or jordan');
  const state = await ensureLists(env);
  const items = Array.isArray(args.items) ? args.items : [];
  state.chores = state.chores.filter((c) => c.who !== who);
  items.forEach((it) => {
    const tpl = normalizeTpl(it);
    if (tpl) state.chores.push(choreFrom(tpl, who));
  });
  await save(env, state);
  return state.chores.filter((c) => c.who === who);
}

export async function addOpenChore(env, args) {
  const state = await ensureLists(env);
  const title = clampStr(args.title, 80);
  if (!title) throw new Error('title required');
  const r = ROUTINES.indexOf(args.r) >= 0 ? args.r : 'after';
  const c = choreFrom({ r, title, emoji: args.emoji || '✅' }, 'any');
  state.chores.push(c);
  await save(env, state);
  return c;
}

export async function listKidDefaults(env) {
  const state = await ensureLists(env);
  return state.kidDefaults;
}

export async function setKidDefaults(env, args) {
  const who = args.who;
  if (KIDS.indexOf(who) < 0) throw new Error('who must be maya or otto');
  const state = await ensureLists(env);
  applyKidDefaults(state, who, Array.isArray(args.items) ? args.items : []);
  await save(env, state);
  return state.kidDefaults[who];
}

export { PEOPLE };
