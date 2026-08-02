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

// Minimal in-memory stand-in for the Upstash REST API, covering only the
// commands the portal store and the presence counter use.
function fakeRedis() {
  const strings = new Map();
  const sortedSets = new Map();

  function run(command) {
    const [name, key, ...args] = command.map(String);
    switch (name.toUpperCase()) {
      case 'GET':
        return strings.has(key) ? strings.get(key) : null;
      case 'SET':
        strings.set(key, args[0]);
        return 'OK';
      case 'ZADD': {
        const members = sortedSets.get(key) || new Map();
        members.set(args[1], Number(args[0]));
        sortedSets.set(key, members);
        return 1;
      }
      case 'ZREMRANGEBYSCORE': {
        const members = sortedSets.get(key) || new Map();
        const max = Number(args[1]);
        let removed = 0;
        for (const [member, score] of [...members]) {
          if (score <= max) {
            members.delete(member);
            removed += 1;
          }
        }
        sortedSets.set(key, members);
        return removed;
      }
      case 'ZCARD':
        return (sortedSets.get(key) || new Map()).size;
      case 'EXPIRE':
        return 1;
      default:
        throw new Error(`Unsupported redis command: ${name}`);
    }
  }

  return { run };
}

function withStubbedBackends(handler) {
  const redis = fakeRedis();
  const legacySettingsCalls = [];
  let legacyState = {
    siteName: 'CKRCS BOT',
    botName: 'CKRCS Bot',
    downloadUrl: 'https://downloads.example/ckrcs-bot.zip',
    promptpayNumber: '0655611571',
    promptpayLabel: 'CKRCS Shop'
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);

    if (target.startsWith('https://redis.example')) {
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
    .finally(() => { globalThis.fetch = originalFetch; });
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

test('stores the four download menu entries with editable labels and links', async () => {
  await withStubbedBackends(async () => {
    const saveResponse = await proxy.fetch(adminRequest('admin/settings', {
      downloadItems: [
        { id: 'farm', label: 'ฟาร์มเงิน', description: 'เก็บเหรียญอัตโนมัติ', url: 'https://files.example/farm.zip' },
        { id: 'powder', label: 'ย่อยผง', description: 'ย่อยผงอัตโนมัติ', url: 'https://files.example/powder.zip' },
        { id: 'friend', label: 'เพิ่มเพื่อน/ส่งใจ', description: 'ส่งใจครบทุกวัน', url: '' },
        { id: 'account', label: 'สมัครไอดี/ส่งใจ/เพิ่มเพื่อน', description: 'สมัครไอดีใหม่', url: 'https://files.example/account.zip' }
      ]
    }));
    assert.equal(saveResponse.status, 200);

    const publicData = await (await proxy.fetch(apiRequest('settings'))).json();
    assert.equal(publicData.downloadItems.length, 4);
    assert.deepEqual(
      publicData.downloadItems.map((item) => [item.id, item.label, item.url]),
      [
        ['farm', 'ฟาร์มเงิน', 'https://files.example/farm.zip'],
        ['powder', 'ย่อยผง', 'https://files.example/powder.zip'],
        ['friend', 'เพิ่มเพื่อน/ส่งใจ', ''],
        ['account', 'สมัครไอดี/ส่งใจ/เพิ่มเพื่อน', 'https://files.example/account.zip']
      ]
    );
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

test('counts each visitor once in the realtime online total', async () => {
  await withStubbedBackends(async () => {
    const first = await (await proxy.fetch(adminRequest('presence/ping', {
      visitorId: 'visitor-aaaaaaaa'
    }))).json();
    assert.deepEqual(first, { online: 1, live: true });

    await proxy.fetch(adminRequest('presence/ping', { visitorId: 'visitor-aaaaaaaa' }));
    const second = await (await proxy.fetch(adminRequest('presence/ping', {
      visitorId: 'visitor-bbbbbbbb'
    }))).json();
    assert.deepEqual(second, { online: 2, live: true });

    const status = await (await proxy.fetch(apiRequest('presence'))).json();
    assert.deepEqual(status, { online: 2, live: true });
  });
});

test('rejects a malformed visitor id', async () => {
  await withStubbedBackends(async () => {
    const response = await proxy.fetch(adminRequest('presence/ping', { visitorId: 'nope!' }));
    assert.equal(response.status, 400);
  });
});
