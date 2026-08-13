import { codeStorageConfigured, redisCommand, redisPipeline } from './code-store.js';

function dedicatedSessionConfig() {
  const url = String(process.env.SESSION_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
  const token = String(process.env.SESSION_REDIS_REST_TOKEN || '').trim();
  return { url, token, selected: Boolean(url || token) };
}

export function sessionStorageConfigured() {
  const { url, token, selected } = dedicatedSessionConfig();
  return selected ? Boolean(url && token) : codeStorageConfigured();
}

export function dedicatedSessionStorageSelected() {
  return dedicatedSessionConfig().selected;
}

async function dedicatedRedisRequest(pathname, payload) {
  const { url, token } = dedicatedSessionConfig();
  if (!url || !token) throw new Error('SESSION_STORAGE_NOT_CONFIGURED');
  const response = await fetch(`${url}${pathname}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (!Array.isArray(data) && data?.error)) {
    throw new Error(String(data?.error || `SESSION_REDIS_HTTP_${response.status}`));
  }
  return Array.isArray(data) ? data : data?.result;
}

export async function sessionRedisCommand(...command) {
  return dedicatedSessionConfig().selected
    ? dedicatedRedisRequest('', command)
    : redisCommand(...command);
}

export async function sessionRedisPipeline(commands) {
  if (!commands.length) return [];
  if (!dedicatedSessionConfig().selected) return redisPipeline(commands);
  const result = await dedicatedRedisRequest('/pipeline', commands);
  return Array.isArray(result) ? result : [];
}
