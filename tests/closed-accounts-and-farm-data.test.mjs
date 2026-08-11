import test from 'node:test';
import assert from 'node:assert/strict';

process.env.COOKIEBOT_SITES_TOKEN = 'test-project-token';
process.env.COOKIEBOT_API_URL = 'https://legacy.example';
process.env.RENDER_API_URL = 'https://render.example';
process.env.STORAGE_REST_API_URL = 'https://redis.example';
process.env.STORAGE_REST_API_TOKEN = 'redis-token';

const { default: proxy } = await import('../api/proxy.js');
const { normalizeFarmEvent } = await import('../api/farm-store.js');

function apiRequest(path, init = {}) {
  return new Request(
    `https://bot-cookierun-classic.vercel.app/api/proxy?path=${encodeURIComponent(path)}`,
    init
  );
}

// A tiny in-memory Redis stand-in shared by every test below, keyed exactly
// like member-status-store.js and farm-store.js key their real Redis calls.
function fakeRedis() {
  const sets = new Map();
  const strings = new Map();
  return {
    async fetch(url, init) {
      const command = JSON.parse(init.body);
      const [op, key, ...args] = command;
      const set = (k) => sets.get(k) || new Set();
      switch (op) {
        case 'SADD':
          sets.set(key, set(key).add(args[0]));
          return Response.json({ result: 1 });
        case 'SREM':
          set(key).delete(args[0]);
          return Response.json({ result: 1 });
        case 'SISMEMBER':
          return Response.json({ result: set(key).has(args[0]) ? 1 : 0 });
        case 'SMEMBERS':
          return Response.json({ result: [...set(key)] });
        case 'SET':
          strings.set(key, args[0]);
          return Response.json({ result: 'OK' });
        case 'GET':
          return Response.json({ result: strings.get(key) ?? null });
        case 'MGET':
          return Response.json({ result: [key, ...args].map((eventKey) => strings.get(eventKey) ?? null) });
        case 'DEL':
          strings.delete(key);
          return Response.json({ result: 1 });
        case 'ZADD':
          sets.set(key, set(key).add(args[1]));
          strings.set(`__zscore__${key}__${args[1]}`, args[0]);
          return Response.json({ result: 1 });
        case 'ZCARD':
          return Response.json({ result: set(key).size });
        case 'ZREVRANGE': {
          const members = [...set(key)].sort(
            (a, b) => Number(strings.get(`__zscore__${key}__${b}`)) - Number(strings.get(`__zscore__${key}__${a}`))
          );
          return Response.json({ result: members.slice(Number(args[0]), Number(args[1]) + 1) });
        }
        case 'ZREMRANGEBYRANK':
          return Response.json({ result: 0 });
        case 'EXPIRE':
          return Response.json({ result: 1 });
        default:
          if (url.endsWith('/pipeline')) {
            const pipeline = JSON.parse(init.body);
            return Response.json(pipeline.map(([, eventKey]) => ({ result: strings.get(eventKey) ?? null })));
          }
          throw new Error(`Unexpected Redis command ${op}`);
      }
    }
  };
}

const MEMBER = { member_code: 'CKRCS-1234', username: 'codex_user', status: 'active', expires_at: '2099-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' };

test('a disabled member cannot log in even with the right password', async () => {
  const redis = fakeRedis();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = url.toString();
    if (href.startsWith('https://redis.example')) return redis.fetch(href, init);
    if (href.endsWith('/api/auth/login')) return Response.json({ token: 'member-token', memberCode: MEMBER.member_code });
    if (href.endsWith('/api/member/me')) return Response.json({ ...MEMBER, expiresAt: MEMBER.expires_at });
    throw new Error(`Unexpected legacy URL: ${href}`);
  };
  try {
    await redis.fetch('https://redis.example', { body: JSON.stringify(['SADD', 'ckrcs:member-status:v1:disabled', MEMBER.member_code]) });

    const response = await proxy.fetch(apiRequest('auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'codex_user', password: 'safe-password' })
    }));
    assert.equal(response.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a disabled member is rejected from farm-history even with a valid session token', async () => {
  const redis = fakeRedis();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = url.toString();
    if (href.startsWith('https://redis.example')) return redis.fetch(href, init);
    if (href.endsWith('/api/member/me')) return Response.json({ memberCode: MEMBER.member_code });
    throw new Error(`Unexpected legacy URL: ${href}`);
  };
  try {
    await redis.fetch('https://redis.example', { body: JSON.stringify(['SADD', 'ckrcs:member-status:v1:disabled', MEMBER.member_code]) });
    const response = await proxy.fetch(apiRequest('users/farm-history', {
      headers: { authorization: 'Bearer some-token' }
    }));
    assert.equal(response.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin/users hides disabled accounts; admin/users/disabled lists only them', async () => {
  const redis = fakeRedis();
  const originalFetch = globalThis.fetch;
  const otherMember = { ...MEMBER, member_code: 'CKRCS-9999', username: 'still_active' };
  globalThis.fetch = async (url, init) => {
    const href = url.toString();
    if (href.startsWith('https://redis.example')) return redis.fetch(href, init);
    if (href.endsWith('/api/admin/overview')) {
      return Response.json({ members: [MEMBER, otherMember], topups: [] });
    }
    throw new Error(`Unexpected legacy URL: ${href}`);
  };
  try {
    await redis.fetch('https://redis.example', { body: JSON.stringify(['SADD', 'ckrcs:member-status:v1:disabled', MEMBER.member_code]) });

    const activeResponse = await proxy.fetch(apiRequest('admin/users', { headers: { authorization: 'Bearer admin-token' } }));
    const activeData = await activeResponse.json();
    assert.equal(activeData.users.length, 1);
    assert.equal(activeData.users[0].memberCode, 'CKRCS-9999');

    const disabledResponse = await proxy.fetch(apiRequest('admin/users/disabled', { headers: { authorization: 'Bearer admin-token' } }));
    const disabledData = await disabledResponse.json();
    assert.equal(disabledData.users.length, 1);
    assert.equal(disabledData.users[0].memberCode, 'CKRCS-1234');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('disabling then re-enabling a member round-trips through the same store', async () => {
  const redis = fakeRedis();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = url.toString();
    if (href.startsWith('https://redis.example')) return redis.fetch(href, init);
    if (href.endsWith('/api/admin/overview')) return Response.json({ members: [MEMBER], topups: [] });
    throw new Error(`Unexpected legacy URL: ${href}`);
  };
  try {
    const disableResponse = await proxy.fetch(apiRequest(`admin/users/${MEMBER.member_code}/disable`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer admin-token' }
    }));
    assert.equal(disableResponse.status, 200);

    const afterDisable = await proxy.fetch(apiRequest('admin/users', { headers: { authorization: 'Bearer admin-token' } }));
    assert.equal((await afterDisable.json()).users.length, 0);

    const enableResponse = await proxy.fetch(apiRequest(`admin/users/${MEMBER.member_code}/enable`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer admin-token' }
    }));
    assert.equal(enableResponse.status, 200);

    const afterEnable = await proxy.fetch(apiRequest('admin/users', { headers: { authorization: 'Bearer admin-token' } }));
    assert.equal((await afterEnable.json()).users.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin farm-data list aggregates one member\'s events correctly', async () => {
  const redis = fakeRedis();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = url.toString();
    if (href.startsWith('https://redis.example')) return redis.fetch(href, init);
    if (href.endsWith('/api/admin/overview')) return Response.json({ members: [MEMBER], topups: [] });
    throw new Error(`Unexpected legacy URL: ${href}`);
  };
  try {
    const events = [
      normalizeFarmEvent({ eventId: 'evt-0000000000000001', memberCode: MEMBER.member_code, botType: 'coin', runId: 'r1', runRound: 1, coins: 1000, exp: 50, durationSeconds: 300, occurredAt: new Date(Date.now() - 86_400_000).toISOString() }),
      normalizeFarmEvent({ eventId: 'evt-0000000000000002', memberCode: MEMBER.member_code, botType: 'coin', runId: 'r1', runRound: 2, coins: 2000, exp: 60, durationSeconds: 300, occurredAt: new Date().toISOString() })
    ];
    for (const event of events) {
      await redis.fetch('https://redis.example', { body: JSON.stringify(['SET', `ckrcs:farm-history:v1:event:${event.eventId}`, JSON.stringify(event)]) });
      await redis.fetch('https://redis.example', { body: JSON.stringify(['ZADD', `ckrcs:farm-history:v1:member:${MEMBER.member_code}`, String(Date.parse(event.occurredAt)), event.eventId]) });
    }

    const response = await proxy.fetch(apiRequest('admin/farm-data', { headers: { authorization: 'Bearer admin-token' } }));
    const data = await response.json();
    assert.equal(data.members.length, 1);
    assert.equal(data.members[0].memberCode, MEMBER.member_code);
    assert.equal(data.members[0].rounds, 2);
    assert.equal(data.members[0].totalCoins, 3000);
    assert.equal(data.members[0].totalExp, 110);

    const detailResponse = await proxy.fetch(apiRequest(`admin/farm-data/${MEMBER.member_code}`, { headers: { authorization: 'Bearer admin-token' } }));
    const detailData = await detailResponse.json();
    assert.equal(detailData.events.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('listFarmEvents now reads up to MAX_MEMBER_EVENTS instead of the old 2000 cap', async () => {
  const { MAX_MEMBER_EVENTS, listFarmEvents } = await import('../api/farm-store.js');
  const redis = fakeRedis();
  const originalFetch = globalThis.fetch;
  let lastZrevrangeArgs = null;
  globalThis.fetch = async (url, init) => {
    const command = JSON.parse(init.body);
    if (command[0] === 'ZREVRANGE') lastZrevrangeArgs = command;
    return redis.fetch(url.toString(), init);
  };
  try {
    await listFarmEvents('CKRCS-1234');
    assert.equal(lastZrevrangeArgs[2], '0');
    assert.equal(lastZrevrangeArgs[3], String(MAX_MEMBER_EVENTS - 1));
    assert.ok(MAX_MEMBER_EVENTS > 2000, 'the fixed cap must exceed the old 2000 limit');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
