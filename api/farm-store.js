import { codeStorageConfigured, redisCommand, redisPipeline } from './code-store.js';

const FARM_PREFIX = 'ckrcs:farm-history:v1';
const MAX_MEMBER_EVENTS = 5000;
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

export async function listFarmEvents(memberCode, limit = 1000) {
  if (!codeStorageConfigured()) return [];
  const cleanMemberCode = cleanText(memberCode, 180).toUpperCase();
  if (!cleanMemberCode) return [];
  const count = Math.max(1, Math.min(cleanInteger(limit, 2000) || 1000, 2000));
  const eventIds = await redisCommand(
    'ZREVRANGE', memberIndexKey(cleanMemberCode), '0', String(count - 1)
  );
  if (!Array.isArray(eventIds) || !eventIds.length) return [];
  const values = await redisPipeline(eventIds.map((eventId) => ['GET', eventKey(eventId)]));
  return values
    .map((item) => parseEvent(item?.result))
    .filter((event) => event?.memberCode === cleanMemberCode);
}
