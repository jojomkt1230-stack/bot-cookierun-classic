const LEGACY_API_ORIGIN = (
  process.env.COOKIEBOT_API_URL
  || 'https://cookiebot-th.surijenafallon0.chatgpt.site'
).replace(/\/+$/, '');

const RENDER_API_ORIGIN = (
  process.env.RENDER_API_URL
  || 'https://ibot-cookierun-classic.onrender.com'
).replace(/\/+$/, '');

const FORWARDED_REQUEST_HEADERS = ['accept', 'authorization', 'content-type'];
const FORWARDED_RESPONSE_HEADERS = [
  'content-disposition',
  'content-type',
  'etag',
  'last-modified'
];

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function safePath(value) {
  return Boolean(
    value
    && !value.startsWith('/')
    && !value.includes('..')
    && /^[a-zA-Z0-9/_-]+$/.test(value)
  );
}

async function readJson(request) {
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function sitesToken() {
  return String(process.env.COOKIEBOT_SITES_TOKEN || '').trim();
}

function legacyHeaders(request, { includeContentType = true, memberToken = '' } = {}) {
  const headers = new Headers({ Accept: 'application/json' });
  const projectToken = sitesToken();

  if (projectToken) {
    headers.set('OAI-Sites-Authorization', `Bearer ${projectToken}`);
  }

  const authorization = memberToken
    ? `Bearer ${memberToken}`
    : request.headers.get('authorization');
  if (authorization) headers.set('Authorization', authorization);

  if (includeContentType) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }

  return headers;
}

async function legacyFetch(request, pathname, {
  method = request.method,
  body,
  memberToken = '',
  includeContentType = true
} = {}) {
  if (!sitesToken()) {
    return json({
      error: 'เซิร์ฟเวอร์ Vercel ยังไม่ได้ตั้งค่า COOKIEBOT_SITES_TOKEN'
    }, 500);
  }

  return fetch(`${LEGACY_API_ORIGIN}${pathname}`, {
    method,
    headers: legacyHeaders(request, { includeContentType, memberToken }),
    body,
    redirect: 'manual'
  });
}

async function responseData(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: 'ระบบสมาชิกเดิมตอบกลับไม่ถูกต้อง' };
  }
}

function publicUser(member, memberCode) {
  const expiresAt = typeof member?.expiresAt === 'string' ? member.expiresAt : null;
  const status = String(member?.status || 'pending');
  const valid = status === 'active'
    && Boolean(expiresAt)
    && Date.parse(expiresAt) > Date.now();

  return {
    id: memberCode,
    username: String(member?.username || ''),
    email: '',
    role: 'user',
    diamonds: Number(member?.credits || 0),
    memberCode,
    botExpiry: expiresAt,
    expiresAt,
    status: valid ? 'active' : status,
    valid
  };
}

async function registerWithLegacy(request) {
  const payload = await readJson(request);
  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');

  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
    return json({
      error: 'ชื่อผู้ใช้ต้องยาว 3-32 ตัว และใช้ได้เฉพาะ a-z, A-Z, 0-9, จุด, ขีดกลาง หรือขีดล่าง'
    }, 422);
  }
  if (password.length < 8 || password.length > 128) {
    return json({ error: 'รหัสผ่านต้องยาว 8-128 ตัวอักษร' }, 422);
  }

  const upstream = await legacyFetch(request, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  const data = await responseData(upstream);

  if (!upstream.ok) {
    return json({ error: data.error || 'สมัครสมาชิกไม่สำเร็จ' }, upstream.status);
  }

  return json({
    ok: true,
    message: 'สมัครสมาชิกสำเร็จ ใช้บัญชีนี้ล็อกอินบอทได้ทันที',
    memberCode: data.memberCode || '',
    token: data.token || ''
  }, 201);
}

async function loginWithLegacy(request) {
  const payload = await readJson(request);
  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');

  if (!username || !password) {
    return json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' }, 400);
  }

  const authResponse = await legacyFetch(request, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  const auth = await responseData(authResponse);

  if (!authResponse.ok) {
    return json({
      error: auth.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
    }, authResponse.status);
  }

  const token = String(auth.token || '');
  const memberCode = String(auth.memberCode || '');
  if (!token || !memberCode) {
    return json({ error: 'ระบบสมาชิกเดิมส่งข้อมูลบัญชีไม่ครบ' }, 502);
  }

  const memberResponse = await legacyFetch(request, '/api/member/me', {
    method: 'GET',
    memberToken: token
  });
  const member = await responseData(memberResponse);
  if (!memberResponse.ok) {
    return json({
      error: member.error || 'ไม่สามารถอ่านข้อมูลวันหมดอายุได้'
    }, memberResponse.status);
  }

  const user = publicUser(member, memberCode);
  return json({
    ok: true,
    token,
    memberCode,
    expiresAt: user.expiresAt,
    valid: user.valid,
    user
  });
}

async function memberMe(request) {
  const upstream = await legacyFetch(request, '/api/member/me', {
    method: 'GET'
  });
  const member = await responseData(upstream);
  if (!upstream.ok) return json(member, upstream.status);

  const token = request.headers.get('authorization') || '';
  const memberCode = String(member.memberCode || '');
  const user = publicUser(member, memberCode);

  return json({
    ...user,
    tokenPresent: token.startsWith('Bearer ')
  });
}

function planForDays(days) {
  return ({
    1: 'day1',
    3: 'day3',
    7: 'day7',
    30: 'month1'
  })[Number(days)] || null;
}

async function purchaseLegacyPlan(request) {
  const payload = await readJson(request);
  const planId = planForDays(payload.days);
  if (!planId) {
    return json({ error: 'รองรับแพ็กเกจ 1, 3, 7 หรือ 30 วันเท่านั้น' }, 400);
  }

  const upstream = await legacyFetch(request, '/api/member/purchase', {
    method: 'POST',
    body: JSON.stringify({ planId })
  });
  const data = await responseData(upstream);
  if (!upstream.ok) return json(data, upstream.status);

  return json({
    ok: true,
    message: data.message || 'ซื้อแพ็กเกจสำเร็จ',
    diamonds: Number(data.credits || 0),
    credits: Number(data.credits || 0),
    botExpiry: data.expiresAt || null,
    expiresAt: data.expiresAt || null
  });
}

async function createLegacyTopup(request) {
  const payload = await readJson(request);
  const amount = Number(payload.amountBaht);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
    return json({ error: 'จำนวนเงินไม่ถูกต้อง' }, 400);
  }

  const upstream = await legacyFetch(request, '/api/member/topup', {
    method: 'POST',
    body: JSON.stringify({ amount })
  });
  const data = await responseData(upstream);
  if (!upstream.ok) return json(data, upstream.status);

  return json({
    ok: true,
    orderId: data.topupId,
    topupId: data.topupId,
    amountBaht: Number(data.amount || amount),
    creditToReceive: Number(data.credits || amount),
    promptpayNumber: data.promptpayNumber || '',
    promptpayLabel: data.promptpayLabel || '',
    paymentQrUrl: data.paymentQrUrl || ''
  }, 201);
}

async function verifyLegacyTopup(request) {
  let incoming;
  try {
    incoming = await request.formData();
  } catch {
    return json({ error: 'ข้อมูลสลิปไม่ถูกต้อง' }, 400);
  }

  const image = incoming.get('image');
  const orderId = String(incoming.get('orderId') || '');
  if (!(image instanceof File) || !orderId) {
    return json({ error: 'กรุณาเลือกรูปสลิปและระบุรายการเติมเงิน' }, 400);
  }

  const form = new FormData();
  form.set('topupId', orderId);
  form.set('file', image, image.name || 'slip.jpg');

  const upstream = await legacyFetch(request, '/api/member/topup/slip', {
    method: 'POST',
    body: form,
    includeContentType: false
  });
  const data = await responseData(upstream);
  if (!upstream.ok) return json(data, upstream.status);

  return json({
    ok: true,
    status: 'approved',
    diamonds: Number(data.credits || 0),
    credits: Number(data.credits || 0),
    message: data.message || 'ตรวจสลิปและเพิ่มเครดิตสำเร็จ'
  });
}

async function forwardToRender(request, requestUrl, path) {
  const upstreamSearch = new URLSearchParams(requestUrl.searchParams);
  upstreamSearch.delete('path');
  const query = upstreamSearch.toString();
  const upstreamUrl = `${RENDER_API_ORIGIN}/api/${path}${query ? `?${query}` : ''}`;

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
  const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });

  for (const headerName of FORWARDED_RESPONSE_HEADERS) {
    const value = upstreamResponse.headers.get(headerName);
    if (value) responseHeaders.set(headerName, value);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders
  });
}

export default {
  async fetch(request) {
    try {
      const requestUrl = new URL(request.url);
      const path = requestUrl.searchParams.get('path');
      if (!safePath(path)) return json({ error: 'Invalid API path' }, 400);

      if (path === 'auth/register' && request.method === 'POST') {
        return registerWithLegacy(request);
      }
      if (path === 'auth/login' && request.method === 'POST') {
        return loginWithLegacy(request);
      }
      if (path === 'auth/logout' && request.method === 'POST') {
        return json({ ok: true, message: 'ออกจากระบบสำเร็จ' });
      }
      if ((path === 'users/me' || path === 'member/me') && request.method === 'GET') {
        return memberMe(request);
      }
      if (path === 'users/rent' && request.method === 'POST') {
        return purchaseLegacyPlan(request);
      }
      if (path === 'topup/orders/create' && request.method === 'POST') {
        return createLegacyTopup(request);
      }
      if (path === 'topup/verify-slip' && request.method === 'POST') {
        return verifyLegacyTopup(request);
      }

      return forwardToRender(request, requestUrl, path);
    } catch (error) {
      console.error('[API Proxy] Request failed:', error?.message || error);
      return json({
        error: 'ไม่สามารถเชื่อมต่อระบบสมาชิกได้ กรุณาลองใหม่อีกครั้ง'
      }, 502);
    }
  }
};
