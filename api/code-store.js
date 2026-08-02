const KEY_PREFIX = 'ckrcs:access-code:v1';
const CODE_INDEX_KEY = `${KEY_PREFIX}:index`;
const ADMIN_TOKEN_KEY = `${KEY_PREFIX}:admin-token`;
const VALID_DURATIONS = new Set([60, 1440, 10080, 43200]);

function storageConfig() {
  const url = String(
    process.env.STORAGE_REST_API_URL
    || process.env.KV_REST_API_URL
    || process.env.UPSTASH_REDIS_REST_URL
    || ''
  ).trim().replace(/\/+$/, '');
  const token = String(
    process.env.STORAGE_REST_API_TOKEN
    || process.env.KV_REST_API_TOKEN
    || process.env.UPSTASH_REDIS_REST_TOKEN
    || ''
  ).trim();
  return { url, token };
}

export function codeStorageConfigured() {
  const { url, token } = storageConfig();
  return Boolean(url && token);
}

async function redisRequest(pathname, payload) {
  const { url, token } = storageConfig();
  if (!url || !token) throw new Error('CODE_STORAGE_NOT_CONFIGURED');
  const response = await fetch(`${url}${pathname}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (!Array.isArray(data) && data?.error)) {
    throw new Error(String(data?.error || `REDIS_HTTP_${response.status}`));
  }
  if (Array.isArray(data)) return data;
  return data?.result;
}

export async function redisCommand(...command) {
  return redisRequest('', command);
}

export async function redisPipeline(commands) {
  if (!commands.length) return [];
  const result = await redisRequest('/pipeline', commands);
  return Array.isArray(result) ? result : [];
}

function codeKey(code) {
  return `${KEY_PREFIX}:code:${code}`;
}

function slipKey(reference) {
  return `${KEY_PREFIX}:slip:${reference}`;
}

async function memberSessionKey(token) {
  const bytes = new TextEncoder().encode(String(token));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
  return `${KEY_PREFIX}:member-session:${hash}`;
}

export function normalizeAccessCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^BOT-\d{2}COOKIE-CKR[A-Z]{11}$/.test(code) ? code : '';
}

export function validCodeDuration(value) {
  const durationMinutes = Number(value);
  return VALID_DURATIONS.has(durationMinutes) ? durationMinutes : 0;
}

export function makeAccessCode() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(13));
  const number = String(((bytes[0] << 8) | bytes[1]) % 100).padStart(2, '0');
  const suffix = Array.from(bytes.slice(2), (value) => alphabet[value % alphabet.length]).join('');
  return `BOT-${number}COOKIE-CKR${suffix}`;
}

function parseRecord(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function rememberAdminServiceToken(token, expiresIn = 2_592_000) {
  if (!codeStorageConfigured() || !token) return false;
  const ttl = Math.max(300, Math.min(Number(expiresIn) || 2_592_000, 2_592_000));
  await redisCommand('SET', ADMIN_TOKEN_KEY, String(token), 'EX', String(ttl));
  return true;
}

export async function getAdminServiceToken() {
  if (!codeStorageConfigured()) return '';
  return String(await redisCommand('GET', ADMIN_TOKEN_KEY) || '');
}

export async function rememberMemberSession(token, memberCode, expiresIn = 2_592_000) {
  const cleanToken = String(token || '').trim();
  const cleanMemberCode = String(memberCode || '').trim();
  if (!codeStorageConfigured() || !cleanToken || !cleanMemberCode || cleanMemberCode.length > 180) return false;
  const ttl = Math.max(300, Math.min(Number(expiresIn) || 2_592_000, 2_592_000));
  await redisCommand('SET', await memberSessionKey(cleanToken), cleanMemberCode, 'EX', String(ttl));
  return true;
}

export async function getMemberCodeForSession(token) {
  const cleanToken = String(token || '').trim();
  if (!codeStorageConfigured() || !cleanToken) return '';
  return String(await redisCommand('GET', await memberSessionKey(cleanToken)) || '').trim();
}

async function createUniqueCodeRecord(durationMinutes, source, extra = {}) {
  const duration = validCodeDuration(durationMinutes);
  if (!duration) throw new Error('INVALID_CODE_DURATION');

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = makeAccessCode();
    const createdAt = new Date().toISOString();
    const record = {
      code,
      durationMinutes: duration,
      status: 'available',
      source,
      createdAt,
      ...extra
    };
    const stored = await redisCommand('SET', codeKey(code), JSON.stringify(record), 'NX');
    if (stored === 'OK') {
      await redisCommand('ZADD', CODE_INDEX_KEY, String(Date.now()), code);
      return record;
    }
  }
  throw new Error('CODE_GENERATION_COLLISION');
}

export async function createAccessCodes(count, durationMinutes, source = 'admin') {
  const total = Number(count);
  const duration = validCodeDuration(durationMinutes);
  if (!Number.isInteger(total) || total < 1 || total > 500) throw new Error('INVALID_CODE_COUNT');
  if (!duration) throw new Error('INVALID_CODE_DURATION');

  const records = [];
  for (let offset = 0; offset < total; offset += 50) {
    const batchSize = Math.min(50, total - offset);
    const candidates = Array.from({ length: batchSize }, () => {
      const code = makeAccessCode();
      return {
        code,
        durationMinutes: duration,
        status: 'available',
        source,
        createdAt: new Date().toISOString()
      };
    });
    const results = await redisPipeline(candidates.map((record) => (
      ['SET', codeKey(record.code), JSON.stringify(record), 'NX']
    )));
    const accepted = candidates.filter((_, index) => results[index]?.result === 'OK');
    if (accepted.length) {
      await redisPipeline(accepted.map((record) => (
        ['ZADD', CODE_INDEX_KEY, String(Date.parse(record.createdAt)), record.code]
      )));
      records.push(...accepted);
    }
  }

  while (records.length < total) {
    records.push(await createUniqueCodeRecord(duration, source));
  }
  return records;
}

export async function listAccessCodes(limit = 200) {
  const count = Math.max(1, Math.min(Number(limit) || 200, 500));
  const codes = await redisCommand('ZREVRANGE', CODE_INDEX_KEY, '0', String(count - 1));
  if (!Array.isArray(codes) || !codes.length) return [];
  const values = await redisPipeline(codes.map((code) => ['GET', codeKey(code)]));
  return values
    .map((item) => parseRecord(item?.result))
    .filter(Boolean);
}

const RESERVE_SLIP_CODES_SCRIPT = `
local prior = redis.call('GET', KEYS[1])
if prior then return prior end
for index = 3, #KEYS do
  if redis.call('EXISTS', KEYS[index]) == 1 then return 'COLLISION' end
end
for index = 3, #KEYS do
  local offset = (index - 3) * 2
  local record = ARGV[3 + offset]
  local code = ARGV[4 + offset]
  redis.call('SET', KEYS[index], record)
  redis.call('ZADD', KEYS[2], ARGV[1], code)
end
redis.call('SET', KEYS[1], ARGV[2])
return ARGV[2]
`;

function parseReservedSlipCodes(value) {
  const legacyCode = normalizeAccessCode(value);
  if (legacyCode) return [legacyCode];
  const parsed = parseRecord(value);
  if (!parsed || !Array.isArray(parsed.codes)) return [];
  return parsed.codes.map(normalizeAccessCode).filter(Boolean);
}

export async function reserveSlipAccessCodes({ reference, lineUserId, amount, durationMinutes, count = 1 }) {
  const cleanReference = String(reference || '').trim();
  const cleanLineUserId = String(lineUserId || '').trim();
  const duration = validCodeDuration(durationMinutes);
  const total = Number(count);
  if (!cleanReference || cleanReference.length > 180 || !cleanLineUserId || !duration
    || !Number.isInteger(total) || total < 1 || total > 10) {
    throw new Error('INVALID_SLIP_CODE_DATA');
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const createdAt = new Date().toISOString();
    const records = Array.from({ length: total }, (_, index) => ({
      code: makeAccessCode(),
      durationMinutes: duration,
      status: 'available',
      source: 'line-slip',
      createdAt,
      paymentReference: cleanReference,
      lineUserId: cleanLineUserId,
      amount: Number(amount),
      paymentCodeIndex: index + 1,
      paymentCodeCount: total
    }));
    if (new Set(records.map((record) => record.code)).size !== records.length) continue;
    const slipReservation = JSON.stringify({
      codes: records.map((record) => record.code),
      lineUserId: cleanLineUserId,
      amount: Number(amount),
      durationMinutes: duration
    });
    const keys = [
      slipKey(cleanReference),
      CODE_INDEX_KEY,
      ...records.map((record) => codeKey(record.code))
    ];
    const recordArguments = records.flatMap((record) => [JSON.stringify(record), record.code]);
    const result = await redisCommand(
      'EVAL', RESERVE_SLIP_CODES_SCRIPT, String(keys.length),
      ...keys,
      String(Date.now()), slipReservation, ...recordArguments
    );
    if (result === 'COLLISION') continue;
    const reservedCodes = parseReservedSlipCodes(result);
    if (!reservedCodes.length) throw new Error('SLIP_CODE_RECORD_MISSING');
    const reservedRecords = [];
    for (const reservedCode of reservedCodes) {
      const reserved = await getAccessCode(reservedCode);
      if (!reserved) throw new Error('SLIP_CODE_RECORD_MISSING');
      if (reserved.lineUserId !== cleanLineUserId) throw new Error('SLIP_ALREADY_USED');
      reservedRecords.push(reserved);
    }
    return reservedRecords;
  }
  throw new Error('CODE_GENERATION_COLLISION');
}

export async function reserveSlipAccessCode(options) {
  const records = await reserveSlipAccessCodes({ ...options, count: 1 });
  return records[0];
}

export async function getAccessCode(value) {
  const code = normalizeAccessCode(value);
  if (!code) return null;
  return parseRecord(await redisCommand('GET', codeKey(code)));
}

const CLAIM_CODE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'NOT_FOUND' end
local item = cjson.decode(raw)
if item.status == 'used' then return 'USED' end
if item.status ~= 'available' then return 'PROCESSING' end
item.status = 'processing'
item.claimId = ARGV[1]
item.memberCode = ARGV[2]
item.deviceId = ARGV[3]
item.claimedAt = ARGV[4]
local updated = cjson.encode(item)
redis.call('SET', KEYS[1], updated)
return updated
`;

export async function claimAccessCode(value, memberCode, deviceId) {
  const code = normalizeAccessCode(value);
  if (!code) return { error: 'INVALID' };
  const claimId = crypto.randomUUID();
  const result = await redisCommand(
    'EVAL', CLAIM_CODE_SCRIPT, '1', codeKey(code),
    claimId, String(memberCode), String(deviceId), new Date().toISOString()
  );
  if (result === 'NOT_FOUND') return { error: 'NOT_FOUND' };
  if (result === 'USED') return { error: 'USED' };
  if (result === 'PROCESSING') return { error: 'PROCESSING' };
  const record = parseRecord(result);
  return record ? { claimId, record } : { error: 'FAILED' };
}

const FINISH_CODE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local item = cjson.decode(raw)
if item.status ~= 'processing' or item.claimId ~= ARGV[1] then return 0 end
item.status = 'used'
item.redeemedAt = ARGV[2]
item.expiresAt = ARGV[3]
item.claimId = nil
redis.call('SET', KEYS[1], cjson.encode(item))
return 1
`;

export async function finishAccessCode(value, claimId, expiresAt) {
  const code = normalizeAccessCode(value);
  if (!code) return false;
  const result = await redisCommand(
    'EVAL', FINISH_CODE_SCRIPT, '1', codeKey(code),
    String(claimId), new Date().toISOString(), String(expiresAt || '')
  );
  return Number(result) === 1;
}

const RELEASE_CODE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local item = cjson.decode(raw)
if item.status ~= 'processing' or item.claimId ~= ARGV[1] then return 0 end
item.status = 'available'
item.claimId = nil
item.memberCode = nil
item.deviceId = nil
item.claimedAt = nil
redis.call('SET', KEYS[1], cjson.encode(item))
return 1
`;

export async function releaseAccessCode(value, claimId) {
  const code = normalizeAccessCode(value);
  if (!code) return false;
  const result = await redisCommand('EVAL', RELEASE_CODE_SCRIPT, '1', codeKey(code), String(claimId));
  return Number(result) === 1;
}

export async function markAccessCodeDelivered(value) {
  const code = normalizeAccessCode(value);
  if (!code) return false;
  const record = await getAccessCode(code);
  if (!record) return false;
  record.deliveredAt = new Date().toISOString();
  await redisCommand('SET', codeKey(code), JSON.stringify(record));
  return true;
}
