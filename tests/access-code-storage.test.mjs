import test from 'node:test';
import assert from 'node:assert/strict';

process.env.STORAGE_REST_API_URL = 'https://legacy-redis.example';
process.env.STORAGE_REST_API_TOKEN = 'legacy-token';
process.env.SESSION_REDIS_REST_URL = 'https://session-redis.example';
process.env.SESSION_REDIS_REST_TOKEN = 'session-token';

const { createAccessCodes, listAccessCodes, reserveSlipAccessCodes } = await import('../api/code-store.js');

function fakeDedicatedRedis() {
  const strings = new Map();
  const sortedSets = new Map();

  function run(input) {
    const command = input.map(String);
    const [name, key, ...args] = command;
    switch (name.toUpperCase()) {
      case 'GET':
        return strings.get(key) ?? null;
      case 'MGET':
        return command.slice(1).map((item) => strings.get(item) ?? null);
      case 'SET': {
        if (args.includes('NX') && strings.has(key)) return null;
        strings.set(key, args[0]);
        return 'OK';
      }
      case 'ZADD': {
        const set = sortedSets.get(key) || new Map();
        set.set(args[1], Number(args[0]));
        sortedSets.set(key, set);
        return 1;
      }
      case 'ZREVRANGE':
        return [...(sortedSets.get(key) || new Map()).entries()]
          .sort((left, right) => right[1] - left[1])
          .slice(Number(args[0]), Number(args[1]) + 1)
          .map(([member]) => member);
      case 'EVAL': {
        const keyCount = Number(command[2]);
        const keys = command.slice(3, 3 + keyCount);
        const scriptArgs = command.slice(3 + keyCount);
        const prior = strings.get(keys[0]);
        if (prior) return prior;
        const reservation = scriptArgs[1];
        for (let index = 2, keyIndex = 2; index < scriptArgs.length; index += 2, keyIndex += 1) {
          const record = scriptArgs[index];
          const code = scriptArgs[index + 1];
          strings.set(keys[keyIndex], record);
          const set = sortedSets.get(keys[1]) || new Map();
          set.set(code, Number(scriptArgs[0]));
          sortedSets.set(keys[1], set);
        }
        strings.set(keys[0], reservation);
        return reservation;
      }
      default:
        throw new Error(`Unsupported command: ${name}`);
    }
  }

  return { run };
}

test('admin and LINE create codes in dedicated Redis while legacy Redis is over quota', async () => {
  const originalFetch = globalThis.fetch;
  const redis = fakeDedicatedRedis();
  let legacyRequests = 0;

  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const payload = JSON.parse(init.body);
    if (target.startsWith('https://legacy-redis.example')) {
      legacyRequests += 1;
      return Response.json({ error: 'ERR max requests limit exceeded' }, { status: 429 });
    }
    if (target.startsWith('https://session-redis.example/pipeline')) {
      return Response.json(payload.map((command) => ({ result: redis.run(command) })));
    }
    if (target.startsWith('https://session-redis.example')) {
      return Response.json({ result: redis.run(payload) });
    }
    throw new Error(`Unexpected URL: ${target}`);
  };

  try {
    const adminCodes = await createAccessCodes(2, 1440, 'admin');
    assert.equal(adminCodes.length, 2);

    const lineCodes = await reserveSlipAccessCodes({
      reference: 'LINE-SLIP-001',
      lineUserId: 'U123456',
      amount: 100,
      durationMinutes: 1440,
      count: 1
    });
    assert.equal(lineCodes.length, 1);
    assert.equal(lineCodes[0].source, 'line-slip');

    const history = await listAccessCodes(200);
    assert.equal(history.length, 3);
    assert.equal(history.filter((record) => record.source === 'admin').length, 2);
    assert.equal(history.filter((record) => record.source === 'line-slip').length, 1);
    assert.ok(legacyRequests > 0, 'legacy history migration was attempted without breaking the page');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
