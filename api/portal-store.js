import { codeStorageConfigured, redisCommand, redisPipeline } from './code-store.js';

const PORTAL_KEY = 'ckrcs:portal-config:v1';
const PRESENCE_KEY = 'ckrcs:presence:v1';
// A visitor stays counted for this long after its last ping. The frontend pings
// well inside the window so a single missed request never drops the counter.
const PRESENCE_WINDOW_MS = 90_000;

export function portalStorageConfigured() {
  return codeStorageConfigured();
}

export async function readStoredPortalConfig() {
  if (!portalStorageConfigured()) return null;
  const raw = await redisCommand('GET', PORTAL_KEY);
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeStoredPortalConfig(config) {
  if (!portalStorageConfigured()) return false;
  await redisCommand('SET', PORTAL_KEY, JSON.stringify(config));
  return true;
}

export function validVisitorId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : '';
}

export async function touchPresence(visitorId) {
  if (!portalStorageConfigured()) return null;
  const now = Date.now();
  const results = await redisPipeline([
    ['ZADD', PRESENCE_KEY, String(now), visitorId],
    ['ZREMRANGEBYSCORE', PRESENCE_KEY, '-inf', String(now - PRESENCE_WINDOW_MS)],
    ['EXPIRE', PRESENCE_KEY, String(Math.round(PRESENCE_WINDOW_MS / 1000) * 4)],
    ['ZCARD', PRESENCE_KEY]
  ]);
  const online = Number(results.at(-1)?.result);
  return Number.isFinite(online) ? Math.max(0, online) : null;
}

export async function countPresence() {
  if (!portalStorageConfigured()) return null;
  const now = Date.now();
  const results = await redisPipeline([
    ['ZREMRANGEBYSCORE', PRESENCE_KEY, '-inf', String(now - PRESENCE_WINDOW_MS)],
    ['ZCARD', PRESENCE_KEY]
  ]);
  const online = Number(results.at(-1)?.result);
  return Number.isFinite(online) ? Math.max(0, online) : null;
}
