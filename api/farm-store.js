import { codeStorageConfigured, redisCommand, redisPipeline } from './code-store.js';

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
  if (!codeStorageConfigured()) throw new Error('FARM_STORAGE_NOT_CONFIGURED');
  const event = normalizeFarmEvent(payload);
  const stored = await redisCommand(
    'SET', eventKey(event.eventId), JSON.stringify(event),
    'EX', String(EVENT_TTL_SECONDS), 'NX'
  );
  if (stored !== 'OK') return { event, duplicate: true };

  const indexKey = memberIndexKey(event.memberCode);
  const score = String(Date.parse(event.occurredAt));
  await redisCommand('ZADD', indexKey, score, event.eventId);
  const indexSize = Number(await redisCommand('ZCARD', indexKey)) || 0;
  if (indexSize > MAX_MEMBER_EVENTS) {
    await redisCommand('ZREMRANGEBYRANK', indexKey, '0', String(indexSize - MAX_MEMBER_EVENTS - 1));
  }
  await redisCommand('EXPIRE', indexKey, String(EVENT_TTL_SECONDS));
  return { event, duplicate: false };
}

export async function listFarmEvents(memberCode, limit = MAX_MEMBER_EVENTS) {
  if (!codeStorageConfigured()) return [];
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
  const eventIds = await redisCommand(
    'ZREVRANGE', memberIndexKey(cleanMemberCode), '0', String(count - 1)
  );
  if (!Array.isArray(eventIds) || !eventIds.length) return [];
  const values = await redisPipeline(eventIds.map((eventId) => ['GET', eventKey(eventId)]));
  return values
    .map((item) => parseEvent(item?.result))
    .filter((event) => event?.memberCode === cleanMemberCode);
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
