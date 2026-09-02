import { codeStorageConfigured, redisCommand } from './code-store.js';
import {
  dedicatedSessionStorageSelected,
  sessionRedisCommand,
  sessionRedisPipeline,
  sessionStorageConfigured
} from './session-redis.js';

const FARM_PREFIX = 'ckrcs:farm-history:v1';
export const MAX_MEMBER_EVENTS = 5000;
const EVENT_TTL_SECONDS = 366 * 24 * 60 * 60;

function cleanText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(Math.trunc(number), maximum));
}

function eventKey(eventId) {
  return `${FARM_PREFIX}:event:${eventId}`;
}

function memberIndexKey(memberCode) {
  return `${FARM_PREFIX}:member:${memberCode}`;
}

const MEMBER_INDEX_PATTERN = `${FARM_PREFIX}:member:*`;

async function scanFarmMemberCodesFrom(command, sourceLabel) {
  const codes = new Set();
  let cursor = '0';
  try {
    // Historical versions created only per-member sorted sets and no global
    // member directory. SCAN is therefore required once to discover old
    // accounts that no longer appear in the legacy account overview.
    do {
      const result = await command('SCAN', cursor, 'MATCH', MEMBER_INDEX_PATTERN, 'COUNT', '1000');
      if (!Array.isArray(result) || result.length < 2) break;
      cursor = String(result[0] ?? '0');
      const keys = Array.isArray(result[1]) ? result[1] : [];
      for (const key of keys) {
        const text = String(key || '');
        if (text.startsWith(`${FARM_PREFIX}:member:`)) {
          const code = cleanText(text.slice(`${FARM_PREFIX}:member:`.length), 180).toUpperCase();
          if (code) codes.add(code);
        }
      }
    } while (cursor !== '0');
  } catch (error) {
    console.error(`[Farm History] ${sourceLabel} member scan unavailable:`, error?.message || error);
  }
  return codes;
}

export async function listFarmMemberCodes() {
  const [current, legacy] = await Promise.all([
    sessionStorageConfigured()
      ? scanFarmMemberCodesFrom(sessionRedisCommand, 'primary storage')
      : new Set(),
    dedicatedSessionStorageSelected() && codeStorageConfigured()
      ? scanFarmMemberCodesFrom(redisCommand, 'legacy storage')
      : new Set()
  ]);
  return [...new Set([...current, ...legacy])];
}

function parseEvent(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeFarmEvent(payload = {}) {
  const eventId = cleanText(payload.eventId, 80);
  const memberCode = cleanText(payload.memberCode, 180).toUpperCase();
  const botType = cleanText(payload.botType, 24).toLowerCase();
  const botVersion = cleanText(payload.botVersion || payload.version || 'ไม่ระบุ', 40);
  const occurredAtDate = new Date(payload.occurredAt || Date.now());

  if (!/^[A-Za-z0-9-]{8,80}$/.test(eventId)) throw new Error('INVALID_EVENT_ID');
  if (!memberCode || memberCode.length > 180) throw new Error('INVALID_MEMBER_CODE');
  if (botType !== 'coin' && botType !== 'powder') throw new Error('INVALID_BOT_TYPE');
  if (Number.isNaN(occurredAtDate.getTime())) throw new Error('INVALID_EVENT_TIME');

  const now = Date.now();
  const occurredAtMs = occurredAtDate.getTime();
  if (occurredAtMs > now + 5 * 60_000 || occurredAtMs < now - EVENT_TTL_SECONDS * 1000) {
    throw new Error('INVALID_EVENT_TIME');
  }

  return {
    eventId,
    memberCode,
    botType,
    botVersion,
    runId: cleanText(payload.runId, 80),
    runRound: Math.max(1, cleanInteger(payload.runRound, 10_000_000)),
    coins: cleanInteger(payload.coins, 10_000_000_000),
    exp: cleanInteger(payload.exp, 10_000_000_000),
    powder: cleanInteger(payload.powder, 10_000_000_000),
    durationSeconds: cleanInteger(payload.durationSeconds, 24 * 60 * 60),
    deviceId: cleanText(payload.deviceId, 180),
    occurredAt: occurredAtDate.toISOString(),
    receivedAt: new Date().toISOString()
  };
}

export async function storeFarmEvent(payload) {
  if (!sessionStorageConfigured()) throw new Error('FARM_STORAGE_NOT_CONFIGURED');
  const event = normalizeFarmEvent(payload);
  const stored = await sessionRedisCommand(
    'SET', eventKey(event.eventId), JSON.stringify(event),
    'EX', String(EVENT_TTL_SECONDS), 'NX'
  );
  if (stored !== 'OK') return { event, duplicate: true };

  const indexKey = memberIndexKey(event.memberCode);
  const score = String(Date.parse(event.occurredAt));
  await sessionRedisCommand('ZADD', indexKey, score, event.eventId);
  const indexSize = Number(await sessionRedisCommand('ZCARD', indexKey)) || 0;
  if (indexSize > MAX_MEMBER_EVENTS) {
    await sessionRedisCommand('ZREMRANGEBYRANK', indexKey, '0', String(indexSize - MAX_MEMBER_EVENTS - 1));
  }
  await sessionRedisCommand('EXPIRE', indexKey, String(EVENT_TTL_SECONDS));
  return { event, duplicate: false };
}

async function readFarmEventsFrom(command, cleanMemberCode, count, sourceLabel) {
  try {
    const eventIds = await command(
      'ZREVRANGE', memberIndexKey(cleanMemberCode), '0', String(count - 1)
    );
    if (!Array.isArray(eventIds) || !eventIds.length) return [];
    const values = await command('MGET', ...eventIds.map((eventId) => eventKey(eventId)));
    return (Array.isArray(values) ? values : [])
      .map((value) => parseEvent(value))
      .filter((event) => event?.memberCode === cleanMemberCode);
  } catch (error) {
    console.error(`[Farm History] ${sourceLabel} unavailable:`, error?.message || error);
    return [];
  }
}

export async function listFarmEvents(memberCode, limit = MAX_MEMBER_EVENTS) {
  if (!sessionStorageConfigured() && !codeStorageConfigured()) return [];
  const cleanMemberCode = cleanText(memberCode, 180).toUpperCase();
  if (!cleanMemberCode) return [];
  // V: this used to cap reads at 2000 even though storeFarmEvent() keeps up
  // to MAX_MEMBER_EVENTS (5000) per member. An active farmer (especially
  // multi-device) can pass 2000 events within a day or two, which silently
  // dropped earlier-in-the-week events from the response -- the weekly/
  // monthly view then had no more real data to sum than the daily view did.
  // Capping at MAX_MEMBER_EVENTS instead means every event actually kept in
  // storage is available to the period filters that already run client-side.
  const count = Math.max(1, Math.min(cleanInteger(limit, MAX_MEMBER_EVENTS) || MAX_MEMBER_EVENTS, MAX_MEMBER_EVENTS));
  // Live incident: raising MAX_MEMBER_EVENTS from 2000 to 5000 turned every
  // farm-history page load into a redisPipeline() of up to 5000 individual
  // GETs. Upstash bills/limits pipelined sub-commands the same as separate
  // requests, so this endpoint alone was burning through the account's
  // request quota (Vercel logs: "ERR max requests limit exceeded. Limit:
  // 500000, Usage: 500000" on every GET /api/users/farm-history, while the
  // single-command bot POST routes kept working fine). MGET fetches the
  // same up-to-5000 keys as ONE Redis command instead of 5000, so this
  // endpoint's quota cost drops from 5000 to 1 per page load without losing
  // any of the weekly/monthly data the 2000->5000 change was fixing.
  const [current, legacy] = await Promise.all([
    sessionStorageConfigured()
      ? readFarmEventsFrom(sessionRedisCommand, cleanMemberCode, count, 'primary storage')
      : [],
    dedicatedSessionStorageSelected() && codeStorageConfigured()
      ? readFarmEventsFrom(redisCommand, cleanMemberCode, count, 'legacy storage')
      : []
  ]);
  const unique = new Map([...current, ...legacy].map((event) => [event.eventId, event]));
  return [...unique.values()]
    .filter((event) => event.botType === 'coin')
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, count);
}

function pipelineResult(value) {
  // Upstash REST pipelines return each row as { result, error }, while the
  // local/fallback adapters historically returned [error, result].  Treating
  // the object as the result itself made listLatestFarmEvents() see no ids,
  // so the admin page filtered every farmer out even though their events were
  // present in Redis.
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.error) throw new Error(String(value.error));
    return value.result;
  }
  if (Array.isArray(value) && value.length === 2 && value[0] == null) return value[1];
  return value;
}

export async function listLatestFarmEvents(memberCodes = []) {
  if (!sessionStorageConfigured()) return new Map();
  const codes = [...new Set(memberCodes.map((value) => cleanText(value, 180).toUpperCase()).filter(Boolean))];
  if (!codes.length) return new Map();
  const rows = await sessionRedisPipeline(codes.map((memberCode) => [
    'ZREVRANGE', memberIndexKey(memberCode), '0', '0'
  ]));
  const pairs = codes.map((memberCode, index) => {
    const ids = pipelineResult(rows[index]);
    return [memberCode, Array.isArray(ids) ? String(ids[0] || '') : ''];
  }).filter(([, eventId]) => eventId);
  if (!pairs.length) return new Map();
  const values = await sessionRedisCommand('MGET', ...pairs.map(([, eventId]) => eventKey(eventId)));
  const latest = new Map();
  pairs.forEach(([memberCode], index) => {
    const event = parseEvent(Array.isArray(values) ? values[index] : null);
    if (event?.memberCode === memberCode && event.botType === 'coin') latest.set(memberCode, event);
  });
  return latest;
}

// Aggregate one member's events for the admin overview table. Kept here
// next to listFarmEvents so the "rounds/coins/exp/duration" definition stays
// in exactly one place, shared by both the per-member detail view and the
// all-members list.
export function summarizeFarmEvents(events) {
  let totalCoins = 0;
  let totalExp = 0;
  let durationSeconds = 0;
  let lastActiveAt = null;
  for (const event of events) {
    totalCoins += Number(event.coins) || 0;
    totalExp += Number(event.exp) || 0;
    durationSeconds += Number(event.durationSeconds) || 0;
    if (!lastActiveAt || Date.parse(event.occurredAt) > Date.parse(lastActiveAt)) {
      lastActiveAt = event.occurredAt;
    }
  }
  return { rounds: events.length, totalCoins, totalExp, durationSeconds, lastActiveAt };
}
