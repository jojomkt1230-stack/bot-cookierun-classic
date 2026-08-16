import test from 'node:test';
import assert from 'node:assert/strict';

process.env.STORAGE_REST_API_URL = 'https://redis.example';
process.env.STORAGE_REST_API_TOKEN = 'redis-token';

const {
  clearMemberSessions,
  HEARTBEAT_INTERVAL_SECONDS,
  SESSION_TTL_SECONDS,
  normalizeSessionHeartbeat,
  sessionStorageConfigured,
  setMemberIpRestriction,
  setMemberProgramLimit,
  storeSessionHeartbeat
} = await import('../api/session-store.js');

test('reset device clears active program leases and the remembered IP only for that member', async () => {
  const originalFetch = globalThis.fetch;
  const commands = [];
  globalThis.fetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    commands.push(command);
    if (command[0] === 'ZRANGE') {
      return Response.json({ result: ['coin:device-a', 'account:device-b'] });
    }
    return Response.json({ result: 4 });
  };
  try {
    assert.equal(await clearMemberSessions('ckrcs-1234'), 2);
    assert.deepEqual(commands[0], ['ZRANGE', 'ckrcs:bot-session:v2:member:CKRCS-1234', '0', '-1']);
    assert.deepEqual(commands[1], [
      'DEL',
      'ckrcs:bot-session:v2:session:CKRCS-1234:coin:device-a',
      'ckrcs:bot-session:v2:session:CKRCS-1234:account:device-b',
      'ckrcs:bot-session:v2:member:CKRCS-1234',
      'ckrcs:bot-session:v2:last-ip:CKRCS-1234'
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses the dedicated session database and an hourly lease', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  process.env.SESSION_REDIS_REST_URL = 'https://session-redis.example';
  process.env.SESSION_REDIS_REST_TOKEN = 'session-token';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json({ result: 'OK' });
  };
  try {
    assert.equal(sessionStorageConfigured(), true);
    assert.equal(HEARTBEAT_INTERVAL_SECONDS, 3600);
    assert.equal(SESSION_TTL_SECONDS, 4200);
    assert.equal(await setMemberProgramLimit('CKRCS-1234', 9), 9);
    assert.equal(requestedUrl, 'https://session-redis.example');
  } finally {
    delete process.env.SESSION_REDIS_REST_URL;
    delete process.env.SESSION_REDIS_REST_TOKEN;
    globalThis.fetch = originalFetch;
  }
});

test('contract normalizes member, device, bot type and server supplied IP', () => {
  assert.deepEqual(normalizeSessionHeartbeat({
    memberCode: 'ckrcs-1234', deviceId: '01', botType: 'COIN', status: 'RUNNING'
  }, '203.0.113.7'), {
    memberCode: 'CKRCS-1234', deviceId: '01', deviceLabel: '01', botType: 'coin',
    status: 'running', ipAddress: '203.0.113.7', sessionId: 'coin:01'
  });
  assert.throws(() => normalizeSessionHeartbeat({ memberCode: 'CKRCS-1234', deviceId: '01', botType: 'coin', status: 'running' }, ''));
  assert.throws(() => normalizeSessionHeartbeat({ memberCode: 'CKRCS-1234', deviceId: '01', botType: 'other', status: 'running' }, '203.0.113.7'));
});

test('running heartbeat uses one atomic admission-and-write command', async () => {
  const originalFetch = globalThis.fetch;
  const commands = [];
  globalThis.fetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    commands.push(command);
    return Response.json({ result: JSON.stringify({ allowed: true, activeScreens: 4, maxPrograms: 7 }) });
  };
  try {
    const result = await storeSessionHeartbeat(
      { memberCode: 'CKRCS-1234', deviceId: '01', botType: 'coin', status: 'running' },
      '203.0.113.7'
    );
    assert.equal(result.allowed, true);
    assert.equal(result.activeScreens, 4);
    assert.equal(result.maxScreens, 7);
    assert.equal(result.maxPrograms, 7);
    assert.equal(commands.length, 1);
    assert.equal(commands[0][0], 'EVAL');
    assert.equal(commands[0][2], '3');
    const script = commands[0][1];
    assert.doesNotMatch(script, /for _, id in ipairs\(ids\)/);
    assert.match(script, /local comparisonId = existing and sessionId or ids\[1\]/);
    assert.equal((script.match(/redis\.call\('GET'/g) || []).length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin can explicitly disable and restore IP restriction per member', async () => {
  const originalFetch = globalThis.fetch;
  const commands = [];
  globalThis.fetch = async (_url, init) => {
    commands.push(JSON.parse(init.body));
    return Response.json({ result: 'OK' });
  };
  try {
    assert.equal(await setMemberIpRestriction('ckrcs-1234', false), false);
    assert.deepEqual(commands[0], ['SET', 'ckrcs:bot-session:v2:ip-restricted:CKRCS-1234', '0']);
    assert.equal(await setMemberIpRestriction('ckrcs-1234', true), true);
    assert.deepEqual(commands[1], ['SET', 'ckrcs:bot-session:v2:ip-restricted:CKRCS-1234', '1']);
    await assert.rejects(() => setMemberIpRestriction('CKRCS-1234', 'false'), /INVALID_IP_RESTRICTION/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('admin can set a member-specific program limit', async () => {
  const originalFetch = globalThis.fetch;
  const commands = [];
  globalThis.fetch = async (_url, init) => {
    commands.push(JSON.parse(init.body));
    return Response.json({ result: 'OK' });
  };
  try {
    assert.equal(await setMemberProgramLimit('ckrcs-1234', 9), 9);
    assert.deepEqual(commands[0].slice(0, 3), ['SET', 'ckrcs:bot-session:v2:program-limit:CKRCS-1234', '9']);
    await assert.rejects(() => setMemberProgramLimit('CKRCS-1234', 0), /INVALID_PROGRAM_LIMIT/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('denied heartbeat preserves a temporary IP mismatch decision', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    result: JSON.stringify({ allowed: false, reason: 'IP_MISMATCH', activeScreens: 2 })
  });
  try {
    const result = await storeSessionHeartbeat(
      { memberCode: 'CKRCS-1234', deviceId: '02', botType: 'heart', status: 'running' },
      '198.51.100.9'
    );
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'IP_MISMATCH');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
