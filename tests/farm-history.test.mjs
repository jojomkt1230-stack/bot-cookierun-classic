import test from 'node:test';
import assert from 'node:assert/strict';

process.env.STORAGE_REST_API_URL = 'https://redis.example';
process.env.STORAGE_REST_API_TOKEN = 'redis-token';

const { listFarmEvents, normalizeFarmEvent, storeFarmEvent } = await import('../api/farm-store.js');

const sample = {
  eventId: '12345678-abcd-4abc-8abc-123456789012',
  memberCode: 'ckrcs-1234',
  botType: 'coin',
  botVersion: 'V22',
  runId: 'run-12345678',
  runRound: 7,
  coins: 123456,
  exp: 7890,
  durationSeconds: 245,
  deviceId: 'device-12345678',
  occurredAt: new Date().toISOString()
};

test('normalizes coin-bot telemetry and keeps the running version', () => {
  const event = normalizeFarmEvent(sample);
  assert.equal(event.memberCode, 'CKRCS-1234');
  assert.equal(event.botType, 'coin');
  assert.equal(event.botVersion, 'V22');
  assert.equal(event.coins, 123456);
  assert.equal(event.durationSeconds, 245);
});

test('stores an event idempotently in the member-only index', async () => {
  const originalFetch = globalThis.fetch;
  const commands = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    commands.push(body);
    const command = body[0];
    if (command === 'SET') return Response.json({ result: 'OK' });
    if (command === 'ZADD' || command === 'EXPIRE') return Response.json({ result: 1 });
    if (command === 'ZCARD') return Response.json({ result: 1 });
    throw new Error(`Unexpected Redis command ${command}`);
  };
  try {
    const result = await storeFarmEvent(sample);
    assert.equal(result.duplicate, false);
    assert.equal(commands[1][0], 'ZADD');
    assert.match(commands[1][1], /member:CKRCS-1234$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns only records belonging to the requested member code', async () => {
  const originalFetch = globalThis.fetch;
  const matching = JSON.stringify(normalizeFarmEvent(sample));
  const other = JSON.stringify(normalizeFarmEvent({
    ...sample,
    eventId: '87654321-abcd-4abc-8abc-123456789012',
    memberCode: 'CKRCS-OTHER'
  }));
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.endsWith('/pipeline')) {
      return Response.json([{ result: matching }, { result: other }]);
    }
    if (body[0] === 'ZREVRANGE') return Response.json({ result: [sample.eventId, 'other-event'] });
    throw new Error(`Unexpected Redis command ${body[0]}`);
  };
  try {
    const events = await listFarmEvents('CKRCS-1234');
    assert.equal(events.length, 1);
    assert.equal(events[0].memberCode, 'CKRCS-1234');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
