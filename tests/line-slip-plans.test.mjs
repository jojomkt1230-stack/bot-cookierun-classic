import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMemberCodeForSession,
  rememberMemberSession,
  reserveSlipAccessCodes
} from '../api/code-store.js';
import {
  lineSlipPlan,
  lineSlipPlanSummary,
  normalizePaymentPlans,
  paymentPlansAreValid
} from '../api/line-slip-plans.js';
import { slip2GoAuthorization } from '../api/slip2go-auth.js';
import { verifyLineSlip } from '../api/proxy.js';

test('formats the Slip2Go API secret as a Bearer authorization header', () => {
  assert.equal(slip2GoAuthorization('secret-key'), 'Bearer secret-key');
  assert.equal(slip2GoAuthorization(' Bearer secret-key '), 'Bearer secret-key');
  assert.equal(slip2GoAuthorization(''), '');
});

test('retries a temporarily missing bank slip and returns the successful result', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    { code: '200404', message: 'not found' },
    { code: '200404', message: 'not found' },
    { code: '200200', data: { amount: 20, transRef: 'TEST-REF' } }
  ];
  let calls = 0;
  globalThis.fetch = async () => Response.json(responses[calls++]);

  try {
    const verified = await verifyLineSlip(new FormData(), 'Bearer test', 'line-message', [0, 0, 0]);
    assert.equal(calls, 3);
    assert.equal(verified.result.code, '200200');
    assert.equal(verified.result.data.amount, 20);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not retry a permanent slip verification failure', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ code: '400001', message: 'invalid QR' }, { status: 400 });
  };

  try {
    const verified = await verifyLineSlip(new FormData(), 'Bearer test', 'line-message', [0, 0, 0]);
    assert.equal(calls, 1);
    assert.equal(verified.result.code, '400001');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
  assert.match(lineSlipPlanSummary(), /30 บาท = 2 วัน/);
  assert.match(lineSlipPlanSummary(), /45 บาท = 3 วัน/);
});

test('uses admin-configured prices and days for LINE slip issuance', () => {
  const plans = [{ amount: 25, days: 2 }, { amount: 80, days: 5 }];
  assert.equal(paymentPlansAreValid(plans), true);
  assert.deepEqual(lineSlipPlan(2500, plans), { durationMinutes: 1440, codeCount: 2 });
  assert.deepEqual(lineSlipPlan(8000, plans), { durationMinutes: 7200, codeCount: 1 });
  assert.equal(lineSlipPlan(1500, plans), null);
  assert.deepEqual(normalizePaymentPlans(plans), plans);
  assert.equal(paymentPlansAreValid([{ amount: 25, days: 2 }, { amount: 25, days: 5 }]), false);
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

test('remembers the member code by a hashed session token', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.KV_REST_API_URL;
  const originalToken = process.env.KV_REST_API_TOKEN;
  const values = new Map();
  const commands = [];
  process.env.KV_REST_API_URL = 'https://redis.test';
  process.env.KV_REST_API_TOKEN = 'test-token';

  globalThis.fetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    commands.push(command);
    if (command[0] === 'SET') {
      values.set(command[1], command[2]);
      return Response.json({ result: 'OK' });
    }
    if (command[0] === 'GET') {
      return Response.json({ result: values.get(command[1]) ?? null });
    }
    throw new Error(`Unexpected Redis command: ${command[0]}`);
  };

  try {
    assert.equal(await rememberMemberSession('member-token-secret', 'CKRCS-1234'), true);
    assert.equal(await getMemberCodeForSession('member-token-secret'), 'CKRCS-1234');
    assert.ok(commands.every((command) => !String(command[1]).includes('member-token-secret')));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = originalUrl;
    if (originalToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = originalToken;
  }
});
