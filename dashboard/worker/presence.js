import { PEOPLE, bad, bearerOk, clampStr, json } from './util.js';

const KEY = 'presence';

function empty() {
  const o = {};
  for (const id of PEOPLE) o[id] = { home: false, status: '', eta: null, updatedAt: null };
  return o;
}

async function load(env) {
  if (!env.STORE) return empty();
  const raw = await env.STORE.get(KEY, 'json');
  return raw || empty();
}

async function save(env, data) {
  if (!env.STORE) throw new Error('STORE KV binding is missing');
  await env.STORE.put(KEY, JSON.stringify(data));
}

export async function handlePresence(request, env) {
  if (request.method === 'GET') {
    return json({ people: await load(env) });
  }
  if (request.method !== 'POST') return bad('GET or POST only', 405);
  if (!bearerOk(request, env.PRESENCE_TOKEN)) return bad('unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return bad('invalid JSON'); }
  const person = body.person;
  if (PEOPLE.indexOf(person) < 0) return bad('unknown person');
  const status = clampStr(body.status, 40);
  const home = !!body.home;
  let eta = null;
  if (body.eta != null && body.eta !== '') {
    eta = Math.max(0, Math.min(240, Math.round(Number(body.eta))));
    if (Number.isNaN(eta)) return bad('eta must be a number');
  }
  const data = await load(env);
  data[person] = { home, status, eta, updatedAt: new Date().toISOString() };
  await save(env, data);
  return json({ ok: true, person: data[person] });
}
