import { codeStorageConfigured, redisCommand } from './code-store.js';

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
  if (!codeStorageConfigured() || !memberCode) return false;
  const result = await redisCommand('SISMEMBER', disabledSetKey(), memberCode);
  return Number(result) === 1;
}

export async function listDisabledMemberCodes() {
  if (!codeStorageConfigured()) return [];
  const members = await redisCommand('SMEMBERS', disabledSetKey());
  return Array.isArray(members) ? members : [];
}

export async function disableMember(memberCode) {
  if (!codeStorageConfigured()) throw new Error('MEMBER_STATUS_STORAGE_NOT_CONFIGURED');
  await redisCommand('SADD', disabledSetKey(), memberCode);
  await redisCommand('SET', disabledMetaKey(memberCode), JSON.stringify({ disabledAt: new Date().toISOString() }));
}

export async function enableMember(memberCode) {
  if (!codeStorageConfigured()) throw new Error('MEMBER_STATUS_STORAGE_NOT_CONFIGURED');
  await redisCommand('SREM', disabledSetKey(), memberCode);
  await redisCommand('DEL', disabledMetaKey(memberCode));
}

export async function getDisabledMeta(memberCode) {
  if (!codeStorageConfigured()) return null;
  const raw = await redisCommand('GET', disabledMetaKey(memberCode));
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
