import {
  claimAccessCode,
  codeStorageConfigured,
  createAccessCodes,
  finishAccessCode,
  getAdminServiceToken,
  listAccessCodes,
  markAccessCodeDelivered,
  normalizeAccessCode,
  releaseAccessCode,
  rememberAdminServiceToken,
  reserveSlipAccessCodes,
  validCodeDuration
} from './code-store.js';
import { lineSlipPlan, lineSlipPlanSummary } from './line-slip-plans.js';
import { slip2GoAuthorization } from './slip2go-auth.js';

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
const PORTAL_CONFIG_FRAGMENT = 'ckrcs';
const PORTAL_CONFIG_PREFIX = 'CKRCS#';
const TUTORIAL_COLORS = new Set(['orange', 'cyan', 'blue', 'pink']);
// A public default prevents the download page from becoming blank while the
// legacy settings service has not stored its first portal configuration yet.
// Admin settings still take priority as soon as they are saved.
const DEFAULT_BOT_NAME = 'Ckrcsbot V18.1';
const DEFAULT_DOWNLOAD_URL = 'https://drive.google.com/uc?export=download&id=1Wy3d4X1OOTvsXtOf4WrScRxpYljzbARq';

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
  if (request?.body && typeof request.body === 'object'
    && !(request.body instanceof ReadableStream)
    && !(request.body instanceof ArrayBuffer)
    && !ArrayBuffer.isView(request.body)) {
    return Array.isArray(request.body) ? {} : request.body;
  }
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {}

  if (typeof request?.body === 'string') {
    try {
      const value = JSON.parse(request.body);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {}
  }
  return {};
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

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function fromBase64Url(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function encodePortalConfig(config) {
  const source = new TextEncoder().encode(JSON.stringify({
    a: String(config.announcement || ''),
    v: String(config.tutorialVideoUrl || ''),
    c: TUTORIAL_COLORS.has(config.tutorialColor) ? config.tutorialColor : 'cyan',
    s: Array.isArray(config.tutorialSteps) ? config.tutorialSteps : [],
    b: String(config.botName || ''),
    d: String(config.downloadUrl || ''),
    q: String(config.paymentQrUrl || ''),
    n: String(config.promptpayNumber || ''),
    l: String(config.promptpayLabel || '')
  }));
  const compressed = new Uint8Array(await new Response(
    new Blob([source]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  ).arrayBuffer());
  return toBase64Url(compressed);
}

async function decodePortalConfig(value) {
  const fallback = {
    announcement: '',
    tutorialVideoUrl: '',
    tutorialColor: 'cyan',
    tutorialSteps: [],
    botName: '',
    downloadUrl: '',
    paymentQrUrl: '',
    promptpayNumber: '',
    promptpayLabel: ''
  };
  const raw = String(value || '');
  if (!raw) return { isStored: false, config: fallback };

  try {
    const marker = `${PORTAL_CONFIG_PREFIX}${PORTAL_CONFIG_FRAGMENT}=`;
    if (!raw.startsWith(marker)) return { isStored: false, config: fallback };
    const encoded = raw.slice(marker.length);
    if (!encoded) return { isStored: false, config: fallback };

    const bytes = fromBase64Url(encoded);
    const decompressed = await new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    ).text();
    const parsed = JSON.parse(decompressed);
    return {
      isStored: true,
      config: {
        announcement: typeof parsed.a === 'string' ? parsed.a : '',
        tutorialVideoUrl: typeof parsed.v === 'string' ? parsed.v : '',
        tutorialColor: TUTORIAL_COLORS.has(parsed.c) ? parsed.c : 'cyan',
        tutorialSteps: Array.isArray(parsed.s)
          ? parsed.s.filter((item) => typeof item === 'string').slice(0, 8)
          : [],
        botName: typeof parsed.b === 'string' ? parsed.b : '',
        downloadUrl: typeof parsed.d === 'string' ? parsed.d : '',
        paymentQrUrl: typeof parsed.q === 'string' ? parsed.q : '',
        promptpayNumber: typeof parsed.n === 'string' ? parsed.n : '',
        promptpayLabel: typeof parsed.l === 'string' ? parsed.l : ''
      }
    };
  } catch {
    return { isStored: false, config: fallback };
  }
}

async function attachPortalConfig(config) {
  return `${PORTAL_CONFIG_PREFIX}${PORTAL_CONFIG_FRAGMENT}=${await encodePortalConfig(config)}`;
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
    role: member?.isAdmin ? 'admin' : 'user',
    diamonds: Number(member?.credits || 0),
    memberCode,
    botExpiry: expiresAt,
    expiresAt,
    status: valid ? 'active' : status,
    valid
  };
}

function publicAdmin(username) {
  return {
    id: 'admin',
    username,
    email: '',
    role: 'admin',
    diamonds: 0,
    memberCode: '',
    botExpiry: null,
    expiresAt: null,
    status: 'active',
    valid: true
  };
}

async function legacyJson(request, pathname, options = {}) {
  const response = await legacyFetch(request, pathname, options);
  const data = await responseData(response);
  return { response, data };
}

async function tryAdminLogin(request, username, password) {
  const { response, data } = await legacyJson(request, '/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });

  if (!response.ok || !data.token) return null;
  try {
    await rememberAdminServiceToken(String(data.token), Number(data.expiresIn || 2_592_000));
  } catch (error) {
    console.error('[Code Store] Could not remember admin service token:', error?.message || error);
  }
  return {
    ok: true,
    token: String(data.token),
    user: publicAdmin(username)
  };
}

async function adminAccessCodes(request) {
  const overview = await adminOverview(request);
  if (overview.errorResponse) return overview.errorResponse;
  const authorization = String(request.headers.get('authorization') || '');
  if (authorization.startsWith('Bearer ')) {
    try {
      await rememberAdminServiceToken(authorization.slice(7), 2_592_000);
    } catch (error) {
      console.error('[Code Store] Could not refresh admin service token:', error?.message || error);
    }
  }
  if (!codeStorageConfigured()) {
    return json({ error: 'ฐานข้อมูลโค้ดยังไม่ได้เชื่อมกับ Vercel' }, 503);
  }

  if (request.method === 'GET') {
    const codes = await listAccessCodes(200);
    return json({ codes });
  }

  const payload = await readJson(request);
  const count = Number(payload.count);
  const durationMinutes = validCodeDuration(payload.durationMinutes);
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    return json({ error: 'สร้างโค้ดได้ครั้งละ 1–500 โค้ด' }, 400);
  }
  if (!durationMinutes) return json({ error: 'ระยะเวลาโค้ดไม่ถูกต้อง' }, 400);

  const records = await createAccessCodes(count, durationMinutes, 'admin');
  return json({
    ok: true,
    codes: records.map((record) => record.code),
    durationMinutes,
    message: `สร้างโค้ด ${records.length} โค้ดเรียบร้อยแล้ว`
  }, 201);
}

async function redeemAccessCode(request) {
  if (!codeStorageConfigured()) {
    return json({ error: 'ระบบโค้ดยังไม่พร้อมใช้งาน กรุณาติดต่อแอดมิน' }, 503);
  }

  const payload = await readJson(request);
  const code = normalizeAccessCode(payload.code);
  const deviceId = String(payload.deviceId || '').trim();
  if (!code || !/^[A-Za-z0-9_-]{12,120}$/.test(deviceId)) {
    return json({ error: 'กรุณากรอกโค้ดให้ถูกต้อง' }, 400);
  }

  const { response: memberResponse, data: member } = await legacyJson(request, '/api/member/me', {
    method: 'GET',
    includeContentType: false
  });
  if (!memberResponse.ok) return json(member, memberResponse.status);
  const memberCode = String(member.memberCode || '').trim();
  if (!memberCode) return json({ error: 'ไม่พบรหัสสมาชิก กรุณาเข้าสู่ระบบใหม่' }, 401);

  const claimed = await claimAccessCode(code, memberCode, deviceId);
  if (claimed.error === 'NOT_FOUND' || claimed.error === 'INVALID') {
    return json({ error: 'ไม่พบโค้ดนี้' }, 404);
  }
  if (claimed.error === 'USED') return json({ error: 'โค้ดนี้ถูกใช้ไปแล้ว' }, 409);
  if (claimed.error === 'PROCESSING') {
    return json({ error: 'โค้ดนี้กำลังถูกใช้งาน กรุณารอสักครู่' }, 409);
  }
  if (!claimed.record || !claimed.claimId) return json({ error: 'ไม่สามารถตรวจสอบโค้ดได้' }, 500);

  const durationMinutes = Number(claimed.record.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes % 1440 !== 0) {
    await releaseAccessCode(code, claimed.claimId);
    return json({ error: 'โค้ดระยะเวลา 1 ชั่วโมงยังใช้กับฐานสมาชิกเดิมไม่ได้ กรุณาติดต่อแอดมิน' }, 409);
  }

  const adminToken = await getAdminServiceToken();
  if (!adminToken) {
    await releaseAccessCode(code, claimed.claimId);
    return json({ error: 'กรุณาให้แอดมินเข้าสู่ระบบหน้าเว็บหนึ่งครั้งเพื่อเปิดบริการโค้ด' }, 503);
  }

  const { response, data } = await legacyJson(request, '/api/admin/license', {
    method: 'POST',
    memberToken: adminToken,
    body: JSON.stringify({
      memberCode,
      action: 'activate',
      days: durationMinutes / 1440
    })
  });
  if (!response.ok) {
    await releaseAccessCode(code, claimed.claimId);
    const message = response.status === 401
      ? 'สิทธิ์ระบบหมดอายุ กรุณาให้แอดมินเข้าสู่ระบบหน้าเว็บอีกครั้ง'
      : data.error || 'เพิ่มวันใช้งานไม่สำเร็จ';
    return json({ error: message }, response.status === 401 ? 503 : response.status);
  }

  const expiresAt = String(data.expiresAt || '');
  await finishAccessCode(code, claimed.claimId, expiresAt);
  return json({
    ok: true,
    expiresAt,
    durationMinutes,
    message: 'เพิ่มวันใช้งานจากโค้ดสำเร็จแล้ว'
  });
}

function detectedImageType(bytes) {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { mime: 'image/png', extension: 'png' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  return null;
}

async function validLineSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const signatureBytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0));
    return crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(rawBody));
  } catch {
    return false;
  }
}

async function sendLineText(lineUserId, replyToken, text) {
  const accessToken = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
  if (!accessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN_MISSING');
  const message = { type: 'text', text: String(text).slice(0, 5000) };

  if (replyToken) {
    const reply = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ replyToken, messages: [message] }),
      signal: AbortSignal.timeout(10_000)
    });
    if (reply.ok) return;
  }

  const push = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ to: lineUserId, messages: [message] }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!push.ok) throw new Error(`LINE_PUSH_${push.status}`);
}

function slipResultMessage(code, fallback) {
  const messages = {
    '200404': 'ไม่พบข้อมูลสลิปในระบบธนาคาร',
    '200500': 'สลิปเสียหรือเป็นสลิปปลอม',
    '200501': 'สลิปนี้เคยถูกตรวจสอบหรือใช้งานแล้ว',
    '200502': 'ระบบธนาคารขัดข้อง กรุณาลองใหม่',
    '400001': 'ไม่พบ QR Code ที่ถูกต้องในรูปสลิป',
    '400002': 'ไฟล์สลิปไม่ถูกต้อง',
    '400400': 'ข้อมูลที่ใช้ตรวจสอบสลิปไม่ถูกต้อง',
    '400409': 'คำขอตรวจสอบสลิปซ้ำซ้อน กรุณาลองใหม่',
    '401001': 'คีย์ Slip2Go ไม่ถูกต้อง กรุณาแจ้งผู้ดูแล',
    '401003': 'บัญชี Slip2Go ถูกระงับ กรุณาแจ้งผู้ดูแล',
    '401004': 'แพ็กเกจ Slip2Go หมดอายุ กรุณาแจ้งผู้ดูแล',
    '401005': 'Token ตรวจสลิปหมด กรุณาแจ้งผู้ดูแล',
    '401006': 'เครดิต Slip2Go ไม่เพียงพอ กรุณาแจ้งผู้ดูแล'
  };
  return messages[code] || String(fallback || 'ตรวจสอบสลิปไม่สำเร็จ');
}

function lineDurationLabel(durationMinutes) {
  if (durationMinutes === 1440) return '1 วัน';
  if (durationMinutes === 10080) return '7 วัน';
  if (durationMinutes === 43200) return '30 วัน';
  return `${durationMinutes} นาที`;
}

async function processLineImage(request, event) {
  const lineUserId = String(event?.source?.userId || '').trim();
  const messageId = String(event?.message?.id || '').trim();
  const replyToken = String(event?.replyToken || '').trim();
  if (!lineUserId || !messageId) return;

  try {
    if (!codeStorageConfigured()) throw new Error('CODE_STORAGE_NOT_CONFIGURED');
    const lineToken = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
    const slipSecret = String(process.env.SLIP2GO_API_SECRET || '').trim();
    if (!lineToken || !slipSecret) throw new Error('SERVICE_SECRET_MISSING');
    const slipAuthorization = slip2GoAuthorization(slipSecret);

    const contentResponse = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
      headers: { authorization: `Bearer ${lineToken}` },
      signal: AbortSignal.timeout(10_000)
    });
    if (!contentResponse.ok) throw new Error(`LINE_CONTENT_${contentResponse.status}`);
    const fileBytes = await contentResponse.arrayBuffer();
    if (fileBytes.byteLength < 100 || fileBytes.byteLength > 4_194_304) {
      await sendLineText(lineUserId, replyToken, 'รูปสลิปมีขนาดไม่ถูกต้อง กรุณาส่งรูป JPG หรือ PNG ขนาดไม่เกิน 4 MB');
      return;
    }
    const image = detectedImageType(new Uint8Array(fileBytes));
    if (!image) {
      await sendLineText(lineUserId, replyToken, 'กรุณาส่งรูปสลิปเป็นไฟล์ JPG หรือ PNG');
      return;
    }

    const { response: configResponse, data: config } = await legacyJson(request, '/api/public/config', {
      method: 'GET',
      includeContentType: false
    });
    if (!configResponse.ok) throw new Error('PUBLIC_CONFIG_UNAVAILABLE');
    const promptpayNumber = String(process.env.PROMPTPAY_NUMBER || config.promptpayNumber || '')
      .replace(/\D/g, '');
    const receiverName = String(process.env.SLIP_RECEIVER_NAME || '').trim();
    if (!promptpayNumber) throw new Error('PAYMENT_RECEIVER_NOT_CONFIGURED');

    const receiverType = promptpayNumber.length === 13 ? '02003' : '02001';
    const form = new FormData();
    form.set('file', new Blob([fileBytes], { type: image.mime }), `line-slip.${image.extension}`);
    form.set('payload', JSON.stringify({
      checkDuplicate: true,
      checkReceiver: [{
        accountType: receiverType,
        accountNumber: promptpayNumber,
        ...(receiverName ? { accountNameTH: receiverName } : {})
      }]
    }));

    const verification = await fetch(
      process.env.SLIP2GO_API_URL || 'https://connect.slip2go.com/api/verify-slip/qr-image/info',
      {
        method: 'POST',
        headers: { authorization: slipAuthorization },
        body: form,
        signal: AbortSignal.timeout(20_000)
      }
    );
    const result = await verification.json().catch(() => ({}));
    const resultCode = String(result.code || `HTTP_${verification.status}`);
    if (!verification.ok || resultCode !== '200200' || !result.data) {
      await sendLineText(
        lineUserId,
        replyToken,
        `❌ ตรวจสอบสลิปไม่ผ่าน\n${slipResultMessage(resultCode, result.message)}\nยังไม่มีการออกโค้ด`
      );
      return;
    }

    const amountSatang = Math.round(Number(result.data.amount) * 100);
    const plan = Number.isFinite(amountSatang) ? lineSlipPlan(amountSatang) : null;
    if (!plan) {
      await sendLineText(
        lineUserId,
        replyToken,
        `❌ ยอดเงินไม่ตรงกับแพ็กเกจ\nรองรับเฉพาะ ${lineSlipPlanSummary()}\nยังไม่มีการออกโค้ด`
      );
      return;
    }
    const { durationMinutes, codeCount } = plan;

    const reference = String(result.data.transRef || result.data.referenceId || '').trim();
    const slipTime = Date.parse(String(result.data.dateTime || ''));
    if (!reference || reference.length > 180 || !Number.isFinite(slipTime) || slipTime > Date.now() + 300_000) {
      await sendLineText(lineUserId, replyToken, '❌ ข้อมูลอ้างอิงหรือเวลาบนสลิปไม่ถูกต้อง\nยังไม่มีการออกโค้ด');
      return;
    }

    const records = await reserveSlipAccessCodes({
      reference,
      lineUserId,
      amount: amountSatang / 100,
      durationMinutes,
      count: codeCount
    });
    const codeHeading = records.length === 1
      ? 'โค้ดวันใช้งาน:'
      : `โค้ดวันใช้งาน (${records.length} โค้ด):`;
    const codeLines = records.length === 1
      ? records[0].code
      : records.map((record, index) => `${index + 1}. ${record.code}`).join('\n');
    const durationDescription = records.length === 1
      ? lineDurationLabel(durationMinutes)
      : `${lineDurationLabel(durationMinutes)} ต่อโค้ด × ${records.length} โค้ด`;
    await sendLineText(
      lineUserId,
      replyToken,
      `✅ ตรวจสอบสลิปสำเร็จ\nยอดชำระ: ${amountSatang / 100} บาท\nได้รับวันใช้งาน: ${durationDescription}\n\n${codeHeading}\n${codeLines}\n\nนำโค้ดไปกรอกที่หน้าแรกของเว็บไซต์\nแต่ละโค้ดใช้ได้ครั้งเดียว โปรดอย่าส่งต่อให้ผู้อื่น`
    );
    await Promise.all(records.map((record) => markAccessCodeDelivered(record.code)));
  } catch (error) {
    const reason = String(error?.message || 'UNKNOWN');
    const friendly = reason === 'SLIP_ALREADY_USED'
      ? 'สลิปนี้ถูกใช้รับโค้ดไปแล้ว กรุณาติดต่อแอดมินหากต้องการตรวจสอบ'
      : 'ระบบออกโค้ดขัดข้องชั่วคราว กรุณาเก็บสลิปไว้และติดต่อแอดมิน @715ybpdq';
    try { await sendLineText(lineUserId, replyToken, friendly); } catch {}
    console.error('[LINE Code] Processing failed:', reason);
  }
}

async function lineWebhook(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-line-signature');
  const secret = String(process.env.LINE_CHANNEL_SECRET || '').trim();
  if (!(await validLineSignature(rawBody, signature, secret))) {
    return json({ error: 'invalid LINE signature' }, 401);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid payload' }, 400);
  }
  const events = Array.isArray(payload.events) ? payload.events : [];
  for (const event of events) {
    if (event?.type === 'message' && event?.message?.type === 'image') {
      await processLineImage(request, event);
    }
  }
  return json({ ok: true });
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
    const adminSession = await tryAdminLogin(request, username, password);
    if (adminSession) return json(adminSession);

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
  if (user.role === 'admin') {
    const adminSession = await tryAdminLogin(request, username, password);
    if (adminSession) return json(adminSession);
  }

  return json({
    ok: true,
    token,
    memberCode,
    expiresAt: user.expiresAt,
    valid: user.valid,
    user
  });
}

function mapMember(member) {
  const expiresAt = typeof member?.expires_at === 'string' ? member.expires_at : null;
  const active = String(member?.status || '') === 'active'
    && Boolean(expiresAt)
    && Date.parse(expiresAt) > Date.now();

  return {
    _id: String(member?.member_code || ''),
    id: String(member?.member_code || ''),
    memberCode: String(member?.member_code || ''),
    username: String(member?.username || member?.display_name || member?.member_code || ''),
    displayName: String(member?.display_name || ''),
    contact: String(member?.contact || ''),
    role: 'user',
    diamonds: Number(member?.credits || 0),
    credits: Number(member?.credits || 0),
    botExpiry: expiresAt,
    expiresAt,
    status: String(member?.status || 'pending'),
    isActive: active,
    valid: active,
    deviceName: String(member?.device_name || ''),
    createdAt: member?.created_at || null
  };
}

function mapTopup(topup) {
  const sourceStatus = String(topup?.status || 'pending');
  const status = sourceStatus === 'verified'
    ? 'approved'
    : sourceStatus === 'cancelled'
      ? 'rejected'
      : 'pending';

  return {
    _id: String(topup?.id || ''),
    id: String(topup?.id || ''),
    orderId: String(topup?.id || ''),
    memberCode: String(topup?.member_code || ''),
    username: String(topup?.username || topup?.display_name || topup?.member_code || ''),
    amount: Number(topup?.amount || 0),
    diamonds: Number(topup?.credits || 0),
    credits: Number(topup?.credits || 0),
    status,
    sourceStatus,
    slipRef: String(topup?.slip_reference || ''),
    hasSlip: Boolean(topup?.has_slip),
    createdAt: topup?.created_at || null,
    verifiedAt: topup?.verified_at || null
  };
}

async function adminOverview(request) {
  const { response, data } = await legacyJson(request, '/api/admin/overview', {
    method: 'GET',
    includeContentType: false
  });
  if (!response.ok) return { errorResponse: json(data, response.status) };
  return { data };
}

function thailandDate(value = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(value);
}

async function adminUsers(request) {
  const overview = await adminOverview(request);
  if (overview.errorResponse) return overview.errorResponse;
  return json({ users: (overview.data.members || []).map(mapMember) });
}

async function adminTopups(request) {
  const overview = await adminOverview(request);
  if (overview.errorResponse) return overview.errorResponse;
  return json({ topups: (overview.data.topups || []).map(mapTopup) });
}

async function adminStats(request) {
  const overview = await adminOverview(request);
  if (overview.errorResponse) return overview.errorResponse;

  const members = (overview.data.members || []).map(mapMember);
  const topups = (overview.data.topups || []).map(mapTopup);
  const today = thailandDate();
  const todayRevenue = topups
    .filter((item) => item.status === 'approved'
      && item.verifiedAt
      && thailandDate(new Date(item.verifiedAt)) === today)
    .reduce((sum, item) => sum + item.amount, 0);

  return json({
    totalUsers: members.length,
    activeUsers: members.filter((item) => item.isActive).length,
    pendingTopups: topups.filter((item) => item.status === 'pending').length,
    todayRevenue
  });
}

async function updateAdminUser(request, path) {
  const match = path.match(/^admin\/users\/([^/]+)\/(diamonds|days|reset-password|reset-device)$/);
  if (!match) {
    return json({
      error: 'ระบบฐานข้อมูลเดิมไม่รองรับการเปลี่ยนชื่อหรือลบสมาชิกจากหน้าเว็บ'
    }, 405);
  }

  const memberCode = decodeURIComponent(match[1]);
  const action = match[2];
  const payload = await readJson(request);

  if (action === 'diamonds') {
    const overview = await adminOverview(request);
    if (overview.errorResponse) return overview.errorResponse;
    const member = (overview.data.members || [])
      .find((item) => String(item.member_code) === memberCode);
    if (!member) return json({ error: 'ไม่พบสมาชิก' }, 404);

    const desired = Number(payload.diamonds);
    if (!Number.isInteger(desired) || desired < 0 || desired > 1000000) {
      return json({ error: 'จำนวนเครดิตไม่ถูกต้อง' }, 400);
    }
    const delta = desired - Number(member.credits || 0);
    if (delta === 0) return json({ ok: true, credits: desired });

    const { response, data } = await legacyJson(request, '/api/admin/credit', {
      method: 'POST',
      body: JSON.stringify({ memberCode, delta })
    });
    return json(data, response.status);
  }

  if (action === 'days') {
    const days = Number(payload.days);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return json({ error: 'จำนวนวันต้องเป็นเลขเต็ม 1-365 วัน' }, 400);
    }
    const { response, data } = await legacyJson(request, '/api/admin/license', {
      method: 'POST',
      body: JSON.stringify({ memberCode, action: 'activate', days })
    });
    return json(data, response.status);
  }

  if (action === 'reset-device') {
    const { response, data } = await legacyJson(request, '/api/admin/license', {
      method: 'POST',
      body: JSON.stringify({ memberCode, action: 'reset_device' })
    });
    return json(data, response.status);
  }

  const newPassword = String(payload.newPassword || '');
  if (newPassword.length < 8 || newPassword.length > 128) {
    return json({ error: 'รหัสผ่านใหม่ต้องยาว 8-128 ตัวอักษร' }, 400);
  }
  const { response, data } = await legacyJson(request, '/api/admin/member-password', {
    method: 'POST',
    body: JSON.stringify({ memberCode, newPassword })
  });
  return json(data, response.status);
}

async function updateAdminTopup(request, path) {
  const match = path.match(/^admin\/topups\/([^/]+)$/);
  if (!match) return json({ error: 'ไม่พบรายการเติมเงิน' }, 404);

  const payload = await readJson(request);
  const topupId = decodeURIComponent(match[1]);
  const pathname = payload.status === 'approved'
    ? '/api/admin/topup/approve'
    : payload.status === 'rejected'
      ? '/api/admin/topup/cancel'
      : '';
  if (!pathname) return json({ error: 'สถานะรายการไม่ถูกต้อง' }, 400);

  const { response, data } = await legacyJson(request, pathname, {
    method: 'POST',
    body: JSON.stringify({ topupId })
  });
  return json(data, response.status);
}

async function saveAdminSettings(request) {
  const payload = await readJson(request);
  const supported = [
    'botName',
    'promptpayLabel',
    'promptpayNumber',
    'slipReceiverName',
    'paymentQrUrl'
  ];
  const clean = Object.fromEntries(
    supported
      .filter((key) => Object.hasOwn(payload, key))
      .map((key) => [key, payload[key]])
  );

  const hasPortalSettings = [
    'announcement',
    'tutorialVideoUrl',
    'tutorialColor',
    'tutorialSteps',
    'botName',
    'downloadUrl',
    'paymentQrUrl',
    'promptpayNumber',
    'promptpayLabel'
  ].some((key) => Object.hasOwn(payload, key));
  if (Object.hasOwn(payload, 'downloadUrl')) {
    const downloadUrl = String(payload.downloadUrl || '').trim();
    if (downloadUrl && !downloadUrl.startsWith('https://')) {
      return json({ error: 'ลิงก์ดาวน์โหลดต้องขึ้นต้นด้วย https://' }, 400);
    }
    if (downloadUrl.length > 500) {
      return json({ error: 'ลิงก์ดาวน์โหลดยาวเกินไป' }, 400);
    }
    clean.downloadUrl = downloadUrl;
  }

  if (hasPortalSettings) {
    const overview = await adminOverview(request);
    if (overview.errorResponse) return overview.errorResponse;
    const previous = await decodePortalConfig(overview.data.siteName || '');
    const announcement = Object.hasOwn(payload, 'announcement')
      ? String(payload.announcement || '').trim()
      : previous.config.announcement;
    const tutorialVideoUrl = Object.hasOwn(payload, 'tutorialVideoUrl')
      ? String(payload.tutorialVideoUrl || '').trim()
      : previous.config.tutorialVideoUrl;
    const tutorialColor = Object.hasOwn(payload, 'tutorialColor')
      ? String(payload.tutorialColor || '')
      : previous.config.tutorialColor;
    const tutorialSteps = Object.hasOwn(payload, 'tutorialSteps')
      ? payload.tutorialSteps
      : previous.config.tutorialSteps;
    const botName = Object.hasOwn(payload, 'botName')
      ? String(payload.botName || '').trim()
      : previous.config.botName || String(overview.data.botName || '');
    const downloadUrl = Object.hasOwn(payload, 'downloadUrl')
      ? String(payload.downloadUrl || '').trim()
      : previous.config.downloadUrl || String(overview.data.downloadUrl || '');
    const paymentQrUrl = Object.hasOwn(payload, 'paymentQrUrl')
      ? String(payload.paymentQrUrl || '').trim()
      : previous.config.paymentQrUrl || String(overview.data.paymentQrUrl || '');
    const promptpayNumber = Object.hasOwn(payload, 'promptpayNumber')
      ? String(payload.promptpayNumber || '').trim()
      : previous.config.promptpayNumber || String(overview.data.promptpayNumber || '');
    const promptpayLabel = Object.hasOwn(payload, 'promptpayLabel')
      ? String(payload.promptpayLabel || '').trim()
      : previous.config.promptpayLabel || String(overview.data.promptpayLabel || '');

    if (announcement.length > 240) {
      return json({ error: 'ข้อความประกาศต้องไม่เกิน 240 ตัวอักษร' }, 400);
    }
    if (tutorialVideoUrl && !tutorialVideoUrl.startsWith('https://')) {
      return json({ error: 'ลิงก์วิดีโอต้องขึ้นต้นด้วย https://' }, 400);
    }
    if (!TUTORIAL_COLORS.has(tutorialColor)) {
      return json({ error: 'สีข้อความไม่ถูกต้อง' }, 400);
    }
    if (!Array.isArray(tutorialSteps) || tutorialSteps.length > 8) {
      return json({ error: 'ใส่ขั้นตอนการใช้งานได้ไม่เกิน 8 ขั้นตอน' }, 400);
    }
    const cleanSteps = tutorialSteps
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    if (cleanSteps.some((item) => item.length > 100)
      || cleanSteps.join('').length > 500) {
      return json({ error: 'ข้อความแต่ละขั้นต้องไม่เกิน 100 ตัว และรวมไม่เกิน 500 ตัวอักษร' }, 400);
    }

    const storedUrl = await attachPortalConfig({
      announcement,
      tutorialVideoUrl,
      tutorialColor,
      tutorialSteps: cleanSteps,
      botName,
      downloadUrl,
      paymentQrUrl,
      promptpayNumber,
      promptpayLabel
    });
    if (storedUrl.length > 1800) {
      return json({
        error: 'ข้อความวิธีใช้งานยาวเกินพื้นที่จัดเก็บ กรุณาย่อข้อความแต่ละขั้น'
      }, 400);
    }
    clean.siteName = storedUrl;
  }

  const { response, data } = await legacyJson(request, '/api/admin/settings', {
    method: 'POST',
    body: JSON.stringify(clean)
  });
  return json(data, response.status);
}

async function getAdminSettings(request) {
  const overview = await adminOverview(request);
  if (overview.errorResponse) return overview.errorResponse;
  const data = overview.data;
  const portal = await decodePortalConfig(data.siteName || '');

  const stored = portal.config;
  return json({
    siteName: 'CKRCS BOT',
    announcement: portal.config.announcement,
    botName: portal.isStored ? stored.botName || DEFAULT_BOT_NAME : data.botName || DEFAULT_BOT_NAME,
    botUrl: portal.isStored ? stored.downloadUrl || DEFAULT_DOWNLOAD_URL : data.downloadUrl || DEFAULT_DOWNLOAD_URL,
    downloadUrl: portal.isStored ? stored.downloadUrl || DEFAULT_DOWNLOAD_URL : data.downloadUrl || DEFAULT_DOWNLOAD_URL,
    promptPayNumber: portal.isStored ? stored.promptpayNumber : data.promptpayNumber || '',
    promptPayAccountName: portal.isStored ? stored.promptpayLabel : data.promptpayLabel || '',
    slipReceiverName: data.slipReceiverName || '',
    promptPayQrUrl: portal.isStored ? stored.paymentQrUrl : data.paymentQrUrl || '',
    tutorialVideoUrl: portal.config.tutorialVideoUrl,
    videoUrl: portal.config.tutorialVideoUrl,
    tutorialColor: portal.config.tutorialColor,
    tutorialSteps: portal.config.tutorialSteps,
    steps: portal.config.tutorialSteps,
    plans: data.plans || {},
    slip2GoConfigured: Boolean(data.slip2GoConfigured)
  });
}

async function publicSettings(request) {
  const { response, data } = await legacyJson(request, '/api/public/config', {
    method: 'GET',
    includeContentType: false
  });
  if (!response.ok) return json(data, response.status);
  const portal = await decodePortalConfig(data.siteName || '');

  const stored = portal.config;
  return json({
    siteName: 'CKRCS BOT',
    announcement: portal.config.announcement,
    botName: portal.isStored ? stored.botName || DEFAULT_BOT_NAME : data.botName || DEFAULT_BOT_NAME,
    botUrl: portal.isStored ? stored.downloadUrl || DEFAULT_DOWNLOAD_URL : data.downloadUrl || DEFAULT_DOWNLOAD_URL,
    downloadUrl: portal.isStored ? stored.downloadUrl || DEFAULT_DOWNLOAD_URL : data.downloadUrl || DEFAULT_DOWNLOAD_URL,
    promptPayNumber: portal.isStored ? stored.promptpayNumber : data.promptpayNumber || '',
    promptPayAccountName: portal.isStored ? stored.promptpayLabel : data.promptpayLabel || '',
    promptPayQrUrl: portal.isStored ? stored.paymentQrUrl : data.paymentQrUrl || '',
    tutorialVideoUrl: portal.config.tutorialVideoUrl,
    videoUrl: portal.config.tutorialVideoUrl,
    tutorialColor: portal.config.tutorialColor,
    tutorialSteps: portal.config.tutorialSteps,
    steps: portal.config.tutorialSteps,
    plans: data.plans || {},
    creditRate: Number(data.creditRate || 1)
  });
}

async function massCompensation(request) {
  const payload = await readJson(request);
  const days = Number(payload.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return json({ error: 'จำนวนวันต้องเป็นเลขเต็ม 1-365 วัน' }, 400);
  }

  const overview = await adminOverview(request);
  if (overview.errorResponse) return overview.errorResponse;
  const memberCodes = (overview.data.members || [])
    .map((member) => String(member.member_code || ''))
    .filter(Boolean);

  let updated = 0;
  const failures = [];
  for (let index = 0; index < memberCodes.length; index += 8) {
    const batch = memberCodes.slice(index, index + 8);
    const results = await Promise.all(batch.map(async (memberCode) => {
      const { response, data } = await legacyJson(request, '/api/admin/license', {
        method: 'POST',
        body: JSON.stringify({ memberCode, action: 'activate', days })
      });
      return { memberCode, ok: response.ok, error: data.error };
    }));

    for (const result of results) {
      if (result.ok) updated += 1;
      else failures.push(result);
    }
  }

  return json({
    ok: failures.length === 0,
    updated,
    failed: failures.length,
    message: `เพิ่มเวลา ${days} วันให้สมาชิก ${updated} คนแล้ว`
  }, failures.length ? 207 : 200);
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

      if (path === 'line/webhook' && request.method === 'POST') {
        return lineWebhook(request);
      }

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
      if (path === 'codes/redeem' && request.method === 'POST') {
        return redeemAccessCode(request);
      }
      if (path === 'topup/orders/create' && request.method === 'POST') {
        return createLegacyTopup(request);
      }
      if (path === 'topup/verify-slip' && request.method === 'POST') {
        return verifyLegacyTopup(request);
      }
      if (path === 'settings' && request.method === 'GET') {
        return publicSettings(request);
      }
      if (path === 'admin/users' && request.method === 'GET') {
        return adminUsers(request);
      }
      if (path === 'admin/topups' && request.method === 'GET') {
        return adminTopups(request);
      }
      if (path === 'admin/stats' && request.method === 'GET') {
        return adminStats(request);
      }
      if (path === 'admin/codes' && (request.method === 'GET' || request.method === 'POST')) {
        return adminAccessCodes(request);
      }
      if (path.startsWith('admin/users/') && request.method === 'PATCH') {
        return updateAdminUser(request, path);
      }
      if (path.startsWith('admin/topups/') && request.method === 'PATCH') {
        return updateAdminTopup(request, path);
      }
      if (path === 'admin/settings' && request.method === 'POST') {
        return saveAdminSettings(request);
      }
      if (path === 'admin/settings' && request.method === 'GET') {
        return getAdminSettings(request);
      }
      if (path === 'admin/mass-compensation' && request.method === 'POST') {
        return massCompensation(request);
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
