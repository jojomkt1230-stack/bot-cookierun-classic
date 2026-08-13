import { codeStorageConfigured, redisCommand } from './code-store.js';
import { sessionRedisCommand, sessionStorageConfigured } from './session-redis.js';

const PORTAL_KEY = 'ckrcs:portal-config:v1';

export function portalStorageConfigured() {
  return sessionStorageConfigured();
}

export async function readStoredPortalConfig() {
  if (!portalStorageConfigured()) return null;
  let raw = null;
  try {
    // Prefer the dedicated Redis used by bot sessions. The original storage
    // can hit its request quota because it also contains farm history.
    raw = await sessionRedisCommand('GET', PORTAL_KEY);
  } catch (error) {
    console.error('[Portal] Dedicated Redis read failed:', error?.message || error);
  }

  // Migration fallback: keep reading settings saved before the dedicated
  // database was introduced. A subsequent save moves them to the new store.
  if (!raw && codeStorageConfigured()) {
    try {
      raw = await redisCommand('GET', PORTAL_KEY);
    } catch (error) {
      console.error('[Portal] Legacy Redis read failed:', error?.message || error);
    }
  }
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
  await sessionRedisCommand('SET', PORTAL_KEY, JSON.stringify(config));
  return true;
}
