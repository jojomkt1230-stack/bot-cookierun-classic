import assert from 'node:assert/strict';
import test from 'node:test';

import { reserveSlipAccessCodes } from '../api/code-store.js';
import { lineSlipPlan, lineSlipPlanSummary } from '../api/line-slip-plans.js';

test('maps verified slip amounts to the correct duration and code count', () => {
  assert.deepEqual(lineSlipPlan(1500), { durationMinutes: 1440, codeCount: 1 });
  assert.deepEqual(lineSlipPlan(3000), { durationMinutes: 1440, codeCount: 2 });
  assert.deepEqual(lineSlipPlan(4500), { durationMinutes: 1440, codeCount: 3 });
  assert.deepEqual(lineSlipPlan(10000), { durationMinutes: 10080, codeCount: 1 });
  assert.deepEqual(lineSlipPlan(35000), { durationMinutes: 43200, codeCount: 1 });
});

test('rejects unsupported payment amounts without issuing codes', () => {
  assert.equal(lineSlipPlan(2000), null);
  assert.equal(lineSlipPlan(9999), null);
  assert.match(lineSlipPlanSummary(), /30 บาท = 1 วัน 2 โค้ด/);
  assert.match(lineSlipPlanSummary(), /45 บาท = 1 วัน 3 โค้ด/);
});

test('atomically reserves every code for one verified slip', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.KV_REST_API_URL;
  const originalToken = process.env.KV_REST_API_TOKEN;
  const values = new Map();
  process.env.KV_REST_API_URL = 'https://redis.test';
  process.env.KV_REST_API_TOKEN = 'test-token';

  globalThis.fetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    if (command[0] === 'EVAL') {
      const keyCount = Number(command[2]);
      const keys = command.slice(3, 3 + keyCount);
      const args = command.slice(3 + keyCount);
      const prior = values.get(keys[0]);
      if (prior) return Response.json({ result: prior });
      for (const key of keys.slice(2)) {
        if (values.has(key)) return Response.json({ result: 'COLLISION' });
      }
      for (let index = 2; index < keys.length; index += 1) {
        const offset = (index - 2) * 2;
        values.set(keys[index], args[2 + offset]);
      }
      values.set(keys[0], args[1]);
      return Response.json({ result: args[1] });
    }
    if (command[0] === 'GET') {
      return Response.json({ result: values.get(command[1]) ?? null });
    }
    throw new Error(`Unexpected Redis command: ${command[0]}`);
  };

  try {
    const records = await reserveSlipAccessCodes({
      reference: 'TEST-45-BAHT',
      lineUserId: 'U-test-user',
      amount: 45,
      durationMinutes: 1440,
      count: 3
    });
    assert.equal(records.length, 3);
    assert.equal(new Set(records.map((record) => record.code)).size, 3);
    assert.ok(records.every((record) => record.durationMinutes === 1440));
    assert.deepEqual(records.map((record) => record.paymentCodeIndex), [1, 2, 3]);

    const repeated = await reserveSlipAccessCodes({
      reference: 'TEST-45-BAHT',
      lineUserId: 'U-test-user',
      amount: 45,
      durationMinutes: 1440,
      count: 3
    });
    assert.deepEqual(repeated.map((record) => record.code), records.map((record) => record.code));

    await assert.rejects(
      reserveSlipAccessCodes({
        reference: 'TEST-45-BAHT',
        lineUserId: 'U-other-user',
        amount: 45,
        durationMinutes: 1440,
        count: 3
      }),
      /SLIP_ALREADY_USED/
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = originalUrl;
    if (originalToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = originalToken;
  }
});
