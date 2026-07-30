import test from 'node:test';
import assert from 'node:assert/strict';

process.env.COOKIEBOT_SITES_TOKEN = 'test-project-token';
process.env.COOKIEBOT_API_URL = 'https://legacy.example';
process.env.RENDER_API_URL = 'https://render.example';

const { default: proxy } = await import('../api/proxy.js');

function apiRequest(path, init = {}) {
  return new Request(
    `https://bot-cookierun-classic.vercel.app/api/proxy?path=${encodeURIComponent(path)}`,
    init
  );
}

test('registers in the legacy member database', async () => {
  const originalFetch = globalThis.fetch;
  let captured;

  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return Response.json(
      { ok: true, memberCode: 'CKRCS-1234', token: 'member-token' },
      { status: 201 }
    );
  };

  try {
    const response = await proxy.fetch(apiRequest('auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'codex_user', password: 'safe-password' })
    }));

    assert.equal(response.status, 201);
    assert.equal(captured.url, 'https://legacy.example/api/auth/register');
    assert.equal(
      captured.init.headers.get('oai-sites-authorization'),
      'Bearer test-project-token'
    );
    assert.deepEqual(JSON.parse(captured.init.body), {
      username: 'codex_user',
      password: 'safe-password'
    });
    assert.equal((await response.json()).memberCode, 'CKRCS-1234');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('logs in and returns the real legacy expiry date', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/api/auth/login')) {
      return Response.json({
        token: 'legacy-member-token',
        memberCode: 'CKRCS-1234'
      });
    }
    if (url.endsWith('/api/member/me')) {
      return Response.json({
        username: 'codex_user',
        memberCode: 'CKRCS-1234',
        status: 'active',
        credits: 88,
        expiresAt: '2099-01-02T03:04:05.000Z'
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const response = await proxy.fetch(apiRequest('auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'codex_user', password: 'safe-password' })
    }));
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://legacy.example/api/auth/login');
    assert.equal(calls[1].url, 'https://legacy.example/api/member/me');
    assert.equal(
      calls[1].init.headers.get('authorization'),
      'Bearer legacy-member-token'
    );
    assert.equal(data.token, 'legacy-member-token');
    assert.equal(data.memberCode, 'CKRCS-1234');
    assert.equal(data.expiresAt, '2099-01-02T03:04:05.000Z');
    assert.equal(data.user.diamonds, 88);
    assert.equal(data.user.valid, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not forward browser origin, cookies, or referer to Render', async () => {
  const originalFetch = globalThis.fetch;
  let captured;

  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return Response.json({ ok: true });
  };

  try {
    const response = await proxy.fetch(apiRequest('settings', {
      headers: {
        Accept: 'application/json',
        Cookie: 'private=session',
        Origin: 'https://bot-cookierun-classic.vercel.app',
        Referer: 'https://bot-cookierun-classic.vercel.app/'
      }
    }));

    assert.equal(response.status, 200);
    assert.equal(captured.url, 'https://render.example/api/settings');
    assert.equal(captured.init.headers.get('cookie'), null);
    assert.equal(captured.init.headers.get('origin'), null);
    assert.equal(captured.init.headers.get('referer'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects an invalid upstream path', async () => {
  const response = await proxy.fetch(apiRequest('../admin'));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid API path' });
});
