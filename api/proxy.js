const UPSTREAM_ORIGIN = 'https://ibot-cookierun-classic.onrender.com';
const FORWARDED_REQUEST_HEADERS = ['accept', 'authorization', 'content-type'];
const FORWARDED_RESPONSE_HEADERS = [
  'content-disposition',
  'content-type',
  'etag',
  'last-modified'
];

export default {
  async fetch(request) {
    try {
      const requestUrl = new URL(request.url);
      const path = requestUrl.searchParams.get('path');

      const isValidPath = path
        && !path.startsWith('/')
        && !path.includes('..')
        && /^[a-zA-Z0-9/_-]+$/.test(path);

      if (!isValidPath) {
        return Response.json({ error: 'Invalid API path' }, { status: 400 });
      }

      const upstreamSearch = new URLSearchParams(requestUrl.searchParams);
      upstreamSearch.delete('path');
      const query = upstreamSearch.toString();
      const upstreamUrl = `${UPSTREAM_ORIGIN}/api/${path}${query ? `?${query}` : ''}`;

      const headers = new Headers();
      for (const headerName of FORWARDED_REQUEST_HEADERS) {
        const value = request.headers.get(headerName);
        if (value) headers.set(headerName, value);
      }

      const requestInit = {
        method: request.method,
        headers,
        redirect: 'manual'
      };

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        requestInit.body = await request.arrayBuffer();
      }

      const upstreamResponse = await fetch(upstreamUrl, requestInit);
      const responseHeaders = new Headers({
        'Cache-Control': 'no-store'
      });

      for (const headerName of FORWARDED_RESPONSE_HEADERS) {
        const value = upstreamResponse.headers.get(headerName);
        if (value) responseHeaders.set(headerName, value);
      }

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: responseHeaders
      });
    } catch (error) {
      console.error('[API Proxy] Upstream request failed:', error?.message || error);
      return Response.json(
        { error: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์หลักได้ กรุณาลองใหม่อีกครั้ง' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  }
};
