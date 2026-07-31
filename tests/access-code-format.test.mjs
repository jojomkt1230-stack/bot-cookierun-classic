import assert from 'node:assert/strict';
import test from 'node:test';

import {
  makeAccessCode,
  normalizeAccessCode
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

