import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeAdminRevenue } from '../api/proxy.js';

test('summarizes approved revenue for Thailand day, 7-day, and 30-day periods', () => {
  const now = new Date('2026-08-20T12:00:00.000Z');
  const summary = summarizeAdminRevenue([
    { status: 'approved', amount: 10, verifiedAt: '2026-08-20T01:00:00.000Z' },
    { status: 'approved', amount: 5, verifiedAt: '2026-08-20T02:00:00.000Z' },
    { status: 'approved', amount: 20, verifiedAt: '2026-08-14T01:00:00.000Z' },
    { status: 'approved', amount: 30, verifiedAt: '2026-07-22T01:00:00.000Z' },
    { status: 'approved', amount: 40, verifiedAt: '2026-07-21T01:00:00.000Z' },
    { status: 'pending', amount: 999, createdAt: '2026-08-20T01:00:00.000Z' }
  ], now);

  assert.equal(summary.todayRevenue, 15);
  assert.equal(summary.weekRevenue, 35);
  assert.equal(summary.monthRevenue, 65);
  assert.deepEqual(summary.revenueHistory, [
    { date: '2026-08-20', total: 15, count: 2 },
    { date: '2026-08-14', total: 20, count: 1 },
    { date: '2026-07-22', total: 30, count: 1 },
    { date: '2026-07-21', total: 40, count: 1 }
  ]);
});

test('keeps old verified records and accepts legacy and camelCase timestamps', () => {
  const now = new Date('2026-08-20T12:00:00.000Z');
  const summary = summarizeAdminRevenue([
    { status: 'verified', amount: 25, verified_at: '2026-08-18T20:00:00.000Z' },
    { status: 'approved', amountSatang: 5000, processedAt: '2026-08-19T20:00:00.000Z' },
    { status: 'approved', amount: 10, created_at: '2026-08-01T01:00:00.000Z' },
    { status: 'cancelled', amount: 999, createdAt: '2026-08-20T01:00:00.000Z' }
  ], now);

  assert.equal(summary.todayRevenue, 50);
  assert.equal(summary.weekRevenue, 75);
  assert.equal(summary.monthRevenue, 85);
  assert.deepEqual(summary.revenueHistory, [
    { date: '2026-08-20', total: 50, count: 1 },
    { date: '2026-08-19', total: 25, count: 1 },
    { date: '2026-08-01', total: 10, count: 1 }
  ]);
});
