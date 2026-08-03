import { codeStorageConfigured, redisCommand } from './code-store.js';

const PORTAL_KEY = 'ckrcs:portal-config:v1';

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
