import { codeStorageConfigured, redisCommand } from './code-store.js';
import { sessionRedisCommand, sessionStorageConfigured } from './session-redis.js';

// Account "disable" is enforced entirely at this proxy layer, independent of
// the legacy member database (which has no such concept and cannot be
// changed from this codebase). Disabling never touches the legacy account,
// farm-history events, or usage history -- it only blocks login/session
// checks here and lets the admin UI list/reactivate by member code.
const STATUS_PREFIX = 'ckrcs:member-status:v1';

function disabledSetKey() {
  return `${STATUS_PREFIX}:disabled`;
}

function disabledMetaKey(memberCode) {
  return `${STATUS_PREFIX}:disabled-meta:${memberCode}`;
}

export async function isMemberDisabled(memberCode) {
  if (!sessionStorageConfigured() || !memberCode) return false;
  const result = await sessionRedisCommand('SISMEMBER', disabledSetKey(), memberCode);
  if (Number(result) === 1) return true;
  if (codeStorageConfigured()) {
    try { return Number(await redisCommand('SISMEMBER', disabledSetKey(), memberCode)) === 1; } catch {}
  }
  return false;
}

export async function listDisabledMemberCodes() {
  if (!sessionStorageConfigured()) return [];
  let current = [];
  try { current = await sessionRedisCommand('SMEMBERS', disabledSetKey()); } catch {}
  const members = Array.isArray(current) ? current : [];
  if (codeStorageConfigured()) {
    try {
      const legacy = await redisCommand('SMEMBERS', disabledSetKey());
      if (Array.isArray(legacy)) members.push(...legacy);
    } catch {}
  }
  return [...new Set(members.map(String))];
}

export async function disableMember(memberCode) {
  if (!sessionStorageConfigured()) throw new Error('MEMBER_STATUS_STORAGE_NOT_CONFIGURED');
  await sessionRedisCommand('SADD', disabledSetKey(), memberCode);
  await sessionRedisCommand('SET', disabledMetaKey(memberCode), JSON.stringify({ disabledAt: new Date().toISOString() }));
}

export async function enableMember(memberCode) {
  if (!sessionStorageConfigured()) throw new Error('MEMBER_STATUS_STORAGE_NOT_CONFIGURED');
  await sessionRedisCommand('SREM', disabledSetKey(), memberCode);
  await sessionRedisCommand('DEL', disabledMetaKey(memberCode));
}

export async function getDisabledMeta(memberCode) {
  if (!sessionStorageConfigured()) return null;
  let raw = null;
  try { raw = await sessionRedisCommand('GET', disabledMetaKey(memberCode)); } catch {}
  if (!raw && codeStorageConfigured()) {
    try { raw = await redisCommand('GET', disabledMetaKey(memberCode)); } catch {}
  }
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
