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
    const response = await proxy.fetch(apiRequest('health', {
      headers: {
        Accept: 'application/json',
        Cookie: 'private=session',
        Origin: 'https://bot-cookierun-classic.vercel.app',
        Referer: 'https://bot-cookierun-classic.vercel.app/'
      }
    }));

    assert.equal(response.status, 200);
    assert.equal(captured.url, 'https://render.example/api/health');
    assert.equal(captured.init.headers.get('cookie'), null);
    assert.equal(captured.init.headers.get('origin'), null);
    assert.equal(captured.init.headers.get('referer'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('falls back to the real legacy admin login and returns an admin session', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/api/auth/login')) {
      return Response.json({ error: 'invalid member' }, { status: 401 });
    }
    if (url.endsWith('/api/admin/login')) {
      return Response.json({ token: 'legacy-admin-token', expiresIn: 3600 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const response = await proxy.fetch(apiRequest('auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin_user', password: 'safe-password' })
    }));
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, 'https://legacy.example/api/admin/login');
    assert.equal(data.token, 'legacy-admin-token');
    assert.equal(data.user.role, 'admin');
    assert.equal(data.user.username, 'admin_user');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('maps the real legacy admin overview to the website user table', async () => {
  const originalFetch = globalThis.fetch;
  let captured;

  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return Response.json({
      members: [{
        member_code: 'CKRCS-1234',
        username: 'member_one',
        credits: 77,
        status: 'active',
        expires_at: '2099-01-02T03:04:05.000Z',
        device_name: 'Windows'
      }],
      topups: [],
      orders: []
    });
  };

  try {
    const response = await proxy.fetch(apiRequest('admin/users', {
      headers: { Authorization: 'Bearer legacy-admin-token' }
    }));
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(captured.url, 'https://legacy.example/api/admin/overview');
    assert.equal(
      captured.init.headers.get('authorization'),
      'Bearer legacy-admin-token'
    );
    assert.equal(data.users[0].memberCode, 'CKRCS-1234');
    assert.equal(data.users[0].username, 'member_one');
    assert.equal(data.users[0].diamonds, 77);
    assert.equal(data.users[0].isActive, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('updates a member credit balance through the legacy admin credit API', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/api/admin/overview')) {
      return Response.json({
        members: [{ member_code: 'CKRCS-1234', credits: 20 }],
        topups: [],
        orders: []
      });
    }
    if (url.endsWith('/api/admin/credit')) {
      return Response.json({ ok: true, credits: 50 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const response = await proxy.fetch(apiRequest('admin/users/CKRCS-1234/diamonds', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer legacy-admin-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ diamonds: 50 })
    }));

    assert.equal(response.status, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, 'https://legacy.example/api/admin/credit');
    assert.deepEqual(JSON.parse(calls[1].init.body), {
      memberCode: 'CKRCS-1234',
      delta: 30
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects an invalid upstream path', async () => {
  const response = await proxy.fetch(apiRequest('../admin'));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid API path' });
});

test('persists announcement and tutorial settings without changing the public download link', async () => {
  const originalFetch = globalThis.fetch;
  const initialDownloadUrl = 'https://downloads.example/ckrcs-bot.zip';
  let storedSettings;

  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/api/admin/overview')) {
      return Response.json({
        siteName: 'CKRCS BOT',
        botName: 'CKRCS Bot',
        downloadUrl: storedSettings?.downloadUrl || initialDownloadUrl,
        members: [],
        topups: [],
        plans: {}
      });
    }
    if (url.endsWith('/api/admin/settings')) {
      storedSettings = JSON.parse(init.body);
      return Response.json({ ok: true });
    }
    if (url.endsWith('/api/public/config')) {
      return Response.json({
        siteName: 'CKRCS BOT',
        botName: 'CKRCS Bot',
        downloadUrl: storedSettings.downloadUrl,
        plans: {}
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const saveResponse = await proxy.fetch(apiRequest('admin/settings', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer legacy-admin-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        announcement: 'แจ้งปรับปรุงระบบเวลา 02:00 น.',
        tutorialVideoUrl: 'https://www.youtube.com/watch?v=demo123',
        tutorialColor: 'pink',
        tutorialSteps: ['เปิดโปรแกรม', 'กดเชื่อมต่อ', 'เริ่มใช้งาน']
      })
    }));

    assert.equal(saveResponse.status, 200);
    assert.match(storedSettings.downloadUrl, /^https:\/\/downloads\.example\/ckrcs-bot\.zip#ckrcs=/);

    const botSaveResponse = await proxy.fetch(apiRequest('admin/settings', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer legacy-admin-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        botName: 'CKRCS Bot V2',
        downloadUrl: initialDownloadUrl
      })
    }));
    assert.equal(botSaveResponse.status, 200);

    const publicResponse = await proxy.fetch(apiRequest('settings'));
    const publicData = await publicResponse.json();
    assert.equal(publicResponse.status, 200);
    assert.equal(publicData.announcement, 'แจ้งปรับปรุงระบบเวลา 02:00 น.');
    assert.equal(publicData.downloadUrl, initialDownloadUrl);
    assert.equal(publicData.videoUrl, 'https://www.youtube.com/watch?v=demo123');
    assert.equal(publicData.tutorialColor, 'pink');
    assert.deepEqual(publicData.steps, ['เปิดโปรแกรม', 'กดเชื่อมต่อ', 'เริ่มใช้งาน']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
