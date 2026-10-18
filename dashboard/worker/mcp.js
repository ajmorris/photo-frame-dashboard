import { bad, bearerOk, json } from './util.js';
import {
  addOpenChore, addShoppingItem, checkShoppingItem, listChores, listKidDefaults,
  listShopping, setKidDefaults, setTodayChores,
} from './lists.js';

const SERVER_INFO = { name: 'home-dashboard', version: '0.1.0' };
const PROTOCOL = '2024-11-05';

const TOOLS = [
  {
    name: 'list_shopping',
    description: 'List open grocery items on the family dashboard shopping list.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'add_shopping_item',
    description: 'Add an item to the family shopping list (or bump quantity if it already exists).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        note: { type: 'string' },
        store: { type: 'string', description: 'grocer or costco' },
        cat: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'check_shopping_item',
    description: 'Mark a shopping item done by id or exact name.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
    },
  },
  {
    name: 'list_chores',
    description: 'List today\'s chores for AJ (alex), Nicole (jordan), Chloe (maya), Hudson (otto), and Up for grabs (any).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'set_today_chores',
    description: 'Replace today\'s chores for a parent. who is alex (AJ) or jordan (Nicole). Each item needs title and r (morning|after|evening).',
    inputSchema: {
      type: 'object',
      properties: {
        who: { type: 'string', enum: ['alex', 'jordan'] },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              r: { type: 'string', enum: ['morning', 'after', 'evening'] },
              emoji: { type: 'string' },
            },
            required: ['title'],
          },
        },
      },
      required: ['who', 'items'],
    },
  },
  {
    name: 'add_open_chore',
    description: 'Add one chore to the Up for grabs (anyone) lane. Does not replace existing open chores.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        r: { type: 'string', enum: ['morning', 'after', 'evening'] },
        emoji: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_kid_defaults',
    description: 'List Chloe (maya) and Hudson (otto) standing daily chore templates.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'set_kid_defaults',
    description: 'Replace a kid\'s standing daily chore template and refresh today\'s lane. who is maya (Chloe) or otto (Hudson). Optional days (0=Sun…6=Sat or mon/tue/…) limits which weekdays the chore appears; everyOther skips the day after it was last completed (e.g. shower).',
    inputSchema: {
      type: 'object',
      properties: {
        who: { type: 'string', enum: ['maya', 'otto'] },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              r: { type: 'string', enum: ['morning', 'after', 'evening'] },
              emoji: { type: 'string' },
              days: {
                type: 'array',
                items: { oneOf: [{ type: 'integer', minimum: 0, maximum: 6 }, { type: 'string' }] },
                description: 'Weekdays this chore appears (e.g. [1,2] or ["mon","tue"])',
              },
              everyOther: { type: 'boolean', description: 'Skip the day after last completion' },
            },
            required: ['title'],
          },
        },
      },
      required: ['who', 'items'],
    },
  },
];

function textResult(data) {
  return {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  };
}

async function callTool(name, args, env) {
  switch (name) {
    case 'list_shopping': return textResult(await listShopping(env));
    case 'add_shopping_item': return textResult(await addShoppingItem(env, args || {}));
    case 'check_shopping_item': return textResult(await checkShoppingItem(env, args || {}));
    case 'list_chores': return textResult(await listChores(env));
    case 'set_today_chores': return textResult(await setTodayChores(env, args || {}));
    case 'add_open_chore': return textResult(await addOpenChore(env, args || {}));
    case 'list_kid_defaults': return textResult(await listKidDefaults(env));
    case 'set_kid_defaults': return textResult(await setKidDefaults(env, args || {}));
    default: throw new Error('unknown tool: ' + name);
  }
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleMessage(msg, env) {
  if (!msg || msg.jsonrpc !== '2.0') return null;
  if (msg.method && msg.id === undefined) return null; // notification

  const id = msg.id;
  try {
    switch (msg.method) {
      case 'initialize':
        return rpcResult(id, {
          protocolVersion: PROTOCOL,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });
      case 'ping':
        return rpcResult(id, {});
      case 'tools/list':
        return rpcResult(id, { tools: TOOLS });
      case 'tools/call': {
        const name = msg.params?.name;
        const args = msg.params?.arguments || {};
        const result = await callTool(name, args, env);
        return rpcResult(id, result);
      }
      default:
        return rpcError(id, -32601, 'Method not found: ' + msg.method);
    }
  } catch (err) {
    return rpcResult(id, {
      content: [{ type: 'text', text: String(err.message || err) }],
      isError: true,
    });
  }
}

export async function handleMcp(request, env) {
  if (request.method === 'GET') {
    // Streamable HTTP may probe with GET; no SSE session needed for stateless tools.
    return new Response(null, { status: 405, headers: { allow: 'POST, OPTIONS' } });
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type, mcp-session-id',
        'access-control-allow-methods': 'POST, OPTIONS',
      },
    });
  }
  if (request.method !== 'POST') return bad('POST only', 405);
  if (!bearerOk(request, env.AGENT_TOKEN)) return bad('unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return bad('invalid JSON'); }

  const messages = Array.isArray(body) ? body : [body];
  const out = [];
  for (const msg of messages) {
    const r = await handleMessage(msg, env);
    if (r) out.push(r);
  }
  if (!out.length) return new Response(null, { status: 202 });
  const payload = Array.isArray(body) ? out : out[0];
  return json(payload, 200, {
    'access-control-allow-origin': '*',
    'mcp-session-id': 'stateless',
  });
}
