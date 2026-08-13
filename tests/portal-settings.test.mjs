import test from 'node:test';
import assert from 'node:assert/strict';

process.env.COOKIEBOT_SITES_TOKEN = 'test-project-token';
process.env.COOKIEBOT_API_URL = 'https://legacy.example';
process.env.RENDER_API_URL = 'https://render.example';
process.env.STORAGE_REST_API_URL = 'https://redis.example';
process.env.STORAGE_REST_API_TOKEN = 'redis-token';

const { default: proxy } = await import('../api/proxy.js');

function apiRequest(path, init = {}) {
  return new Request(
    `https://bot-cookierun-classic.vercel.app/api/proxy?path=${encodeURIComponent(path)}`,
    init
  );
}

function adminRequest(path, body) {
  return apiRequest(path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer legacy-admin-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

// Minimal in-memory stand-in for the Upstash REST API, covering only the two
// commands the portal store uses.
function fakeRedis() {
  const strings = new Map();

  function run(command) {
    const [name, key, ...args] = command.map(String);
    switch (name.toUpperCase()) {
      case 'GET':
        return strings.has(key) ? strings.get(key) : null;
      case 'SET':
        strings.set(key, args[0]);
        return 'OK';
      default:
        throw new Error(`Unsupported redis command: ${name}`);
    }
  }

  return { run };
}

function withStubbedBackends(handler, options = {}) {
  const redis = fakeRedis();
  const sessionRedis = fakeRedis();
  const legacySettingsCalls = [];
  let legacyState = {
    siteName: 'CKRCS BOT',
    botName: 'CKRCS Bot',
    downloadUrl: 'https://downloads.example/ckrcs-bot.zip',
    promptpayNumber: '0655611571',
    promptpayLabel: 'CKRCS Shop'
  };

  const originalFetch = globalThis.fetch;
  if (options.dedicatedSession) {
    process.env.SESSION_REDIS_REST_URL = 'https://session-redis.example';
    process.env.SESSION_REDIS_REST_TOKEN = 'session-token';
  }
  globalThis.fetch = async (url, init) => {
    const target = String(url);

    if (target.startsWith('https://session-redis.example')) {
      const body = JSON.parse(init.body);
      return Response.json({ result: sessionRedis.run(body) });
    }
    if (target.startsWith('https://redis.example')) {
      if (options.failLegacyRedis) {
        return Response.json({ error: 'ERR max requests limit exceeded' }, { status: 429 });
      }
      const body = JSON.parse(init.body);
      if (target.endsWith('/pipeline')) {
        return Response.json(body.map((command) => ({ result: redis.run(command) })));
      }
      return Response.json({ result: redis.run(body) });
    }
    if (target.endsWith('/api/admin/overview')) {
      return Response.json({ ...legacyState, members: [], topups: [], plans: {} });
    }
    if (target.endsWith('/api/admin/settings')) {
      const body = JSON.parse(init.body);
      legacySettingsCalls.push(body);
      legacyState = { ...legacyState, ...body };
      return Response.json({ ok: true });
    }
    if (target.endsWith('/api/public/config')) {
      return Response.json({ ...legacyState, plans: {} });
    }
    throw new Error(`Unexpected URL: ${target}`);
  };

  return handler({ legacySettingsCalls })
    .finally(() => {
      delete process.env.SESSION_REDIS_REST_URL;
      delete process.env.SESSION_REDIS_REST_TOKEN;
      globalThis.fetch = originalFetch;
    });
}

test('saves the announcement into portal storage and serves it publicly', async () => {
  await withStubbedBackends(async ({ legacySettingsCalls }) => {
    const announcement = 'ปิดปรับปรุงระบบ 02:00 - 03:00 น.';

    const saveResponse = await proxy.fetch(adminRequest('admin/settings', { announcement }));
    assert.equal(saveResponse.status, 200);

    // The announcement no longer needs the members service, so nothing is
    // smuggled into `siteName` and the save cannot fail on that write.
    assert.deepEqual(legacySettingsCalls, []);

    const adminData = await (await proxy.fetch(apiRequest('admin/settings', {
      headers: { Authorization: 'Bearer legacy-admin-token' }
    }))).json();
    assert.equal(adminData.announcement, announcement);

    const publicData = await (await proxy.fetch(apiRequest('settings'))).json();
    assert.equal(publicData.announcement, announcement);
  });
});

test('keeps the announcement when a later save only changes the bot name', async () => {
  await withStubbedBackends(async () => {
    await proxy.fetch(adminRequest('admin/settings', { announcement: 'ยังเปิดให้บริการปกติ' }));
    await proxy.fetch(adminRequest('admin/settings', { botName: 'Ckrcsbot V19' }));

    const publicData = await (await proxy.fetch(apiRequest('settings'))).json();
    assert.equal(publicData.announcement, 'ยังเปิดให้บริการปกติ');
    assert.equal(publicData.botName, 'Ckrcsbot V19');
  });
});

test('saves bot name and download URL in dedicated storage when legacy Redis is over quota', async () => {
  await withStubbedBackends(async ({ legacySettingsCalls }) => {
    const saveResponse = await proxy.fetch(adminRequest('admin/settings', {
      botName: 'CKRCS Bot V49',
      downloadUrl: 'https://drive.google.com/file/d/v49/view'
    }));
    assert.equal(saveResponse.status, 200);
    assert.deepEqual(legacySettingsCalls, []);

    const adminData = await (await proxy.fetch(apiRequest('admin/settings', {
      headers: { Authorization: 'Bearer legacy-admin-token' }
    }))).json();
    assert.equal(adminData.botName, 'CKRCS Bot V49');
    assert.equal(adminData.botUrl, 'https://drive.google.com/file/d/v49/view');

    const publicData = await (await proxy.fetch(apiRequest('settings'))).json();
    assert.equal(publicData.botName, 'CKRCS Bot V49');
    assert.equal(publicData.downloadUrl, 'https://drive.google.com/file/d/v49/view');
  }, { dedicatedSession: true, failLegacyRedis: true });
});

test('stores the four download menu entries with editable labels and links', async () => {
  await withStubbedBackends(async () => {
    const saveResponse = await proxy.fetch(adminRequest('admin/settings', {
      downloadItems: [
        { id: 'farm', label: 'ฟาร์มเงิน/กล่อง', description: 'เก็บกล่องอัตโนมัติ', url: 'https://files.example/farm.zip' },
        { id: 'powder', label: 'ย่อยผง', description: 'ย่อยผงอัตโนมัติ', url: 'https://files.example/powder.zip' },
        { id: 'friend', label: 'เพิ่มเพื่อน/ส่งใจ', description: 'ส่งใจครบทุกวัน', url: '' },
        { id: 'account', label: 'สมัครไอดี/ส่งใจ/เพิ่มเพื่อน', description: 'สมัครไอดีใหม่ทุกวัน', url: 'https://files.example/account.zip' }
      ]
    }));
    assert.equal(saveResponse.status, 200);

    const publicData = await (await proxy.fetch(apiRequest('settings'))).json();
    assert.equal(publicData.downloadItems.length, 4);
    assert.deepEqual(
      publicData.downloadItems.map((item) => [item.id, item.label, item.description, item.url]),
      [
        ['farm', 'ฟาร์มเงิน/กล่อง', 'เก็บกล่องอัตโนมัติ', 'https://files.example/farm.zip'],
        ['powder', 'ย่อยผง', 'ย่อยผงอัตโนมัติ', 'https://files.example/powder.zip'],
        ['friend', 'เพิ่มเพื่อน/ส่งใจ', 'ส่งใจครบทุกวัน', ''],
        ['account', 'สมัครไอดี/ส่งใจ/เพิ่มเพื่อน', 'สมัครไอดีใหม่ทุกวัน', 'https://files.example/account.zip']
      ]
    );
  });
});

test('stores a newly added bot card and its maintenance status', async () => {
  await withStubbedBackends(async () => {
    const saveResponse = await proxy.fetch(adminRequest('admin/settings', {
      downloadItems: [
        { id: 'farm', icon: '💰📦', label: 'ฟาร์มเงิน/กล่อง', description: 'เก็บกล่อง', status: 'normal', url: '' },
        { id: 'bot-new-1', icon: '🤖', label: 'บอทกิจกรรมใหม่', description: 'รอเปิดให้บริการ', status: 'maintenance', url: '' }
      ]
    }));
    assert.equal(saveResponse.status, 200);

    const publicData = await (await proxy.fetch(apiRequest('settings'))).json();
    assert.equal(publicData.downloadItems.length, 2);
    assert.deepEqual(publicData.downloadItems[1], {
      id: 'bot-new-1',
      icon: '🤖',
      label: 'บอทกิจกรรมใหม่',
      description: 'รอเปิดให้บริการ',
      status: 'maintenance',
      url: '',
      tutorialUrl: ''
    });
  });
});

test('refreshes menu wording the admin never edited, keeping custom text', async () => {
  await withStubbedBackends(async () => {
    // Simulate a config saved before the wording change: farm still carries the
    // old preset text, powder has text the admin typed themselves.
    await proxy.fetch(adminRequest('admin/settings', {
      downloadItems: [
        { id: 'farm', label: 'ฟาร์มเงิน', description: 'วิ่งเก็บเหรียญอัตโนมัติตลอดวัน', url: '' },
        { id: 'powder', label: 'ย่อยผงของผมเอง', description: 'คำอธิบายที่แอดมินพิมพ์เอง', url: '' },
        { id: 'friend', label: 'เพิ่มเพื่อน/ส่งใจ', description: 'เพิ่มเพื่อนและส่งใจให้ครบทุกวัน', url: '' },
        { id: 'account', label: 'สมัครไอดี/ส่งใจ/เพิ่มเพื่อน', description: 'สมัครไอดีใหม่ ส่งใจ และเพิ่มเพื่อนในตัวเดียว', url: '' }
      ]
    }));

    const items = (await (await proxy.fetch(apiRequest('settings'))).json()).downloadItems;
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));

    assert.equal(byId.farm.label, 'ฟาร์มเงิน/กล่อง');
    assert.equal(byId.farm.description, 'วิ่งเก็บกล่องออโต้รันตลอดวัน');
    assert.equal(byId.farm.icon, '💰📦');
    assert.match(byId.friend.description, /ครบ 300 คน/);
    assert.match(byId.account.description, /ขาดหัวใจ/);

    // Admin-authored wording survives untouched.
    assert.equal(byId.powder.label, 'ย่อยผงของผมเอง');
    assert.equal(byId.powder.description, 'คำอธิบายที่แอดมินพิมพ์เอง');
  });
});

test('rejects a download menu link that is not https', async () => {
  await withStubbedBackends(async () => {
    const response = await proxy.fetch(adminRequest('admin/settings', {
      downloadItems: [{ id: 'farm', label: 'ฟาร์มเงิน', url: 'http://files.example/farm.zip' }]
    }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /https:\/\//);
  });
});
