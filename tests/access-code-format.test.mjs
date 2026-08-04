import assert from 'node:assert/strict';
import test from 'node:test';

import {
  makeAccessCode,
  normalizeAccessCode,
  validCodeDuration
} from '../api/code-store.js';

test('creates unique access codes with an 11-letter suffix', () => {
  const codes = Array.from({ length: 5000 }, makeAccessCode);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) {
    assert.match(code, /^BOT-\d{2}COOKIE-CKR[A-Z]{11}$/);
    assert.equal(normalizeAccessCode(code.toLowerCase()), code);
  }
});

test('rejects old seven-letter and malformed formats', () => {
  assert.equal(normalizeAccessCode('bot-12cookie-ckrABCDEFG'), '');
  assert.equal(normalizeAccessCode('bot-1cookie-ckrABCDEFGHIJK'), '');
  assert.equal(normalizeAccessCode(''), '');
});

test('accepts whole-hour access-code durations up to 365 days', () => {
  assert.equal(validCodeDuration(60), 60);
  assert.equal(validCodeDuration((2 * 1440) + (6 * 60)), 3240);
  assert.equal(validCodeDuration(365 * 1440), 365 * 1440);
  assert.equal(validCodeDuration(59), 0);
  assert.equal(validCodeDuration(90), 0);
  assert.equal(validCodeDuration((365 * 1440) + 60), 0);
});
