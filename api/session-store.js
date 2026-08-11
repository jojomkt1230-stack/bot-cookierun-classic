import { codeStorageConfigured, redisCommand, redisPipeline } from './code-store.js';

const SESSION_PREFIX = 'ckrcs:bot-session:v2';
export const HEARTBEAT_INTERVAL_SECONDS = 60;
export const SESSION_TTL_SECONDS = 90;
export const MAX_ACTIVE_SCREENS = 4;
export const MAX_CONFIGURABLE_PROGRAMS = 100;
export const LAST_IP_TTL_SECONDS = 30 * 24 * 60 * 60;

function cleanText(value, maxLength = 180) {
  return String(value || '').trim().slice(0, maxLength);
}

function memberIndexKey(memberCode) {
  return `${SESSION_PREFIX}:member:${memberCode}`;
}

function sessionKey(memberCode, sessionId) {
  return `${SESSION_PREFIX}:session:${memberCode}:${sessionId}`;
}

function lastIpKey(memberCode) {
  return `${SESSION_PREFIX}:last-ip:${memberCode}`;
}

function programLimitKey(memberCode) {
  return `${SESSION_PREFIX}:program-limit:${memberCode}`;
}

function normalizeProgramLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CONFIGURABLE_PROGRAMS) {
    throw new Error('INVALID_PROGRAM_LIMIT');
  }
  return limit;
}

export async function getMemberProgramLimit(memberCodeValue) {
  const memberCode = cleanText(memberCodeValue).toUpperCase();
  if (!memberCode || !codeStorageConfigured()) return MAX_ACTIVE_SCREENS;
  const stored = Number(await redisCommand('GET', programLimitKey(memberCode)));
  return Number.isInteger(stored) && stored >= 1 && stored <= MAX_CONFIGURABLE_PROGRAMS
    ? stored
    : MAX_ACTIVE_SCREENS;
}

export async function setMemberProgramLimit(memberCodeValue, value) {
  if (!codeStorageConfigured()) throw new Error('SESSION_STORAGE_NOT_CONFIGURED');
  const memberCode = cleanText(memberCodeValue).toUpperCase();
  if (!/^[A-Z0-9-]{8,180}$/.test(memberCode)) throw new Error('INVALID_MEMBER_CODE');
  const limit = normalizeProgramLimit(value);
  await redisCommand('SET', programLimitKey(memberCode), String(limit));
  return limit;
}

function pipelineValue(value) {
  return value && typeof value === 'object' && Object.hasOwn(value, 'result') ? value.result : value;
}

function parseRecord(value) {
  try {
    const record = JSON.parse(String(value || ''));
    return record && typeof record === 'object' ? record : null;
  } catch {
    return null;
  }
}

export function normalizeSessionHeartbeat(payload = {}, sourceIp = '') {
  const memberCode = cleanText(payload.memberCode).toUpperCase();
  const deviceId = cleanText(payload.deviceId, 80);
  const deviceLabel = cleanText(payload.deviceLabel || payload.deviceId, 80);
  const botType = cleanText(payload.botType, 24).toLowerCase();
  const status = cleanText(payload.status, 16).toLowerCase();
  const ipAddress = cleanText(sourceIp, 80);
  if (!/^[A-Z0-9-]{8,180}$/.test(memberCode)) throw new Error('INVALID_MEMBER_CODE');
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(deviceId)) throw new Error('INVALID_DEVICE_ID');
  if (!/^(coin|powder|heart|account)$/.test(botType)) throw new Error('INVALID_BOT_TYPE');
  if (status !== 'running' && status !== 'stopped') throw new Error('INVALID_STATUS');
  if (!ipAddress) throw new Error('INVALID_SOURCE_IP');
  return {
    memberCode, deviceId, deviceLabel, botType, status, ipAddress,
    sessionId: `${botType}:${deviceId}`
  };
}

// All admission checks and the write occur in one Redis script. This prevents
// two bot windows starting at the same instant from both seeing a free slot.
const STORE_SCRIPT = String.raw`
local indexKey = KEYS[1]
local limitKey = KEYS[2]
local sessionPrefix = ARGV[1]
local memberCode = ARGV[2]
local sessionId = ARGV[3]
local sourceIp = ARGV[4]
local status = ARGV[5]
local recordJson = ARGV[6]
local ttl = tonumber(ARGV[7])
local now = tonumber(ARGV[8])
local expiresAt = tonumber(ARGV[9])
local defaultMaxPrograms = tonumber(ARGV[10])
local maxScreens = tonumber(redis.call('GET', limitKey)) or defaultMaxPrograms
local lastIpTtl = tonumber(ARGV[11])
local key = sessionPrefix .. ':session:' .. memberCode .. ':' .. sessionId
redis.call('ZREMRANGEBYSCORE', indexKey, '-inf', now)
if status == 'stopped' then
  redis.call('DEL', key)
  redis.call('ZREM', indexKey, sessionId)
  return cjson.encode({allowed=true, activeScreens=redis.call('ZCARD', indexKey), maxPrograms=maxScreens})
end
local ids = redis.call('ZRANGE', indexKey, 0, -1)
local existing = redis.call('ZSCORE', indexKey, sessionId)
for _, id in ipairs(ids) do
  local raw = redis.call('GET', sessionPrefix .. ':session:' .. memberCode .. ':' .. id)
  if raw then
    local ok, item = pcall(cjson.decode, raw)
    if ok and item.ipAddress and item.ipAddress ~= sourceIp then
      return cjson.encode({allowed=false, reason='IP_MISMATCH', activeScreens=#ids, maxPrograms=maxScreens})
    end
  end
end
if (not existing) and #ids >= maxScreens then
  return cjson.encode({allowed=false, reason='SCREEN_LIMIT', activeScreens=#ids, maxPrograms=maxScreens})
end
redis.call('SET', key, recordJson, 'EX', ttl)
redis.call('ZADD', indexKey, expiresAt, sessionId)
redis.call('EXPIRE', indexKey, ttl)
redis.call('SET', sessionPrefix .. ':last-ip:' .. memberCode, sourceIp, 'EX', lastIpTtl)
return cjson.encode({allowed=true, activeScreens=redis.call('ZCARD', indexKey), maxPrograms=maxScreens})
`;

export async function storeSessionHeartbeat(payload, sourceIp) {
  if (!codeStorageConfigured()) throw new Error('SESSION_STORAGE_NOT_CONFIGURED');
  const heartbeat = normalizeSessionHeartbeat(payload, sourceIp);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;
  const record = {
    ...heartbeat,
    lastSeenAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAt).toISOString()
  };
  const raw = await redisCommand(
    'EVAL', STORE_SCRIPT, '2', memberIndexKey(heartbeat.memberCode), programLimitKey(heartbeat.memberCode),
    SESSION_PREFIX, heartbeat.memberCode, heartbeat.sessionId, heartbeat.ipAddress,
    heartbeat.status, JSON.stringify(record), String(SESSION_TTL_SECONDS),
    String(now), String(expiresAt), String(MAX_ACTIVE_SCREENS), String(LAST_IP_TTL_SECONDS)
  );
  const decision = parseRecord(raw);
  if (!decision) throw new Error('INVALID_SESSION_STORE_RESPONSE');
  return {
    ...heartbeat,
    ...decision,
    // Keep maxScreens for current bot builds; it now means program-window slots.
    maxScreens: Number(decision.maxPrograms || MAX_ACTIVE_SCREENS),
    maxPrograms: Number(decision.maxPrograms || MAX_ACTIVE_SCREENS),
    heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
    expiresAfterSeconds: SESSION_TTL_SECONDS
  };
}

export async function getMemberSessionSummary(memberCodeValue) {
  if (!codeStorageConfigured()) return { activeScreens: 0, activePrograms: 0, maxPrograms: MAX_ACTIVE_SCREENS, sessionIp: '', botSessions: [] };
  const memberCode = cleanText(memberCodeValue).toUpperCase();
  if (!memberCode) return { activeScreens: 0, activePrograms: 0, maxPrograms: MAX_ACTIVE_SCREENS, sessionIp: '', botSessions: [] };
  const maxPrograms = await getMemberProgramLimit(memberCode);
  const indexKey = memberIndexKey(memberCode);
  await redisCommand('ZREMRANGEBYSCORE', indexKey, '-inf', String(Date.now()));
  const ids = await redisCommand('ZRANGE', indexKey, '0', '-1');
  const sessionIds = Array.isArray(ids) ? ids.map(String) : [];
  const lastIp = String(await redisCommand('GET', lastIpKey(memberCode)) || '');
  if (!sessionIds.length) return { activeScreens: 0, activePrograms: 0, maxPrograms, sessionIp: lastIp, botSessions: [] };
  const rows = await redisPipeline(sessionIds.map((id) => ['GET', sessionKey(memberCode, id)]));
  const botSessions = rows.map(pipelineValue).map(parseRecord).filter(Boolean);
  const ips = [...new Set(botSessions.map((item) => item.ipAddress).filter(Boolean))];
  return {
    activeScreens: botSessions.length,
    activePrograms: botSessions.length,
    maxPrograms,
    sessionIp: ips.join(', ') || lastIp,
    botSessions: botSessions.map(({ botType, deviceId, deviceLabel, lastSeenAt }) => ({
      botType, deviceId, deviceLabel, lastSeenAt
    }))
  };
}
