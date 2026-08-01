export function slip2GoAuthorization(secretValue) {
  const secret = String(secretValue || '').trim();
  if (!secret) return '';
  return /^Bearer\s+/i.test(secret) ? secret : `Bearer ${secret}`;
}
