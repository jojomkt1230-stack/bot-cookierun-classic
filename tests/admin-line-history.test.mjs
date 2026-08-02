import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachMemberNamesToCodes,
  buildLineSlipTopups
} from '../api/proxy.js';

const members = [{
  member_code: 'CKCS-AA238EBD8C5F4951',
  username: 'cookie_player',
  display_name: 'Cookie Player'
}];

test('adds the member username to each redeemed access code', () => {
  const [code] = attachMemberNamesToCodes([{
    code: 'BOT-02COOKIE-CKRVAOFAAAXCDS',
    memberCode: 'CKCS-AA238EBD8C5F4951',
    status: 'used'
  }], members);

  assert.equal(code.memberName, 'cookie_player');
  assert.equal(code.memberCode, 'CKCS-AA238EBD8C5F4951');
});

test('groups LINE-issued codes into one verified payment history item', () => {
  const topups = buildLineSlipTopups([
    {
      code: 'BOT-01COOKIE-CKRABCDEFGHIJK',
      source: 'line-slip',
      paymentReference: 'LINE-SLIP-001',
      lineUserId: 'U1234567890',
      amount: 100,
      durationMinutes: 1440,
      paymentCodeCount: 2,
      memberCode: 'CKCS-AA238EBD8C5F4951',
      createdAt: '2026-08-01T01:00:00.000Z',
      deliveredAt: '2026-08-01T01:00:01.000Z'
    },
    {
      code: 'BOT-02COOKIE-CKRABCDEFGHIJK',
      source: 'line-slip',
      paymentReference: 'LINE-SLIP-001',
      lineUserId: 'U1234567890',
      amount: 100,
      durationMinutes: 1440,
      paymentCodeCount: 2,
      createdAt: '2026-08-01T01:00:00.000Z',
      deliveredAt: '2026-08-01T01:00:01.000Z'
    }
  ], members);

  assert.equal(topups.length, 1);
  assert.equal(topups[0].status, 'approved');
  assert.equal(topups[0].source, 'line-slip');
  assert.equal(topups[0].amount, 100);
  assert.equal(topups[0].codeCount, 2);
  assert.equal(topups[0].memberName, 'cookie_player');
  assert.equal(topups[0].slipRef, 'LINE-SLIP-001');
});
