// A small stand-in for Supabase's REST API (PostgREST) holding tables in memory. It implements only what the app
// uses, and enforces the same limits that matter: the service key, primary keys, a row cap per request and the
// lock functions. It records every request so tests can inspect them.

const MAX_ROWS = 1000; // Supabase's default per-request cap

function createFakePostgrest({ serviceKey, missingTables = [], failFirst = [] } = {}) {
  const tables = { stories: [], rejected_topics: [], generation_lock: [], generation_runs: [] };
  const requests = [];
  let now = Date.now();
  const failures = [...failFirst]; // statuses to return before behaving, one per request
  const pk = { stories: 'id', rejected_topics: 'title_lower', generation_lock: 'name' };

  const json = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  function applyQuery(rows, params) {
    let out = [...rows];
    for (const [key, value] of params) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
      const m = /^eq\.(.*)$/.exec(value);
      if (m) out = out.filter((r) => String(r[key]) === m[1]);
    }
    const order = params.get('order');
    if (order) {
      const keys = order.split(',').map((o) => o.split('.'));
      out.sort((a, b) => {
        for (const [col, dir] of keys) {
          const cmp = String(a[col]).localeCompare(String(b[col]));
          if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
        }
        return 0;
      });
    }
    const offset = Number(params.get('offset') ?? 0);
    const limit = Math.min(Number(params.get('limit') ?? MAX_ROWS), MAX_ROWS);
    out = out.slice(offset, offset + limit);

    const select = params.get('select');
    if (select && select !== '*') {
      const cols = select.split(',');
      out = out.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
    }
    return out;
  }

  async function fetchImpl(url, init = {}) {
    const u = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ url, method, headers: init.headers || {}, body, cache: init.cache });

    if (failures.length > 0) return json(failures.shift(), { message: 'injected failure' });
    if (init.headers?.apikey !== serviceKey || init.headers?.Authorization !== `Bearer ${serviceKey}`) {
      return json(401, { message: 'Invalid API key' });
    }

    const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(u.pathname);
    if (rpc) {
      if (missingTables.includes('rpc')) return json(404, { code: 'PGRST202', message: `Could not find the function public.${rpc[1]} in the schema cache` });
      const lock = tables.generation_lock.find((l) => l.name === 'generate');
      if (rpc[1] === 'acquire_generation_lock') {
        const stale = lock && now - lock.started_at > body.p_stale_seconds * 1000;
        if (!lock || stale) {
          tables.generation_lock = [{ name: 'generate', owner: body.p_owner, started_at: now }];
          return json(200, true);
        }
        return json(200, lock.owner === body.p_owner);
      }
      if (rpc[1] === 'release_generation_lock') {
        if (lock && lock.owner === body.p_owner) tables.generation_lock = [];
        return json(200, null);
      }
      return json(404, { code: 'PGRST202', message: 'no such function' });
    }

    const m = /^\/rest\/v1\/(\w+)$/.exec(u.pathname);
    if (!m) return json(404, { message: 'not found' });
    const table = m[1];
    if (!(table in tables) || missingTables.includes(table)) {
      return json(404, { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` });
    }

    if (method === 'GET') return json(200, applyQuery(tables[table], u.searchParams));

    if (method === 'POST') {
      const key = pk[table];
      if (key && tables[table].some((r) => r[key] === body[key])) {
        return json(409, { code: '23505', message: `duplicate key value violates unique constraint "${table}_pkey"` });
      }
      tables[table].push({ ...body, ...(key ? {} : { id: tables[table].length + 1 }) });
      return json(201, null);
    }
    return json(405, { message: 'method not allowed' });
  }

  return { fetchImpl, tables, requests, advance: (ms) => { now += ms; } };
}

module.exports = { createFakePostgrest, MAX_ROWS };
