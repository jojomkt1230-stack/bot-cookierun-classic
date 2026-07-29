import test from 'node:test';
import assert from 'node:assert/strict';
import proxy from '../api/proxy.js';

test('forwards an auth request without browser origin or cookies', async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequest;

  globalThis.fetch = async (url, init) => {
    capturedRequest = { url, init };
    return new Response(JSON.stringify({ error: 'Invalid username or password' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': 'must-not-be-forwarded'
      }
    });
  };

  try {
    const request = new Request(
      'https://bot-cookierun-classic.vercel.app/api/proxy?path=auth%2Flogin',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
          Cookie: 'session=private',
          Origin: 'https://bot-cookierun-classic.vercel.app',
          Referer: 'https://bot-cookierun-classic.vercel.app/'
        },
        body: JSON.stringify({
          username: 'codex_qa_nonexistent',
          password: 'not-a-real-password'
        })
      }
    );

    const response = await proxy.fetch(request);

    assert.equal(capturedRequest.url, 'https://ibot-cookierun-classic.onrender.com/api/auth/login');
    assert.equal(capturedRequest.init.method, 'POST');
    assert.equal(capturedRequest.init.headers.get('origin'), null);
    assert.equal(capturedRequest.init.headers.get('cookie'), null);
    assert.equal(capturedRequest.init.headers.get('referer'), null);
    assert.equal(capturedRequest.init.headers.get('content-type'), 'application/json');
    assert.equal(
      new TextDecoder().decode(capturedRequest.init.body),
      JSON.stringify({
        username: 'codex_qa_nonexistent',
        password: 'not-a-real-password'
      })
    );

    assert.equal(response.status, 401);
    assert.equal(response.headers.get('content-type'), 'application/json');
    assert.equal(response.headers.get('x-internal-secret'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'Invalid username or password' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects an invalid upstream path', async () => {
  const request = new Request(
    'https://bot-cookierun-classic.vercel.app/api/proxy?path=..%2Fadmin'
  );
  const response = await proxy.fetch(request);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid API path' });
});
