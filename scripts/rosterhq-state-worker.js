const STATE_KEY = 'planner-state';
const EMPTY_STATE = {
  completionState: {},
  chestState: {},
  version: 0
};

const ALLOWED_ORIGINS = new Set([
  'https://darealshekel.github.io',
  'http://127.0.0.1:4200',
  'http://localhost:4200'
]);

function buildCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin ?? '') ? origin : 'https://darealshekel.github.io',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function jsonResponse(body, origin, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...buildCorsHeaders(origin)
    }
  });
}

async function readState(env) {
  const state = await env.PLANNER_STATE.get(STATE_KEY, 'json');
  return {
    completionState: state?.completionState ?? {},
    chestState: state?.chestState ?? {},
    version: state?.version ?? 0,
    updatedAt: state?.updatedAt
  };
}

async function writeState(env, state) {
  const nextState = {
    completionState: state.completionState ?? {},
    chestState: state.chestState ?? {},
    version: state.version ?? 0,
    updatedAt: new Date().toISOString()
  };

  await env.PLANNER_STATE.put(STATE_KEY, JSON.stringify(nextState));
  return nextState;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(origin)
      });
    }

    if (url.pathname === '/state' && request.method === 'GET') {
      return jsonResponse(await readState(env), origin);
    }

    if (url.pathname === '/state' && request.method === 'POST') {
      const payload = await request.json().catch(() => null);
      if (
        !payload ||
        (payload.kind !== 'completion' && payload.kind !== 'chest') ||
        typeof payload.key !== 'string' ||
        typeof payload.value !== 'boolean'
      ) {
        return jsonResponse({ error: 'Invalid planner mutation payload.' }, origin, 400);
      }

      const currentState = await readState(env);
      const nextState = {
        ...currentState,
        version: (currentState.version ?? 0) + 1
      };

      if (payload.kind === 'completion') {
        nextState.completionState = {
          ...currentState.completionState,
          [payload.key]: payload.value
        };
      } else {
        nextState.chestState = {
          ...currentState.chestState,
          [payload.key]: payload.value
        };
      }

      return jsonResponse(await writeState(env, nextState), origin);
    }

    if (url.pathname === '/reset' && request.method === 'POST') {
      return jsonResponse(await writeState(env, EMPTY_STATE), origin);
    }

    return jsonResponse({ error: 'Not found.' }, origin, 404);
  }
};
