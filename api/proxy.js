import {
  claimAccessCode,
  codeDurationToDays,
  codeStorageConfigured,
  createAccessCodes,
  finishAccessCode,
  getAdminServiceToken,
  getMemberCodeForSession,
  listAccessCodes,
  markAccessCodeDelivered,
  normalizeAccessCode,
  releaseAccessCode,
  rememberAdminServiceToken,
  rememberMemberSession,
  reserveSlipAccessCodes,
  validCodeDuration
} from './code-store.js';
import { listFarmEvents, storeFarmEvent, summarizeFarmEvents } from './farm-store.js';
import {
  getMemberSessionSummary,
  sessionStorageConfigured,
  setMemberProgramLimit,
  storeSessionHeartbeat
} from './session-store.js';
import { lineSlipPlan, lineSlipPlanSummary } from './line-slip-plans.js';
import {
  disableMember,
  enableMember,
  getDisabledMeta,
  isMemberDisabled,
  listDisabledMemberCodes
} from './member-status-store.js';
import {
  portalStorageConfigured,
  readStoredPortalConfig,
  writeStoredPortalConfig
} from './portal-store.js';
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

// Starter bot cards. Administrators can edit, remove, and append cards; these
// values are only used until the first custom list is saved.
const DEFAULT_DOWNLOAD_ITEMS = [
  { id: 'farm', icon: '💰📦', label: 'ฟาร์มเงิน/กล่อง', description: 'วิ่งเก็บกล่องออโต้รันตลอดวัน', status: 'normal', url: '', tutorialUrl: '' },
  { id: 'powder', icon: '🧪', label: 'ย่อยผง', description: 'ย่อยผงอัตโนมัติ เปิดพร้อมกันได้หลายจอ', status: 'normal', url: '', tutorialUrl: '' },
  { id: 'friend', icon: '💌', label: 'เพิ่มเพื่อน/ส่งใจ', description: 'เพิ่มเพื่อนและส่งใจให้ครบทุกวัน (แบบเพิ่มเพื่อนปกติครบ 300 คน และส่งใจตรงรายชื่อเพื่อนทุกคน)', status: 'normal', url: '', tutorialUrl: 'https://youtu.be/hBXOy-5lAyQ' },
  { id: 'account', icon: '🆕', label: 'สมัครไอดี/ส่งใจ/เพิ่มเพื่อน', description: 'สมัครไอดีใหม่ ส่งใจ และเพิ่มเพื่อนในตัวเดียว (วนส่งใจให้ไอดีที่ขาดหัวใจ รองรับหลายจอ)', status: 'normal', url: '', tutorialUrl: 'https://youtu.be/BVrpmF8Qarc' }
];
const DOWNLOAD_ITEM_MAX = 20;
const DOWNLOAD_ITEM_ICON_MAX = 16;
const DOWNLOAD_ITEM_LABEL_MAX = 60;
const DOWNLOAD_ITEM_DESCRIPTION_MAX = 160;
const DOWNLOAD_ITEM_TUTORIAL_URL_MAX = 500;

// Wording from earlier releases. A stored entry still carrying one of these
// strings was never edited by the admin, so it is refreshed to the current
// preset on read. Anything the admin actually typed is left untouched.
const SUPERSEDED_DOWNLOAD_TEXT = {
  farm: {
    labels: ['ฟาร์มเงิน'],
    descriptions: ['วิ่งเก็บเหรียญอัตโนมัติตลอดวัน']
  },
  powder: { labels: [], descriptions: [] },
  friend: {
    labels: [],
    descriptions: ['เพิ่มเพื่อนและส่งใจให้ครบทุกวัน']
  },
  account: {
    labels: [],
    descriptions: ['สมัครไอดีใหม่ ส่งใจ และเพิ่มเพื่อนในตัวเดียว']
  }
};

function refreshSupersededDownloadText(items) {
  return items.map((item) => {
    const superseded = SUPERSEDED_DOWNLOAD_TEXT[item.id];
    const preset = DEFAULT_DOWNLOAD_ITEMS.find((entry) => entry.id === item.id);
    if (!superseded || !preset) return item;

    return {
      ...item,
      label: superseded.labels.includes(item.label) ? preset.label : item.label,
      description: superseded.descriptions.includes(item.description)
        ? preset.description
        : item.description
    };
  });
}

function downloadItemList(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : null;
}

function normalizeDownloadItems(value, previous) {
  const priorList = downloadItemList(previous) || DEFAULT_DOWNLOAD_ITEMS;
  const incoming = downloadItemList(value);
  const source = incoming || priorList;
  const usedIds = new Set();

  return source.slice(0, DOWNLOAD_ITEM_MAX).map((patch, index) => {
    const rawId = String(patch.id || `bot-${index + 1}`).trim();
    let id = /^[a-zA-Z0-9_-]{1,64}$/.test(rawId) ? rawId : `bot-${index + 1}`;
    while (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);

    const preset = DEFAULT_DOWNLOAD_ITEMS.find((item) => item.id === id);
    const prior = priorList.find((item) => item.id === id) || preset || {};
    const label = String(patch.label ?? prior.label ?? 'บอทใหม่').trim();
    const description = String(patch.description ?? prior.description ?? '').trim();
    const url = String(patch.url ?? prior.url ?? '').trim();
    const tutorialUrl = String(patch.tutorialUrl ?? prior.tutorialUrl ?? '').trim();
    const icon = String(patch.icon ?? prior.icon ?? '🤖').trim() || '🤖';
    const status = String(patch.status ?? prior.status ?? 'normal') === 'maintenance'
      ? 'maintenance'
      : 'normal';

    return {
      id,
      icon: icon.slice(0, DOWNLOAD_ITEM_ICON_MAX),
      label: (label || 'บอทใหม่').slice(0, DOWNLOAD_ITEM_LABEL_MAX),
      description: description.slice(0, DOWNLOAD_ITEM_DESCRIPTION_MAX),
      status,
      url,
      tutorialUrl
    };
  });
}

function invalidDownloadItem(items) {
  for (const item of items) {
    if (item.url && !item.url.startsWith('https://')) {
      return `ลิงก์ของ "${item.label}" ต้องขึ้นต้นด้วย https://`;
    }
    if (item.url.length > 500) {
      return `ลิงก์ของ "${item.label}" ยาวเกินไป`;
    }
    if (item.tutorialUrl && !item.tutorialUrl.startsWith('https://')) {
      return `ลิงก์คลิปสอนของ "${item.label}" ต้องขึ้นต้นด้วย https://`;
    }
    if (item.tutorialUrl.length > DOWNLOAD_ITEM_TUTORIAL_URL_MAX) {
      return `ลิงก์คลิปสอนของ "${item.label}" ยาวเกินไป`;
    }
  }
  return '';
}

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

function sameText(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

function validBotTelemetryRequest(request) {
  const authorization = String(request.headers.get('oai-sites-authorization') || '');
  return sameText(authorization, `Bearer ${sitesToken()}`);
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
    x: Array.isArray(config.downloadItems) ? config.downloadItems : [],
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
    downloadItems: DEFAULT_DOWNLOAD_ITEMS,
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
        downloadItems: Array.isArray(parsed.x) ? parsed.x : DEFAULT_DOWNLOAD_ITEMS,
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

function normalizePortalConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  return {
    announcement: typeof source.announcement === 'string' ? source.announcement : '',
    tutorialVideoUrl: typeof source.tutorialVideoUrl === 'string' ? source.tutorialVideoUrl : '',
    tutorialColor: TUTORIAL_COLORS.has(source.tutorialColor) ? source.tutorialColor : 'cyan',
    tutorialSteps: Array.isArray(source.tutorialSteps)
      ? source.tutorialSteps.filter((item) => typeof item === 'string').slice(0, 8)
      : [],
    botName: typeof source.botName === 'string' ? source.botName : '',
    downloadUrl: typeof source.downloadUrl === 'string' ? source.downloadUrl : '',
    downloadItems: refreshSupersededDownloadText(
      normalizeDownloadItems(source.downloadItems, null)
    ),
    paymentQrUrl: typeof source.paymentQrUrl === 'string' ? source.paymentQrUrl : '',
    promptpayNumber: typeof source.promptpayNumber === 'string' ? source.promptpayNumber : '',
    promptpayLabel: typeof source.promptpayLabel === 'string' ? source.promptpayLabel : ''
  };
}

// Portal display settings live in Redis so a save never depends on the legacy
// members service accepting an oversized `siteName` blob. The old blob is still
// read as a fallback so portals saved before this change keep working.
async function resolvePortalConfig(legacySiteName) {
  let stored = null;
  try {
    stored = await readStoredPortalConfig();
  } catch (error) {
    console.error('[Portal] Redis read failed:', error?.message || error);
  }
  if (stored) return { isStored: true, config: normalizePortalConfig(stored) };

  const decoded = await decodePortalConfig(String(legacySiteName || ''));
  return { isStored: decoded.isStored, config: normalizePortalConfig(decoded.config) };
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
    return json({ codes: attachMemberNamesToCodes(codes, overview.data.members || []) });
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
  const bearerToken = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const memberCode = String(member.memberCode || await getMemberCodeForSession(bearerToken) || '').trim();
  if (!memberCode) {
    return json({ error: 'ยังไม่พบรหัสสมาชิกในเซสชัน กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่ 1 ครั้ง' }, 401);
  }

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
  if (!validCodeDuration(durationMinutes)) {
    await releaseAccessCode(code, claimed.claimId);
    return json({ error: 'ระยะเวลาในโค้ดไม่ถูกต้อง กรุณาติดต่อแอดมิน' }, 409);
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
      days: codeDurationToDays(durationMinutes),
      durationMinutes
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

  if (await isMemberDisabled(memberCode)) {
    return json({ error: 'บัญชีนี้ถูกปิดการใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบ' }, 403);
  }

  try {
    await rememberMemberSession(token, memberCode);
  } catch (error) {
    console.error('[Member Session] Could not remember member code:', error?.message || error);
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

function memberDirectory(members = []) {
  return new Map(members.map((member) => {
    const memberCode = String(member?.member_code || member?.memberCode || '').trim();
    const username = String(member?.username || '').trim();
    const displayName = String(member?.display_name || member?.displayName || '').trim();
    return [memberCode, {
      memberCode,
      username,
      displayName,
      memberName: username || displayName || memberCode
    }];
  }).filter(([memberCode]) => memberCode));
}

export function attachMemberNamesToCodes(codes = [], members = []) {
  const directory = memberDirectory(members);
  return codes.map((code) => {
    const memberCode = String(code?.memberCode || '').trim();
    const member = directory.get(memberCode);
    return {
      ...code,
      memberName: member?.memberName || '',
      memberUsername: member?.username || '',
      memberDisplayName: member?.displayName || ''
    };
  });
}

export function buildLineSlipTopups(codes = [], members = []) {
  const directory = memberDirectory(members);
  const payments = new Map();

  for (const code of codes) {
    if (String(code?.source || '') !== 'line-slip') continue;
    const paymentReference = String(code?.paymentReference || '').trim();
    if (!paymentReference) continue;

    let payment = payments.get(paymentReference);
    if (!payment) {
      payment = {
        paymentReference,
        amount: Number(code?.amount || 0),
        durationMinutes: Number(code?.durationMinutes || 0),
        lineUserId: String(code?.lineUserId || ''),
        createdAt: code?.createdAt || null,
        deliveredAt: code?.deliveredAt || null,
        codes: [],
        memberCodes: new Set()
      };
      payments.set(paymentReference, payment);
    }

    payment.codes.push(String(code?.code || ''));
    if (code?.memberCode) payment.memberCodes.add(String(code.memberCode));
    if (!payment.deliveredAt && code?.deliveredAt) payment.deliveredAt = code.deliveredAt;
    if (Date.parse(String(code?.createdAt || '')) < Date.parse(String(payment.createdAt || ''))) {
      payment.createdAt = code.createdAt;
    }
  }

  return Array.from(payments.values()).map((payment) => {
    const memberCodes = Array.from(payment.memberCodes);
    const memberNames = memberCodes
      .map((memberCode) => directory.get(memberCode)?.memberName || memberCode)
      .filter(Boolean);
    return {
      _id: `line-slip:${payment.paymentReference}`,
      id: `line-slip:${payment.paymentReference}`,
      orderId: payment.codes.filter(Boolean).join(', '),
      memberCode: memberCodes.join(', '),
      memberName: memberNames.join(', '),
      username: memberNames.join(', ') || 'ยังไม่มีสมาชิกใช้โค้ด',
      amount: payment.amount,
      diamonds: 0,
      credits: 0,
      status: 'approved',
      sourceStatus: 'verified',
      source: 'line-slip',
      slipRef: payment.paymentReference,
      lineUserId: payment.lineUserId,
      codeCount: payment.codes.length,
      codes: payment.codes.filter(Boolean),
      durationMinutes: payment.durationMinutes,
      hasSlip: true,
      createdAt: payment.createdAt,
      verifiedAt: payment.deliveredAt || payment.createdAt
    };
  });
}

async function combinedAdminTopups(overviewData) {
  const legacyTopups = (overviewData.topups || []).map(mapTopup);
  if (!codeStorageConfigured()) return legacyTopups;
  try {
    const codes = await listAccessCodes(500);
    const lineTopups = buildLineSlipTopups(codes, overviewData.members || []);
    return [...lineTopups, ...legacyTopups].sort((left, right) => (
      Date.parse(String(right.createdAt || '')) - Date.parse(String(left.createdAt || ''))
    ));
  } catch (error) {
    console.error('[Admin Topups] Could not load LINE slip history:', error?.message || error);
    return legacyTopups;
  }
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
  const disabledCodes = new Set(await listDisabledMemberCodes());
  const members = (overview.data.members || [])
    .map(mapMember)
    .filter((member) => !disabledCodes.has(member.memberCode));
  const users = await Promise.all(members.map(async (member) => ({
    ...member,
    ...(await getMemberSessionSummary(member.memberCode).catch(() => ({
      activeScreens: 0, activePrograms: 0, maxPrograms: 4, sessionIp: '', botSessions: []
    })))
  })));
  return json({ users });
}

async function adminDisabledUsers(request) {
  const overview = await adminOverview(request);
  if (overview.errorResponse) return overview.errorResponse;
  const disabledCodes = await listDisabledMemberCodes();
  if (!disabledCodes.length) return json({ users: [] });

  const membersByCode = new Map(
    (overview.data.members || []).map((member) => [String(member.member_code || ''), member])
  );
  const users = await Promise.all(disabledCodes.map(async (memberCode) => {
    const legacyMember = membersByCode.get(memberCode);
    const meta = await getDisabledMeta(memberCode);
    return {
      ...mapMember(legacyMember || { member_code: memberCode }),
      disabledAt: meta?.disabledAt || null
    };
  }));
  return json({ users });
}

// Members can disappear from the legacy account list (renamed, etc.) while
// still owning farm-history events -- the aggregate view is built from the
// farm-history index itself so it can never miss a member who has data,
// falling back to the raw member code as the display name if the legacy
// lookup no longer has that member.
async function adminFarmDataList(request) {
  const overview = await adminOverview(request);
  if (overview.errorResponse) return overview.errorResponse;
  const members = (overview.data.members || []).map(mapMember);
  const membersByCode = new Map(members.map((member) => [member.memberCode, member]));

  const results = await Promise.all(members.map(async (member) => {
    const events = await listFarmEvents(member.memberCode);
    if (!events.length) return null;
    const summary = summarizeFarmEvents(events);
    return {
      username: member.username,
      memberCode: member.memberCode,
      joinedAt: member.createdAt || null,
      ...summary
    };
  }));

  return json({ members: results.filter(Boolean) });
}

async function adminFarmDataDetail(request, memberCode) {
  const overview = await adminOverview(request);
  if (overview.errorResponse) return overview.errorResponse;
  const events = await listFarmEvents(memberCode);
  return json({
    events,
    refreshIntervalSeconds: 60,
    updatedAt: new Date().toISOString()
  });
}

async function adminTopups(request) {
  const overview = await adminOverview(request);
  if (overview.errorResponse) return overview.errorResponse;
  return json({ topups: await combinedAdminTopups(overview.data) });
}

async function adminStats(request) {
  const overview = await adminOverview(request);
  if (overview.errorResponse) return overview.errorResponse;

  const members = (overview.data.members || []).map(mapMember);
  const topups = await combinedAdminTopups(overview.data);
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
  const match = path.match(/^admin\/users\/([^/]+)\/(diamonds|days|reset-password|reset-device|disable|enable|program-limit)$/);
  if (!match) {
    return json({
      error: 'ระบบฐานข้อมูลเดิมไม่รองรับการเปลี่ยนชื่อหรือลบสมาชิกจากหน้าเว็บ'
    }, 405);
  }

  const memberCode = decodeURIComponent(match[1]);
  const action = match[2];

  // These two only ever touch this proxy's own disabled-member list -- they
  // don't call the legacy member API at all, so they're handled before the
  // admin-overview lookup the other actions need.
  if (action === 'disable' || action === 'enable') {
    const overview = await adminOverview(request);
    if (overview.errorResponse) return overview.errorResponse;
    try {
      if (action === 'disable') await disableMember(memberCode);
      else await enableMember(memberCode);
      return json({ ok: true, memberCode, disabled: action === 'disable' });
    } catch (error) {
      const reason = String(error?.message || '');
      if (reason === 'MEMBER_STATUS_STORAGE_NOT_CONFIGURED') {
        return json({ error: 'ระบบจัดเก็บสถานะบัญชียังไม่พร้อมใช้งาน' }, 503);
      }
      return json({ error: 'ไม่สามารถเปลี่ยนสถานะบัญชีได้' }, 500);
    }
  }

  const payload = await readJson(request);

  if (action === 'program-limit') {
    const overview = await adminOverview(request);
    if (overview.errorResponse) return overview.errorResponse;
    const member = (overview.data.members || [])
      .find((item) => String(item.member_code) === memberCode);
    if (!member) return json({ error: 'ไม่พบสมาชิก' }, 404);
    try {
      const maxPrograms = await setMemberProgramLimit(memberCode, payload.maxPrograms);
      return json({ ok: true, memberCode, maxPrograms });
    } catch (error) {
      const reason = String(error?.message || '');
      if (reason === 'INVALID_PROGRAM_LIMIT') {
        return json({ error: 'จำนวนโปรแกรมต้องเป็นเลขเต็ม 1-100' }, 400);
      }
      return json({ error: 'บันทึกจำนวนโปรแกรมสูงสุดไม่สำเร็จ' }, 503);
    }
  }

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
    'downloadItems',
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
    const previous = await resolvePortalConfig(overview.data.siteName || '');
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
    const downloadItems = normalizeDownloadItems(
      Object.hasOwn(payload, 'downloadItems') ? payload.downloadItems : null,
      previous.config.downloadItems
    );

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
    const downloadItemError = invalidDownloadItem(downloadItems);
    if (downloadItemError) return json({ error: downloadItemError }, 400);

    const nextConfig = {
      announcement,
      tutorialVideoUrl,
      tutorialColor,
      tutorialSteps: cleanSteps,
      botName,
      downloadUrl,
      downloadItems,
      paymentQrUrl,
      promptpayNumber,
      promptpayLabel
    };

    let savedToStorage = false;
    try {
      savedToStorage = await writeStoredPortalConfig(nextConfig);
    } catch (error) {
      console.error('[Portal] Redis write failed:', error?.message || error);
    }

    if (!savedToStorage) {
      // No key/value storage available: keep the legacy behaviour of packing the
      // portal settings into the members service `siteName` field.
      const storedUrl = await attachPortalConfig(nextConfig);
      if (storedUrl.length > 1800) {
        return json({
          error: 'ข้อความวิธีใช้งานยาวเกินพื้นที่จัดเก็บ กรุณาย่อข้อความแต่ละขั้น'
        }, 400);
      }
      clean.siteName = storedUrl;
    }
  }

  // Nothing left for the members service (for example an announcement-only save)
  // means the portal storage write above already finished the job.
  if (!Object.keys(clean).length) {
    return json({ ok: true, message: 'บันทึกการตั้งค่าเรียบร้อยแล้ว' });
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
  const portal = await resolvePortalConfig(data.siteName || '');

  const stored = portal.config;
  return json({
    siteName: 'CKRCS BOT',
    announcement: portal.config.announcement,
    botName: portal.isStored ? stored.botName || DEFAULT_BOT_NAME : data.botName || DEFAULT_BOT_NAME,
    botUrl: portal.isStored ? stored.downloadUrl || DEFAULT_DOWNLOAD_URL : data.downloadUrl || DEFAULT_DOWNLOAD_URL,
    downloadUrl: portal.isStored ? stored.downloadUrl || DEFAULT_DOWNLOAD_URL : data.downloadUrl || DEFAULT_DOWNLOAD_URL,
    downloadItems: stored.downloadItems,
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
    portalStorageReady: portalStorageConfigured(),
    slip2GoConfigured: Boolean(data.slip2GoConfigured)
  });
}

async function publicSettings(request) {
  const { response, data } = await legacyJson(request, '/api/public/config', {
    method: 'GET',
    includeContentType: false
  });
  if (!response.ok) return json(data, response.status);
  const portal = await resolvePortalConfig(data.siteName || '');

  const stored = portal.config;
  return json({
    siteName: 'CKRCS BOT',
    announcement: portal.config.announcement,
    botName: portal.isStored ? stored.botName || DEFAULT_BOT_NAME : data.botName || DEFAULT_BOT_NAME,
    botUrl: portal.isStored ? stored.downloadUrl || DEFAULT_DOWNLOAD_URL : data.downloadUrl || DEFAULT_DOWNLOAD_URL,
    downloadUrl: portal.isStored ? stored.downloadUrl || DEFAULT_DOWNLOAD_URL : data.downloadUrl || DEFAULT_DOWNLOAD_URL,
    downloadItems: stored.downloadItems,
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

  const authorization = request.headers.get('authorization') || '';
  const token = String(authorization).replace(/^Bearer\s+/i, '').trim();
  const memberCode = String(member.memberCode || await getMemberCodeForSession(token) || '');
  const user = publicUser(member, memberCode);

  return json({
    ...user,
    tokenPresent: Boolean(token)
  });
}

async function authenticatedMember(request) {
  const { response, data } = await legacyJson(request, '/api/member/me', {
    method: 'GET',
    includeContentType: false
  });
  if (!response.ok) return { errorResponse: json(data, response.status) };

  const authorization = String(request.headers.get('authorization') || '');
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  const memberCode = String(data.memberCode || await getMemberCodeForSession(token) || '').trim();
  if (!memberCode) {
    return { errorResponse: json({ error: 'ไม่พบรหัสสมาชิก กรุณาเข้าสู่ระบบใหม่' }, 401) };
  }
  // Enforced here so every member-authenticated route (farm-history, usage
  // history, rent, redeem codes, ...) is covered by one check, even for a
  // session token issued before the account was disabled.
  if (await isMemberDisabled(memberCode)) {
    return { errorResponse: json({ error: 'บัญชีนี้ถูกปิดการใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบ' }, 403) };
  }
  return { memberCode, member: data };
}

async function receiveFarmEvent(request) {
  if (!sitesToken() || !validBotTelemetryRequest(request)) {
    return json({ error: 'ไม่อนุญาตให้ส่งข้อมูลการฟาร์ม' }, 401);
  }
  if (!codeStorageConfigured()) {
    return json({ error: 'ระบบบันทึกประวัติการฟาร์มยังไม่พร้อม' }, 503);
  }
  try {
    const result = await storeFarmEvent(await readJson(request));
    return json({ ok: true, duplicate: result.duplicate }, result.duplicate ? 200 : 202);
  } catch (error) {
    const reason = String(error?.message || 'INVALID_FARM_EVENT');
    if (reason === 'FARM_STORAGE_NOT_CONFIGURED') {
      return json({ error: 'ระบบบันทึกประวัติการฟาร์มยังไม่พร้อม' }, 503);
    }
    return json({ error: 'ข้อมูลผลการฟาร์มไม่ถูกต้อง' }, 400);
  }
}

async function receiveSessionHeartbeat(request) {
  if (!sitesToken() || !validBotTelemetryRequest(request)) {
    return json({ error: 'ไม่อนุญาตให้อัปเดต session ของบอท' }, 401);
  }
  if (!sessionStorageConfigured()) {
    return json({ error: 'ระบบ session ของบอทยังไม่พร้อม' }, 503);
  }
  try {
    const forwarded = String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const sourceIp = forwarded
      || String(request.headers.get('x-real-ip') || '').trim()
      || String(request.headers.get('cf-connecting-ip') || '').trim();
    const result = await storeSessionHeartbeat(await readJson(request), sourceIp);
    if (!result.allowed) {
      return json({ ok: false, ...result }, 409);
    }
    return json({ ok: true, ...result }, result.status === 'running' ? 202 : 200);
  } catch (error) {
    const reason = String(error?.message || 'UNKNOWN_SESSION_ERROR');
    if (reason === 'SESSION_STORAGE_NOT_CONFIGURED') {
      return json({ error: 'ระบบ session ของบอทยังไม่พร้อม' }, 503);
    }
    if (![
      'INVALID_MEMBER_CODE', 'INVALID_DEVICE_ID', 'INVALID_BOT_TYPE',
      'INVALID_STATUS', 'INVALID_SOURCE_IP'
    ].includes(reason)) {
      console.error('[Bot Session] Storage update failed:', reason);
      return json({ error: 'ระบบ session ขัดข้องชั่วคราว กรุณาลองใหม่', retryable: true }, 503);
    }
    return json({ error: 'ข้อมูล session ของบอทไม่ถูกต้อง' }, 400);
  }
}

async function memberFarmHistory(request) {
  const identity = await authenticatedMember(request);
  if (identity.errorResponse) return identity.errorResponse;
  const events = await listFarmEvents(identity.memberCode);
  return json({
    events,
    refreshIntervalSeconds: 60,
    updatedAt: new Date().toISOString()
  });
}

function normalizedMemberTopups(value) {
  const list = Array.isArray(value)
    ? value
    : Array.isArray(value?.topups)
      ? value.topups
      : Array.isArray(value?.history)
        ? value.history
        : [];
  return list.map(mapTopup);
}

async function memberTopupRecords(request, memberCode) {
  for (const pathname of ['/api/member/topups', '/api/member/topup/history']) {
    try {
      const { response, data } = await legacyJson(request, pathname, {
        method: 'GET',
        includeContentType: false
      });
      if (response.ok) return normalizedMemberTopups(data);
      if (response.status !== 404 && response.status !== 405) break;
    } catch {}
  }

  const adminToken = await getAdminServiceToken();
  if (!adminToken) return [];
  try {
    const { response, data } = await legacyJson(request, '/api/admin/overview', {
      method: 'GET',
      memberToken: adminToken,
      includeContentType: false
    });
    if (!response.ok) return [];
    return (data.topups || [])
      .filter((topup) => String(topup?.member_code || '') === memberCode)
      .map(mapTopup);
  } catch {
    return [];
  }
}

async function memberUsageHistory(request) {
  const identity = await authenticatedMember(request);
  if (identity.errorResponse) return identity.errorResponse;

  const [topups, allCodes] = await Promise.all([
    memberTopupRecords(request, identity.memberCode),
    codeStorageConfigured() ? listAccessCodes(500) : Promise.resolve([])
  ]);

  const topupItems = topups.map((topup) => ({
    id: `topup:${topup.id || topup.orderId}`,
    type: 'topup',
    title: 'เติมเงิน',
    amount: topup.amount,
    credits: topup.credits,
    reference: topup.slipRef || topup.orderId || '-',
    status: topup.status,
    createdAt: topup.createdAt,
    completedAt: topup.verifiedAt
  }));
  const codeItems = allCodes
    .filter((code) => code.status === 'used' && String(code.memberCode || '') === identity.memberCode)
    .map((code) => ({
      id: `code:${code.code}`,
      type: 'code',
      title: 'ใช้โค้ดวันใช้งาน',
      code: code.code,
      durationMinutes: Number(code.durationMinutes || 0),
      source: code.source || 'admin',
      paymentReference: code.paymentReference || '',
      redeemedAt: code.redeemedAt,
      expiresAt: code.expiresAt,
      createdAt: code.redeemedAt || code.claimedAt || code.createdAt,
      status: 'approved'
    }));

  const items = [...topupItems, ...codeItems].sort((left, right) => (
    Date.parse(String(right.createdAt || '')) - Date.parse(String(left.createdAt || ''))
  ));
  return json({ items, updatedAt: new Date().toISOString() });
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
      if (path === 'bot/farm-event' && request.method === 'POST') {
        return receiveFarmEvent(request);
      }
      if (path === 'bot/session-heartbeat' && request.method === 'POST') {
        return receiveSessionHeartbeat(request);
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
      if (path === 'users/farm-history' && request.method === 'GET') {
        return memberFarmHistory(request);
      }
      if (path === 'users/activity' && request.method === 'GET') {
        return memberUsageHistory(request);
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
      if (path === 'admin/users/disabled' && request.method === 'GET') {
        return adminDisabledUsers(request);
      }
      if (path === 'admin/farm-data' && request.method === 'GET') {
        return adminFarmDataList(request);
      }
      if (path.startsWith('admin/farm-data/') && request.method === 'GET') {
        return adminFarmDataDetail(request, decodeURIComponent(path.slice('admin/farm-data/'.length)));
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
