import { initRouter, navigateTo, consumePostLoginRedirect } from './router.js';

window.showPage = function(pageId) {
  document.querySelectorAll('.page').forEach((page) => {
    const isTarget = page.id === pageId;
    page.classList.toggle('hidden', !isTarget);
    page.classList.toggle('active', isTarget);
    page.setAttribute('aria-hidden', String(!isTarget));
  });

  const pageKey = String(pageId || '').replace(/-page$/, '');
  document.querySelectorAll('.nav-item, .nav-btn, [data-page]').forEach((item) => {
    const target = item.dataset.page || item.dataset.pageId || '';
    item.classList.toggle('active', target === pageId || target === pageKey);
  });

  if (pageId === 'dashboard-page') {
    document.getElementById('menu-home')?.classList.add('active');
  }
};

window.showSection = function(sectionId) {
  // The old setup route now opens the combined download + setup page.
  if (sectionId === 'tutorial') sectionId = 'download';
  document.querySelectorAll('.content-section').forEach((section) => {
    const isTarget = section.id === `section-${sectionId}`;
    section.classList.toggle('hidden', !isTarget);
    section.classList.toggle('active', isTarget);
  });
  document.querySelectorAll('.menu-item').forEach((item) => item.classList.remove('active'));
  document.getElementById(`menu-${sectionId}`)?.classList.add('active');

  if (sectionId === 'activity') renderActivityHistory();
  if (sectionId === 'farm-history') startFarmHistoryUpdates();
  else stopFarmHistoryUpdates();
  if (sectionId === 'admin') initAdminPanel();
  if (sectionId === 'player-farm-data') loadPlayerFarmDataList();
  if (sectionId === 'closed-accounts') loadClosedAccounts();
  if (sectionId === 'topup') loadSystemSettings(false);
  if (sectionId === 'download') {
    refreshCurrentMember().catch(() => {}).finally(() => applySystemSettingsToUI());
  }
};

const DEFAULT_API_BASE_URL = window.location.hostname.endsWith('.vercel.app')
  ? '/api'
  : 'https://ibot-cookierun-classic.onrender.com/api';
const API_BASE_URL = (window.BACKEND_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');
console.log('[API] Base URL:', API_BASE_URL);

function getApiErrorMessage(error, fallbackMessage) {
  const responseData = error?.response?.data;
  const message = (typeof responseData === 'string' && responseData.trim())
    || responseData?.message
    || responseData?.error
    || responseData?.details?.message
    || error?.message
    || fallbackMessage;
  const genericServerError = /^(internal server error|server error)$/i.test(String(message).trim())
    || /^request failed with status code 5\d\d$/i.test(String(message).trim());
  return genericServerError ? fallbackMessage : message;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[character]);
}

// Some mobile browsers (cookies blocked, private-mode storage partitioning,
// certain in-app webviews) throw a SecurityError just from touching
// `window.localStorage`. Every call site goes through these so a blocked
// browser degrades to a session that doesn't persist instead of crashing
// the login/dashboard flow outright. When it's blocked, reads/writes fall
// back to this in-memory object -- otherwise a blocked write (e.g. the
// token right after login) silently vanishes, the very next authed request
// goes out with no Authorization header, and the 401 gets misread as an
// expired session seconds after logging in.
let storageBlocked = false;
const memoryStorage = {};

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    storageBlocked = true;
    return Object.hasOwn(memoryStorage, key) ? memoryStorage[key] : null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    storageBlocked = true;
    memoryStorage[key] = String(value);
    return false;
  }
}

function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    storageBlocked = true;
    delete memoryStorage[key];
  }
}

function safeStorageClear() {
  try {
    localStorage.clear();
  } catch {
    storageBlocked = true;
    for (const key of Object.keys(memoryStorage)) delete memoryStorage[key];
  }
}

function getAuthHeaders() {
  const token = safeStorageGet('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// CKRCS BOT RENTAL
// 1. THREE.JS 3D BACKGROUND
let scene, camera, renderer, earth, stars;

function initThreeJS() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  try {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const earthGeometry = new THREE.SphereGeometry(1.5, 64, 64);
    const earthCanvas = document.createElement('canvas');
    earthCanvas.width = 1024;
    earthCanvas.height = 512;
    const ctx = earthCanvas.getContext('2d');

    const oceanGrad = ctx.createLinearGradient(0, 0, 1024, 512);
    oceanGrad.addColorStop(0, '#020d2e');
    oceanGrad.addColorStop(0.5, '#041a50');
    oceanGrad.addColorStop(1, '#020d2e');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, 1024, 512);

    ctx.fillStyle = 'rgba(0, 50, 100, 0.6)';
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
    ctx.lineWidth = 2;

    const blobs = [
      [200, 180, 120, 80], [400, 150, 100, 70], [600, 200, 90, 60],
      [150, 300, 80, 60], [350, 280, 110, 75], [550, 320, 100, 65],
      [750, 180, 90, 60], [800, 300, 80, 50], [250, 380, 70, 50]
    ];

    blobs.forEach(([x, y, rx, ry]) => {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    const earthTexture = new THREE.CanvasTexture(earthCanvas);
    const earthMaterial = new THREE.MeshPhongMaterial({
      map: earthTexture,
      emissive: new THREE.Color(0x001030),
      emissiveIntensity: 0.3,
      shininess: 80,
      transparent: true,
      opacity: 0.55
    });

    earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);

    // Orbit Ring
    const ringGeometry = new THREE.TorusGeometry(2.2, 0.008, 8, 200);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.4 });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 4;
    scene.add(ring);

    // Stars Field
    const starCount = 1500;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
      starPositions[i] = (Math.random() - 0.5) * 200;
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xaaddff, size: 0.15, transparent: true, opacity: 0.8 }));
    scene.add(stars);

    scene.add(new THREE.AmbientLight(0x112244, 0.6));
    const sun = new THREE.DirectionalLight(0x4499ff, 1.5);
    sun.position.set(5, 3, 5);
    scene.add(sun);

    function animate() {
      requestAnimationFrame(animate);
      if (earth) earth.rotation.y += 0.002;
      if (stars) stars.rotation.y -= 0.0003;
      renderer.render(scene, camera);
    }
    animate();
  } catch (e) {
    console.warn('Three.js canvas initialization skipped:', e);
  }
}

// 2. SYSTEM SETTINGS AND LOCAL STORAGE
const DEFAULT_SETTINGS = {
  botStatus: 'online',
  announcement: '',
  promptPayNumber: '',
  promptPayAccountName: '',
  promptPayQrUrl: '',
  botName: 'Ckrcsbot V18.1',
  siteName: 'CKRCS BOT',
  botUrl: 'https://drive.google.com/uc?export=download&id=1Wy3d4X1OOTvsXtOf4WrScRxpYljzbARq',
  downloadItems: [
    { id: 'farm', icon: '💰📦', label: 'ฟาร์มเงิน/กล่อง', description: 'วิ่งเก็บกล่องออโต้รันตลอดวัน', status: 'normal', url: '', tutorialUrl: '' },
    { id: 'powder', icon: '🧪', label: 'ย่อยผง', description: 'ย่อยผงอัตโนมัติ เปิดพร้อมกันได้หลายจอ', status: 'normal', url: '', tutorialUrl: '' },
    { id: 'friend', icon: '💌', label: 'เพิ่มเพื่อน/ส่งใจ', description: 'เพิ่มเพื่อนและส่งใจให้ครบทุกวัน (แบบเพิ่มเพื่อนปกติครบ 300 คน และส่งใจตรงรายชื่อเพื่อนทุกคน)', status: 'normal', url: '', tutorialUrl: 'https://youtu.be/hBXOy-5lAyQ' },
    { id: 'account', icon: '🆕', label: 'สมัครไอดี/ส่งใจ/เพิ่มเพื่อน', description: 'สมัครไอดีใหม่ ส่งใจ และเพิ่มเพื่อนในตัวเดียว (วนส่งใจให้ไอดีที่ขาดหัวใจ รองรับหลายจอ)', status: 'normal', url: '', tutorialUrl: 'https://youtu.be/BVrpmF8Qarc' }
  ],
  plans: {
    day1: { label: '1 วัน', days: 1, price: 15 },
    day3: { label: '3 วัน', days: 3, price: 40 },
    day7: { label: '7 วัน', days: 7, price: 100 },
    month1: { label: '30 วัน', days: 30, price: 300 }
  },
  paymentPlans: [
    { amount: 15, days: 1 },
    { amount: 30, days: 2 },
    { amount: 45, days: 3 },
    { amount: 100, days: 7 },
    { amount: 350, days: 30 }
  ],
  videoUrl: '',
  tutorialColor: 'cyan',
  steps: [
    'สมัครสมาชิกและเข้าสู่ระบบด้วยบัญชีของคุณ',
    'เติมเงินผ่าน PromptPay และแนบรูปสลิปที่ถูกต้อง',
    'เลือกแพ็กเกจเช่าบอท 1, 3, 7 หรือ 30 วัน',
    'ดาวน์โหลดบอทและใช้งานภายในวันหมดอายุที่ระบบแสดง'
  ]
};

let systemSettings = { ...DEFAULT_SETTINGS };

function getSystemSettings() {
  const saved = safeStorageGet('systemSettings');
  if (saved) {
    try {
      systemSettings = { ...systemSettings, ...JSON.parse(saved) };
    } catch (e) {}
  }
  return systemSettings;
}

function saveSystemSettings(settings) {
  systemSettings = { ...systemSettings, ...settings };
  safeStorageSet('systemSettings', JSON.stringify(systemSettings));
  applySystemSettingsToUI();
}

async function loadSystemSettings(useAdminEndpoint = false) {
  try {
    const config = useAdminEndpoint ? adminApiConfig() : {};
    const endpoint = useAdminEndpoint ? 'admin/settings' : 'settings';
    const response = await axios.get(`${API_BASE_URL}/${endpoint}`, config);
    saveSystemSettings({ ...getSystemSettings(), ...response.data });
  } catch (error) {
    console.warn('[SETTINGS] ใช้ค่าที่บันทึกไว้ชั่วคราว:', error?.message || error);
    applySystemSettingsToUI();
    if (useAdminEndpoint) throw error;
  }
  return getSystemSettings();
}

function promptPayQrPayload(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!/^0\d{9}$/.test(digits)) return '';

  const merchantAccount = `0016A00000067701011101130066${digits.slice(1)}`;
  const tlv = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;
  const beforeCrc = `000201010211${tlv('29', merchantAccount)}5802TH5303764`;
  let crc = 0xFFFF;
  for (const character of `${beforeCrc}6304`) {
    crc ^= character.charCodeAt(0) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return `${beforeCrc}6304${crc.toString(16).toUpperCase().padStart(4, '0')}`;
}

function fallbackPromptPayQrUrl(number) {
  const payload = promptPayQrPayload(number);
  return payload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=512x512&format=png&data=${encodeURIComponent(payload)}`
    : '';
}

function paymentPlansOf(settings = getSystemSettings()) {
  const source = Array.isArray(settings.paymentPlans) ? settings.paymentPlans : DEFAULT_SETTINGS.paymentPlans;
  const plans = source.slice(0, 10).map((item) => ({
    amount: Number(item?.amount),
    days: Number(item?.days)
  })).filter(({ amount, days }) => (
    Number.isInteger(amount) && amount >= 1
    && Number.isInteger(days) && days >= 1 && days <= 365
  ));
  return plans.length ? plans : DEFAULT_SETTINGS.paymentPlans.map((item) => ({ ...item }));
}

function renderPaymentPlans(settings = getSystemSettings()) {
  const plans = paymentPlansOf(settings);
  const display = document.getElementById('payment-plans-display');
  const editor = document.getElementById('payment-plans-editor');

  if (display) {
    display.innerHTML = plans.map(({ amount, days }) => (
      `<span><strong>${amount.toLocaleString('th-TH')} บาท</strong> = ${days.toLocaleString('th-TH')} วัน</span>`
    )).join('');
  }
  if (editor) {
    editor.innerHTML = plans.map(({ amount, days }, index) => `
      <div class="payment-plan-row" data-plan-index="${index}">
        <label>ราคา (บาท)
          <input type="number" min="1" max="100000" step="1" value="${amount}" class="admin-input payment-plan-amount" />
        </label>
        <span class="payment-plan-equals">=</span>
        <label>จำนวนวัน
          <input type="number" min="1" max="365" step="1" value="${days}" class="admin-input payment-plan-days" />
        </label>
      </div>
    `).join('');
  }
}

function applySystemSettingsToUI() {
  const settings = getSystemSettings();

  // Topup Section PromptPay Info
  const ppNum = document.getElementById('promptpay-number');
  const ppName = document.getElementById('promptpay-account-name');
  const qrImg = document.getElementById('qr-code-img');
  const announcementBanner = document.getElementById('announcement-banner');
  const announcementBannerText = document.getElementById('announce-text');

  if (ppNum) ppNum.textContent = settings.promptPayNumber || '-';
  if (ppName) ppName.textContent = `ชื่อบัญชี: ${settings.promptPayAccountName || '-'}`;
  if (qrImg) {
    const qrUrl = settings.promptPayQrUrl || fallbackPromptPayQrUrl(settings.promptPayNumber);
    qrImg.src = qrUrl;
    qrImg.classList.toggle('hidden', !qrUrl);
  }
  if (announcementBanner) announcementBanner.classList.toggle('hidden', !settings.announcement);
  if (announcementBannerText) announcementBannerText.textContent = settings.announcement || '';
  renderPaymentPlans(settings);

  updateDownloadPanel(settings);

  // System Settings Panel Inputs
  const sysAnnounce = document.getElementById('sys-announcement');
  const sysPP = document.getElementById('sys-promptpay');
  const sysPPName = document.getElementById('sys-promptpay-name');
  const sysSlipReceiver = document.getElementById('sys-slip-receiver');
  const sysQrUrl = document.getElementById('sys-qr-url');
  const sysQrPreview = document.getElementById('admin-qr-preview');
  const sysBotName = document.getElementById('sys-bot-name');
  const sysBotUrl = document.getElementById('sys-bot-url');
  const sysVidUrl = document.getElementById('sys-video-url');
  const sysTutorialColor = document.getElementById('sys-tutorial-color');
  const slip2GoStatus = document.getElementById('admin-slip2go-status');

  if (sysAnnounce) sysAnnounce.value = settings.announcement || '';
  if (sysPP) sysPP.value = settings.promptPayNumber || '';
  if (sysPPName) sysPPName.value = settings.promptPayAccountName || '';
  if (sysSlipReceiver) sysSlipReceiver.value = settings.slipReceiverName || '';
  if (sysQrUrl) sysQrUrl.value = settings.promptPayQrUrl || '';
  if (sysQrPreview) {
    sysQrPreview.src = settings.promptPayQrUrl || '';
    sysQrPreview.classList.toggle('hidden', !settings.promptPayQrUrl);
  }
  if (sysBotName) sysBotName.value = settings.botName || '';
  if (sysBotUrl) sysBotUrl.value = settings.botUrl || '';
  if (sysVidUrl) sysVidUrl.value = settings.videoUrl || '';
  if (sysTutorialColor) sysTutorialColor.value = settings.tutorialColor || 'cyan';
  if (slip2GoStatus) {
    const ready = settings.slip2GoConfigured === true;
    slip2GoStatus.textContent = ready
      ? '✅ Slip2Go พร้อมตรวจสลิปจริง'
      : '❌ ยังไม่ได้ตั้งค่า SLIP2GO_API_SECRET บนเซิร์ฟเวอร์';
    slip2GoStatus.style.color = ready ? 'var(--success)' : 'var(--danger)';
  }

  // Tutorial Video Iframe & Steps
  const tutIframe = document.getElementById('tutorial-iframe');
  const tutorialVideoBox = document.getElementById('tutorial-video-box');
  const embedUrl = normalizeVideoEmbedUrl(settings.videoUrl);
  if (tutIframe && embedUrl) tutIframe.src = embedUrl;
  if (tutorialVideoBox) tutorialVideoBox.classList.toggle('hidden', !embedUrl);

  const visibleSteps = settings.steps?.length ? settings.steps : DEFAULT_SETTINGS.steps;
  renderTutorialSteps(visibleSteps, settings.tutorialColor || 'cyan');
  renderPackagePlans(settings.plans || {});
}

function licenseIsActive(user = currentUser) {
  const expiresAt = user?.expiresAt || user?.botExpiry;
  const expiresAtMs = Date.parse(expiresAt || '');
  return Boolean(user && Number.isFinite(expiresAtMs) && expiresAtMs > Date.now());
}

function formatExpiry(expiresAt) {
  const date = new Date(expiresAt || '');
  if (!Number.isFinite(date.getTime())) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Bangkok'
  }).format(date);
}

function updateDownloadPanel(settings = getSystemSettings()) {
  const downloadLink = document.getElementById('download-link');
  const downloadWarning = document.getElementById('download-warning');
  const botNameDisplay = document.getElementById('bot-name-display');
  const active = licenseIsActive();
  const hasUrl = Boolean(settings.botUrl && settings.botUrl.startsWith('https://'));

  if (botNameDisplay) botNameDisplay.textContent = settings.botName || 'ยังไม่ได้ตั้งชื่อบอท';
  if (downloadLink) {
    downloadLink.href = active && hasUrl ? settings.botUrl : '#';
    downloadLink.target = '_blank';
    downloadLink.rel = 'noopener noreferrer';
    downloadLink.classList.toggle('disabled', !active || !hasUrl);
    downloadLink.setAttribute('aria-disabled', String(!active || !hasUrl));
  }
  if (downloadWarning) {
    const message = !hasUrl
      ? '⚠️ ผู้ดูแลยังไม่ได้ตั้งลิงก์ดาวน์โหลดบอท'
      : !active
        ? '⚠️ วันใช้งานหมดแล้ว กรุณาต่ออายุก่อนดาวน์โหลด'
        : '';
    downloadWarning.textContent = message;
    downloadWarning.classList.toggle('hidden', !message);
  }

  renderHomeBotMenu(settings);
  renderHomeTutorialList(settings);
  renderDownloadItemsEditor(settings);
}

function downloadItemsOf(settings = getSystemSettings()) {
  const saved = Array.isArray(settings.downloadItems)
    ? settings.downloadItems
    : DEFAULT_SETTINGS.downloadItems;
  return saved.map((item, index) => ({
    id: String(item?.id || `bot-${index + 1}`),
    icon: String(item?.icon || '🤖'),
    label: String(item?.label || 'บอทใหม่'),
    description: String(item?.description || ''),
    status: item?.status === 'maintenance' ? 'maintenance' : 'normal',
    url: String(item?.url || ''),
    tutorialUrl: String(item?.tutorialUrl || '')
  }));
}

// Home page showcase: the same four bots, but read-only. It advertises what the
// service covers, so it stays visible whether or not the member can download.
function renderHomeBotMenu(settings = getSystemSettings()) {
  const grid = document.getElementById('home-bot-menu-grid');
  if (!grid) return;

  grid.replaceChildren(...downloadItemsOf(settings).map((item) => {
    const card = document.createElement('article');
    card.className = 'home-bot-card';

    const icon = document.createElement('div');
    icon.className = 'home-bot-icon';
    icon.textContent = item.icon;

    const title = document.createElement('h4');
    title.className = 'home-bot-title';
    title.textContent = item.label;

    const note = document.createElement('p');
    note.className = 'home-bot-note';
    note.textContent = item.description;

    const status = document.createElement('div');
    status.className = `home-bot-status ${item.status}`;
    const dot = document.createElement('span');
    dot.className = 'home-bot-status-dot';
    dot.setAttribute('aria-hidden', 'true');
    const statusText = document.createElement('span');
    statusText.textContent = item.status === 'maintenance' ? 'กำลังปรับปรุง' : 'ใช้งานปกติ';
    status.append(dot, statusText);

    card.append(icon, title, note, status);
    return card;
  }));
}

// Home page tutorial box: lists the same four bots with a link button for
// whichever ones the admin attached a tutorial clip to.
function renderHomeTutorialList(settings = getSystemSettings()) {
  const list = document.getElementById('home-tutorial-list');
  if (!list) return;

  list.replaceChildren(...downloadItemsOf(settings).map((item) => {
    const row = document.createElement('div');
    row.className = 'home-tutorial-row';

    const label = document.createElement('span');
    label.className = 'home-tutorial-label';
    label.textContent = `${item.icon} ${item.label}`;
    row.append(label);

    if (item.tutorialUrl) {
      const link = document.createElement('a');
      link.className = 'home-tutorial-link';
      link.href = item.tutorialUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '🎬 คลิกดูคลิปวิธีใช้งาน';
      row.append(link);
    }

    return row;
  }));
}

function renderDownloadItemsEditor(settings = getSystemSettings()) {
  const editor = document.getElementById('download-items-editor');
  if (!editor) return;

  editor.replaceChildren(...downloadItemsOf(settings).map(createDownloadItemEditorRow));
}

function createDownloadItemEditorRow(item) {
  const row = document.createElement('div');
  row.className = 'download-item-row';
  row.dataset.itemId = item.id;

  const headingRow = document.createElement('div');
  headingRow.className = 'download-item-heading-row';
  const heading = document.createElement('div');
  heading.className = 'download-item-heading';
  heading.textContent = `${item.icon} ${item.label}`;

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'download-item-remove';
  removeButton.textContent = '🗑️ ลบช่อง';
  removeButton.setAttribute('aria-label', `ลบช่อง ${item.label}`);
  removeButton.addEventListener('click', () => row.remove());
  headingRow.append(heading, removeButton);

  const iconInput = document.createElement('input');
  iconInput.type = 'text';
  iconInput.className = 'admin-input download-item-icon';
  iconInput.maxLength = 16;
  iconInput.placeholder = 'ไอคอน เช่น 🤖';
  iconInput.value = item.icon;

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'admin-input download-item-label';
  labelInput.maxLength = 60;
  labelInput.placeholder = 'ชื่อที่แสดงบนหน้าเว็บ';
  labelInput.value = item.label;
  const updateHeading = () => {
    heading.textContent = `${iconInput.value.trim() || '🤖'} ${labelInput.value.trim() || 'บอทใหม่'}`;
  };
  iconInput.addEventListener('input', updateHeading);
  labelInput.addEventListener('input', updateHeading);

  const descriptionInput = document.createElement('input');
  descriptionInput.type = 'text';
  descriptionInput.className = 'admin-input download-item-description';
  descriptionInput.maxLength = 160;
  descriptionInput.placeholder = 'คำอธิบายสั้น ๆ ใต้ชื่อ';
  descriptionInput.value = item.description;

  const statusSelect = document.createElement('select');
  statusSelect.className = 'admin-select download-item-status';
  statusSelect.setAttribute('aria-label', `สถานะของ ${item.label}`);
  statusSelect.append(
    new Option('🟢 ใช้งานปกติ', 'normal'),
    new Option('🟡 กำลังปรับปรุง', 'maintenance')
  );
  statusSelect.value = item.status;

  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.className = 'admin-input download-item-url';
  urlInput.placeholder = 'https://ลิงก์ดาวน์โหลด';
  urlInput.value = item.url;

  const tutorialUrlInput = document.createElement('input');
  tutorialUrlInput.type = 'url';
  tutorialUrlInput.className = 'admin-input download-item-tutorial-url';
  tutorialUrlInput.placeholder = 'ลิงก์คลิปสอน (ไม่บังคับ) เช่น https://youtu.be/...';
  tutorialUrlInput.value = item.tutorialUrl;

  row.append(headingRow, iconInput, labelInput, descriptionInput, statusSelect, urlInput, tutorialUrlInput);
  return row;
}

window.addDownloadItem = function() {
  const editor = document.getElementById('download-items-editor');
  if (!editor) return;
  if (editor.children.length >= 20) {
    window.showToast('เพิ่มได้สูงสุด 20 ช่องบอท', 'error');
    return;
  }
  const id = `bot-${Date.now()}-${editor.children.length + 1}`;
  editor.append(createDownloadItemEditorRow({
    id,
    icon: '🤖',
    label: 'บอทใหม่',
    description: '',
    status: 'normal',
    url: '',
    tutorialUrl: ''
  }));
  editor.lastElementChild?.querySelector('.download-item-label')?.focus();
};

window.saveDownloadItems = async function() {
  const rows = [...document.querySelectorAll('#download-items-editor .download-item-row')];
  if (!rows.length) return;

  const downloadItems = rows.map((row) => ({
    id: row.dataset.itemId,
    icon: row.querySelector('.download-item-icon')?.value.trim() || '🤖',
    label: row.querySelector('.download-item-label')?.value.trim() || '',
    description: row.querySelector('.download-item-description')?.value.trim() || '',
    status: row.querySelector('.download-item-status')?.value === 'maintenance' ? 'maintenance' : 'normal',
    url: row.querySelector('.download-item-url')?.value.trim() || '',
    tutorialUrl: row.querySelector('.download-item-tutorial-url')?.value.trim() || ''
  }));

  const badLink = downloadItems.find((item) => item.url && !item.url.startsWith('https://'));
  if (badLink) {
    window.showToast(`ลิงก์ของ "${badLink.label}" ต้องขึ้นต้นด้วย https://`, 'error');
    return;
  }
  const badTutorialLink = downloadItems.find((item) => item.tutorialUrl && !item.tutorialUrl.startsWith('https://'));
  if (badTutorialLink) {
    window.showToast(`ลิงก์คลิปสอนของ "${badTutorialLink.label}" ต้องขึ้นต้นด้วย https://`, 'error');
    return;
  }

  try {
    await axios.post(`${API_BASE_URL}/admin/settings`, { downloadItems }, adminApiConfig());
    await loadSystemSettings(true);
    window.showToast('บันทึกเมนูบอทหน้าแรกแล้ว', 'success');
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'บันทึกเมนูบอทหน้าแรกไม่สำเร็จ'), 'error');
  }
};

window.startDownload = function(event) {
  const settings = getSystemSettings();
  if (!licenseIsActive() || !settings.botUrl?.startsWith('https://')) {
    event?.preventDefault();
    updateDownloadPanel(settings);
    window.showToast('ยังไม่สามารถดาวน์โหลดได้ กรุณาตรวจวันใช้งานและลิงก์ดาวน์โหลด', 'error');
    return false;
  }
  return true;
};

function normalizeVideoEmbedUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed/${encodeURIComponent(url.pathname.slice(1))}`;
    }
    if (url.hostname.endsWith('youtube.com')) {
      if (url.pathname.startsWith('/embed/')) return raw;
      const videoId = url.searchParams.get('v');
      if (videoId) return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
    }
    return raw;
  } catch {
    return '';
  }
}

function renderPackagePlans(plans) {
  const grid = document.getElementById('packages-grid');
  if (!grid) return;

  const styles = {
    day1: { icon: '📦', card: '', text: '', badge: '', button: '' },
    day3: { icon: '🎁', card: '', text: '', badge: '', button: '' },
    day7: { icon: '👑', card: 'highlight-gold', text: 'gold-text', badge: 'gold-badge', button: 'gold-btn' },
    month1: { icon: '💎', card: 'highlight-purple', text: 'purple-text', badge: 'purple-badge', button: 'purple-btn' }
  };

  const validPlans = ['day1', 'day3', 'day7', 'month1']
    .map((id) => ({ id, ...plans[id] }))
    .filter((plan) => Number.isInteger(Number(plan.days)) && Number.isInteger(Number(plan.price)));

  if (!validPlans.length) {
    grid.innerHTML = '<div class="empty-state">ยังไม่มีแพ็กเกจที่พร้อมใช้งาน</div>';
    return;
  }

  grid.innerHTML = validPlans.map((plan) => {
    const style = styles[plan.id];
    const days = Number(plan.days);
    const price = Number(plan.price);
    return `
      <div class="pkg-card ${style.card}">
        <div class="pkg-title ${style.text}">${escapeHtml(plan.label || `${days} วัน`)}</div>
        <div class="pkg-price ${style.text}">${price.toLocaleString('th-TH')} เพชร</div>
        <div class="pkg-chest-container">
          <div class="chest-box">
            <span class="chest-icon">${style.icon}</span>
            <span class="chest-badge ${style.badge}">${days}</span>
          </div>
        </div>
        <button class="btn-redeem ${style.button}" onclick="rentBot(${days}, ${price})">แลกวัน</button>
      </div>
    `;
  }).join('');
}

function renderTutorialSteps(steps, color = getSystemSettings().tutorialColor || 'cyan') {
  const stepsContainer = document.getElementById('tutorial-steps');
  const editorContainer = document.getElementById('steps-editor');

  if (stepsContainer) {
    stepsContainer.innerHTML = steps.map((step, idx) => `
      <div class="step-card card-panel tutorial-glow tutorial-glow-${escapeHtml(color)}">
        <div class="step-num">${idx + 1}</div>
        <div class="step-text">${escapeHtml(step)}</div>
      </div>
    `).join('');
  }

  if (editorContainer) {
    editorContainer.innerHTML = steps.map((step, idx) => `
      <div class="input-row" style="margin-bottom:8px">
        <input type="text" maxlength="100" value="${escapeHtml(step)}" class="admin-input step-edit-input" data-idx="${idx}" />
        <button class="btn-danger" onclick="deleteStep(${idx})" style="background:var(--danger); color:#fff; border:none; padding:6px 12px; border-radius:6px; font-weight:bold; cursor:pointer;">✕</button>
      </div>
    `).join('');
  }
}

// 3. USER MANAGEMENT AND STATE
let currentUser = null;

function getRegisteredUsers() {
  const saved = safeStorageGet('registeredUsers');
  if (saved) {
    try {
      return JSON.parse(saved).map(({ password, ...user }) => user);
    } catch (e) {}
  }
  return [];
}

window.addStep = function() {
  const input = document.getElementById('new-step-text');
  const text = input?.value.trim();
  if (!text) {
    window.showToast('กรุณากรอกข้อความขั้นตอน', 'error');
    return;
  }
  const settings = getSystemSettings();
  const currentSteps = settings.steps?.length ? settings.steps : DEFAULT_SETTINGS.steps;
  if (currentSteps.length >= 8) {
    window.showToast('ใส่ได้ไม่เกิน 8 ขั้นตอน', 'error');
    return;
  }
  settings.steps = [...currentSteps, text];
  saveSystemSettings(settings);
  input.value = '';
};

window.deleteStep = function(index) {
  const settings = getSystemSettings();
  const currentSteps = settings.steps?.length ? settings.steps : DEFAULT_SETTINGS.steps;
  settings.steps = currentSteps.filter((_, itemIndex) => itemIndex !== Number(index));
  saveSystemSettings(settings);
};

window.saveTutorialSettings = async function() {
  const settings = getSystemSettings();
  settings.steps = [...document.querySelectorAll('.step-edit-input')]
    .map((input) => input.value.trim())
    .filter(Boolean);
  saveSystemSettings(settings);
  const videoUrl = document.getElementById('sys-video-url')?.value.trim() || '';
  const tutorialColor = document.getElementById('sys-tutorial-color')?.value || 'cyan';

  if (videoUrl && !videoUrl.startsWith('https://')) {
    window.showToast('ลิงก์วิดีโอต้องขึ้นต้นด้วย https://', 'error');
    return;
  }

  try {
    await axios.post(`${API_BASE_URL}/admin/settings`, {
      tutorialVideoUrl: videoUrl,
      tutorialColor,
      tutorialSteps: settings.steps
    }, adminApiConfig());
    await loadSystemSettings(true);
    window.showToast('บันทึกวิดีโอ สี และขั้นตอนการใช้งานแล้ว', 'success');
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'บันทึกวิธีใช้งานไม่สำเร็จ'), 'error');
  }
};

window.saveSteps = window.saveTutorialSettings;

window.previewTutorialColor = function() {
  const color = document.getElementById('sys-tutorial-color')?.value || 'cyan';
  const settings = getSystemSettings();
  renderTutorialSteps(settings.steps?.length ? settings.steps : DEFAULT_SETTINGS.steps, color);
};

function saveRegisteredUsers(users) {
  safeStorageSet('registeredUsers', JSON.stringify(users));
}

// 4. TOAST AND MODAL HELPERS
window.showToast = function(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const message = document.createElement('span');
  message.textContent = String(msg ?? '');
  toast.appendChild(message);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
};

window.openModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
};

window.closeModal = function(modalId, event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
};

// Mobile off-canvas sidebar drawer (hamburger toggle in the topbar).
window.toggleSidebarDrawer = function() {
  const isOpen = document.body.classList.toggle('sidebar-open');
  document.getElementById('sidebar-toggle-btn')?.setAttribute('aria-expanded', String(isOpen));
};

window.closeSidebarDrawer = function() {
  document.body.classList.remove('sidebar-open');
  document.getElementById('sidebar-toggle-btn')?.setAttribute('aria-expanded', 'false');
};

window.togglePassword = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.textContent = '🙈';
  } else {
    input.type = 'password';
    if (btn) btn.textContent = '👁️';
  }
};

// ─── 5. AUTHENTICATION (LOGIN / REGISTER / LOGOUT) ──────────────────────────

// ── Tab Switcher ──────────────────────────────────────────────────────────────
let currentAuthView = 'login';

window.switchTab = function(tabName) {
  const nextView = tabName === 'register' ? 'register' : 'login';
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');
  const tabLogin = document.getElementById('tab-login');
  const tabReg = document.getElementById('tab-register');

  if (!loginForm || !regForm) {
    console.warn('[AUTH] switchTab: login-form or register-form not found in DOM');
    return;
  }

  currentAuthView = nextView;
  const isLogin = currentAuthView === 'login';

  loginForm.classList.toggle('hidden', !isLogin);
  regForm.classList.toggle('hidden', isLogin);
  tabLogin?.classList.toggle('active', isLogin);
  tabReg?.classList.toggle('active', !isLogin);
  tabLogin?.setAttribute('aria-selected', String(isLogin));
  tabReg?.setAttribute('aria-selected', String(!isLogin));

  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');
  if (loginError) loginError.textContent = '';
  if (registerError) registerError.textContent = '';
};

// ── Login ─────────────────────────────────────────────────────────────────────
window.handleLogin = async function(event) {
  event?.preventDefault();
  const usernameEl = document.getElementById('login-username');
  const passwordEl = document.getElementById('login-password');
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  const username = usernameEl?.value.trim() || '';
  const password = passwordEl?.value || '';

  if (errEl) errEl.textContent = '';
  if (!username || !password) {
    if (errEl) errEl.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⟳</span> กำลังเข้าสู่ระบบ...';
  }

  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, { username, password });
    const token = response.data?.token;
    const user = response.data?.user;
    if (!token || !user) throw new Error('เซิร์ฟเวอร์ส่งข้อมูลการเข้าสู่ระบบไม่ครบถ้วน');

    currentUser = user;
    safeStorageSet('token', token);
    safeStorageSet('user', JSON.stringify(user));
    safeStorageSet('authSessionVersion', 'legacy-admin-v2');
    if (passwordEl) passwordEl.value = '';
    // We already have fresh user data from the login response itself --
    // skip the immediate re-fetch so a slow/cold backend on this first
    // request right after login can't misfire a false "session expired".
    skipNextDashboardBootRefresh = true;
    navigateTo(consumePostLoginRedirect() || '/dashboard', { replace: true });
    window.showToast(
      storageBlocked
        ? `เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ${user.username} 🎉 (เบราว์เซอร์บล็อกการจำข้อมูล อาจต้องเข้าสู่ระบบใหม่ทุกครั้งที่เปิดเว็บ)`
        : `เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ${user.username} 🎉`,
      'success'
    );
  } catch (error) {
    console.log('[AUTH] Login request error:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      response: error.response?.data,
      method: error.config?.method,
      url: error.config?.url
    });
    const message = getApiErrorMessage(error, 'ไม่สามารถเข้าสู่ระบบได้');
    const friendly = /network|connect|econnrefused|failed to fetch/i.test(message)
      ? 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง'
      : message;
    if (errEl) errEl.textContent = friendly;
    window.showToast(friendly, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-icon">🚀</span> เข้าสู่ระบบ';
    }
  }
};

// ── Register ──────────────────────────────────────────────────────────────────
window.handleRegister = async function(event) {
  event?.preventDefault();
  const usernameEl = document.getElementById('reg-username');
  const passwordEl = document.getElementById('reg-password');
  const confirmEl = document.getElementById('reg-confirm');
  const errEl = document.getElementById('register-error');
  const btn = document.getElementById('register-btn');
  const username = usernameEl?.value.trim() || '';
  const password = passwordEl?.value || '';
  const confirm = confirmEl?.value || '';

  if (errEl) errEl.textContent = '';
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    if (errEl) errEl.textContent = 'ชื่อผู้ใช้ต้องเป็น a-z, 0-9 หรือ _ จำนวน 3-32 ตัว';
    return;
  }
  if (password.length < 8) {
    if (errEl) errEl.textContent = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
    return;
  }
  if (password !== confirm) {
    if (errEl) errEl.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⟳</span> กำลังสมัครสมาชิก...';
  }

  try {
    await axios.post(`${API_BASE_URL}/auth/register`, { username, password });
    window.showToast('สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ', 'success');
    window.switchTab('login');
    const loginUsername = document.getElementById('login-username');
    if (loginUsername) loginUsername.value = username;
    usernameEl.value = '';
    passwordEl.value = '';
    confirmEl.value = '';
  } catch (error) {
    const message = getApiErrorMessage(error, 'ไม่สามารถสมัครสมาชิกได้');
    const friendly = /network|connect|econnrefused|failed to fetch/i.test(message)
      ? 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง'
      : message;
    if (errEl) errEl.textContent = friendly;
    window.showToast(friendly, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-icon">✨</span> สมัครสมาชิก';
    }
  }
};

// ── Logout ────────────────────────────────────────────────────────────────────
window.handleLogout = function() {
  console.log('[AUTH] handleLogout triggered');
  safeStorageRemove('token');
  safeStorageRemove('user');
  currentUser = null;
  dashboardBooted = false;
  stopFarmHistoryUpdates();
  if (typeof liveCountdownInterval !== 'undefined' && liveCountdownInterval) {
    clearInterval(liveCountdownInterval);
  }
  window.switchTab('login');
  navigateTo('/login', { replace: true });
  window.showToast('ออกจากระบบเรียบร้อยแล้ว 👋', 'info');
};


// 6. DASHBOARD AND RENTAL SYSTEM
let liveCountdownInterval = null;
let pendingRedeem = null;
let dashboardBooted = false;
let skipNextDashboardBootRefresh = false;

// Called by the router every time it lands on dashboard-page. initDashboard()
// only needs to run once per login session (it sets up the topbar, admin
// menu visibility and the /users/me refresh) -- switching between sidebar
// sections afterwards only needs showSection(), not a full re-boot.
function handleRouteEnter(route) {
  window.closeSidebarDrawer();
  window.showPage(route.page);
  if (route.page === 'dashboard-page' && !dashboardBooted) {
    dashboardBooted = true;
    initDashboard(skipNextDashboardBootRefresh);
    skipNextDashboardBootRefresh = false;
  }
  if (route.section) window.showSection(route.section);
}

function initDashboard(skipRefresh = false) {
  const userStr = safeStorageGet('user');
  if (userStr) {
    try { currentUser = JSON.parse(userStr); } catch (e) {}
  }
  if (!currentUser) {
    dashboardBooted = false;
    navigateTo('/login', { replace: true });
    return;
  }

  // Update Topbar Username & Diamonds
  const usernameEl = document.getElementById('topbar-username');
  const diamondsEl = document.getElementById('topbar-diamonds');
  if (usernameEl) usernameEl.textContent = currentUser.username;
  if (diamondsEl) diamondsEl.textContent = currentUser.diamonds || 0;

  // Update Home Stat Cards
  const homeDiamondsEl = document.getElementById('home-diamonds');
  const homeBotStatusEl = document.getElementById('home-bot-status');

  if (homeDiamondsEl) homeDiamondsEl.textContent = currentUser.diamonds || 0;

  const expiryValue = currentUser.expiresAt || currentUser.botExpiry;
  if (expiryValue) {
    const expiry = new Date(expiryValue).getTime();
    const diff = expiry - Date.now();
    if (diff > 0) {
      if (homeBotStatusEl) homeBotStatusEl.textContent = 'กำลังใช้งาน';
    } else {
      if (homeBotStatusEl) homeBotStatusEl.textContent = 'หมดอายุ';
    }
  } else {
    if (homeBotStatusEl) homeBotStatusEl.textContent = 'ยังไม่ได้เช่า';
  }

  // Toggle Admin Menu Button Visibility
  const isAdmin = currentUser.role === 'admin';
  document.querySelectorAll('.admin-only').forEach(el => {
    if (isAdmin) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });

  applySystemSettingsToUI();
  startLiveCountdownTicker();

  if (!skipRefresh && currentUser.role !== 'admin') {
    axios.get(`${API_BASE_URL}/users/me`, { headers: getAuthHeaders() })
      .then((response) => {
        currentUser = { ...currentUser, ...response.data };
        safeStorageSet('user', JSON.stringify(currentUser));
        initDashboard(true);
      })
      .catch((error) => {
        if (error?.response?.status === 401) {
          safeStorageRemove('token');
          safeStorageRemove('user');
          currentUser = null;
          dashboardBooted = false;
          navigateTo('/login', { replace: true });
          window.showToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
        }
      });
  }
}

async function refreshCurrentMember() {
  if (!currentUser || currentUser.role === 'admin') return currentUser;
  const response = await axios.get(`${API_BASE_URL}/users/me`, { headers: getAuthHeaders() });
  currentUser = { ...currentUser, ...response.data };
  safeStorageSet('user', JSON.stringify(currentUser));
  updateHomeCountdownDisplay();
  return currentUser;
}

function accessCodeDeviceId() {
  const key = 'ckrcs_access_code_device';
  let value = safeStorageGet(key) || '';
  if (!/^[A-Za-z0-9_-]{12,120}$/.test(value)) {
    value = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    safeStorageSet(key, value);
  }
  return value;
}

window.redeemAccessCode = async function(event) {
  event?.preventDefault();
  const input = document.getElementById('access-code-input');
  const button = document.getElementById('access-code-submit');
  const message = document.getElementById('access-code-message');
  const code = String(input?.value || '').trim().toUpperCase();
  if (message) message.textContent = '';

  if (currentUser?.role === 'admin') {
    const adminMessage = 'บัญชีผู้ดูแลใช้สำหรับสร้างและจัดการโค้ด ไม่ใช่บัญชีรับวันใช้งาน กรุณาออกจากระบบแล้วเข้าสู่บัญชีสมาชิกที่ต้องการเพิ่มวัน';
    if (message) message.textContent = adminMessage;
    window.showToast(adminMessage, 'error');
    return;
  }

  if (!/^BOT-\d{2}COOKIE-CKR[A-Z]{11}$/.test(code)) {
    if (message) message.textContent = 'กรุณากรอกโค้ดให้ครบและถูกต้อง';
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = 'กำลังตรวจสอบ...';
  }
  try {
    const response = await axios.post(`${API_BASE_URL}/codes/redeem`, {
      code,
      deviceId: accessCodeDeviceId()
    }, { headers: getAuthHeaders() });
    if (input) input.value = '';
    if (message) message.textContent = response.data?.message || 'เพิ่มวันใช้งานสำเร็จแล้ว';
    await refreshCurrentMember();
    initDashboard(true);
    window.showToast(response.data?.message || 'เพิ่มวันใช้งานสำเร็จแล้ว', 'success');
  } catch (error) {
    const text = getApiErrorMessage(error, 'ใช้โค้ดไม่สำเร็จ');
    if (message) message.textContent = text;
    window.showToast(text, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'ยืนยันใช้โค้ด';
    }
  }
};

window.rentBot = function(days, price) {
  if (!currentUser) return;
  const userDiamonds = currentUser.diamonds || 0;

  if (userDiamonds < price) {
    window.showToast(`เพชรไม่พอ ต้องใช้ ${price} เพชร (มี ${userDiamonds} เพชร)`, 'error');
    return;
  }

  pendingRedeem = { days, price };

  const pkgNameEl = document.getElementById('confirm-pkg-name');
  const pkgCostEl = document.getElementById('confirm-pkg-cost');
  const leftEl = document.getElementById('confirm-diamonds-left');

  if (pkgNameEl) pkgNameEl.textContent = `เช่าบอท ${days} วัน`;
  if (pkgCostEl) pkgCostEl.textContent = `ราคา ${price} เพชร`;
  if (leftEl) leftEl.textContent = `เพชรคงเหลือหลังซื้อ: ${userDiamonds - price} เพชร`;

  window.openModal('confirm-modal');
};

window.confirmRedeemBot = async function() {
  if (!currentUser || !pendingRedeem) return;

  const { days, price } = pendingRedeem;
  const userDiamonds = currentUser.diamonds || 0;

  if (userDiamonds < price) {
    window.showToast('เพชรไม่พอสำหรับแพ็กเกจนี้', 'error');
    window.closeModal('confirm-modal');
    return;
  }

  const confirmButton = document.getElementById('confirm-submit-btn');
  if (confirmButton) confirmButton.disabled = true;

  try {
    const response = await axios.post(
      `${API_BASE_URL}/users/rent`,
      { days },
      { headers: getAuthHeaders() }
    );
    const data = response.data || {};
    currentUser = {
      ...currentUser,
      diamonds: Number.isFinite(Number(data.diamonds)) ? Number(data.diamonds) : userDiamonds - price,
      botExpiry: data.botExpiry || data.expiresAt || currentUser.botExpiry,
      expiresAt: data.expiresAt || data.botExpiry || currentUser.expiresAt
    };
    safeStorageSet('user', JSON.stringify(currentUser));
    pendingRedeem = null;
    window.closeModal('confirm-modal');
    initDashboard(true);
    window.showToast(data.message || `เช่าบอท ${days} วันสำเร็จ 🎉`, 'success');
  } catch (error) {
    window.showToast(error.response?.data?.error || error.message || 'ไม่สามารถเช่าบอทได้', 'error');
  } finally {
    if (confirmButton) confirmButton.disabled = false;
  }
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');
  if (loginError) loginError.textContent = '';
  if (registerError) registerError.textContent = '';
};

function startLiveCountdownTicker() {
  if (liveCountdownInterval) clearInterval(liveCountdownInterval);
  updateHomeCountdownDisplay();
  liveCountdownInterval = setInterval(updateHomeCountdownDisplay, 1000);
}

function updateHomeCountdownDisplay() {
  const cdDays = document.getElementById('cd-days');
  const cdHours = document.getElementById('cd-hours');
  const cdMins = document.getElementById('cd-mins');
  const cdSecs = document.getElementById('cd-secs');

  if (!cdDays || !cdHours || !cdMins || !cdSecs) return;

  const expiryValue = currentUser?.expiresAt || currentUser?.botExpiry;
  if (!currentUser || !expiryValue) {
    cdDays.textContent = '00';
    cdHours.textContent = '00';
    cdMins.textContent = '00';
    cdSecs.textContent = '00';
    return;
  }

  const expiry = new Date(expiryValue).getTime();
  const diff = expiry - Date.now();

  if (diff > 0) {
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    cdDays.textContent = String(days).padStart(2, '0');
    cdHours.textContent = String(hours).padStart(2, '0');
    cdMins.textContent = String(mins).padStart(2, '0');
    cdSecs.textContent = String(secs).padStart(2, '0');
  } else {
    cdDays.textContent = '00';
    cdHours.textContent = '00';
    cdMins.textContent = '00';
    cdSecs.textContent = '00';
  }
}

// ─── 7. CLIENT SLIP TOPUP & SLIP2GO VERIFICATION ───────────────────
let currentSelectedSlipFile = null;

window.handleSlipPreview = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    event.target.value = '';
    window.showToast('รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP', 'error');
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    event.target.value = '';
    window.showToast('ไฟล์สลิปต้องมีขนาดไม่เกิน 4MB', 'error');
    return;
  }

  currentSelectedSlipFile = file;
  const reader = new FileReader();
  reader.onload = function(e) {
    const previewImg = document.getElementById('slip-preview');
    const container = document.getElementById('slip-preview-container');
    const placeholder = document.getElementById('upload-placeholder');

    if (previewImg) previewImg.src = e.target.result;
    if (container) container.classList.remove('hidden');
    if (placeholder) placeholder.classList.add('hidden');
  };
  reader.readAsDataURL(file);
};

window.removeSlip = function() {
  currentSelectedSlipFile = null;
  const slipInput = document.getElementById('slip-input');
  const container = document.getElementById('slip-preview-container');
  const placeholder = document.getElementById('upload-placeholder');

  if (slipInput) slipInput.value = '';
  if (container) container.classList.add('hidden');
  if (placeholder) placeholder.classList.remove('hidden');
};

window.handleSlipSubmit = async function(event) {
  if (event) event.preventDefault();
  if (!currentUser) return;

  const btn = document.getElementById('submit-slip-btn');
  const msgEl = document.getElementById('topup-msg');
  const amountEl = document.getElementById('topup-amount');
  const amountBaht = Number(amountEl?.value);

  if (!Number.isInteger(amountBaht) || amountBaht < 1 || amountBaht > 100000) {
    window.showToast('กรุณากรอกจำนวนเงิน 1-100,000 บาทให้ถูกต้อง', 'error');
    amountEl?.focus();
    return;
  }

  if (!currentSelectedSlipFile) {
    window.showToast('กรุณาเลือกรูปสลิปการโอนเงินก่อนครับ 📸', 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⟳</span> กำลังตรวจสอบสลิปผ่าน Slip2Go...';
  }

  if (msgEl) msgEl.textContent = '';

  try {
    const orderRes = await axios.post(`${API_BASE_URL}/topup/orders/create`, {
      amountBaht
    }, {
      headers: getAuthHeaders()
    });

    if (!orderRes.data || !orderRes.data.orderId) {
      throw new Error('ไม่สามารถสร้างคำสั่งซื้อจากเซิร์ฟเวอร์ได้');
    }

    const orderId = orderRes.data.orderId;

    // 2. Submit the slip image to the backend Slip2Go verification endpoint.
    const formData = new FormData();
    formData.append('image', currentSelectedSlipFile);
    formData.append('orderId', orderId);
    formData.append('amountBaht', String(amountBaht));

    const verifyRes = await axios.post(`${API_BASE_URL}/topup/verify-slip`, formData, {
      headers: {
        ...getAuthHeaders()
      }
    });

    if (verifyRes.data && verifyRes.data.status === 'approved') {
      currentUser.diamonds = verifyRes.data.diamonds || ((currentUser.diamonds || 0) + (orderRes.data.creditToReceive || 100));
      safeStorageSet('user', JSON.stringify(currentUser));

      window.removeSlip();
      if (amountEl) amountEl.value = '';
      initDashboard(true);
      if (msgEl) {
        msgEl.textContent = verifyRes.data.message || 'เติมเงินสำเร็จ';
        msgEl.style.color = 'var(--accent)';
      }
      window.showToast(verifyRes.data.message || '🎉 เติมเงินสำเร็จผ่าน Slip2Go!', 'success');
    } else {
      const message = verifyRes.data?.error || 'สลิปไม่ผ่านเงื่อนไขความปลอดภัย';
      if (msgEl) msgEl.textContent = message;
      window.showToast(`❌ เติมเงินไม่สำเร็จ: ${message}`, 'error');
    }
  } catch (err) {
    console.error('Slip Verification error:', err.message);
    const errMessage = err.response?.data?.error || err.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ตรวจสอบสลิป';
    if (msgEl) msgEl.textContent = errMessage;
    window.showToast(`❌ เติมเงินไม่สำเร็จ: ${errMessage}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-icon">📤</span> ส่งสลิปตรวจสอบ';
    }
  }
};

let farmHistoryEvents = [];
let farmHistoryPeriod = 'daily';
let farmHistoryTimer = null;
let farmDateListenerReady = false;
let farmBotTypeFilter = 'all';
let farmDeviceFilter = 'all';

function farmDeviceLabel(deviceId) {
  const match = /(\d{1,2})\s*$/.exec(String(deviceId || '').trim());
  return match ? `หมายเลข ${match[1].padStart(2, '0')}` : (deviceId ? escapeHtml(deviceId) : 'ไม่ระบุ');
}
let usageHistoryItems = [];
let usageHistoryFilter = 'all';

function thailandDateKey(value = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(value));
}

function thaiDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(date);
}

function numberText(value) {
  return new Intl.NumberFormat('th-TH').format(Number(value) || 0);
}

function durationText(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  if (hours) return `${hours} ชม. ${minutes} นาที`;
  if (minutes) return `${minutes} นาที ${remainingSeconds} วินาที`;
  return `${remainingSeconds} วินาที`;
}

function codeDurationText(minutesValue) {
  const minutes = Math.max(0, Number(minutesValue) || 0);
  if (minutes % 1440 === 0) return `${minutes / 1440} วัน`;
  if (minutes % 60 === 0) return `${minutes / 60} ชั่วโมง`;
  return `${minutes} นาที`;
}

function farmEventsForSelection() {
  const dateInput = document.getElementById('farm-history-date');
  const selected = dateInput?.value || thailandDateKey();
  const matches = (event) => (
    (farmBotTypeFilter === 'all' || event.botType === farmBotTypeFilter)
    && (farmDeviceFilter === 'all' || event.deviceId === farmDeviceFilter)
  );

  if (farmHistoryPeriod === 'daily') {
    return farmHistoryEvents.filter((event) => matches(event) && thailandDateKey(event.occurredAt) === selected);
  }
  if (farmHistoryPeriod === 'monthly') {
    return farmHistoryEvents.filter((event) => matches(event) && thailandDateKey(event.occurredAt).slice(0, 7) === selected.slice(0, 7));
  }

  const selectedDate = new Date(`${selected}T12:00:00+07:00`);
  const weekday = selectedDate.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(selectedDate.getTime() + mondayOffset * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  const startKey = thailandDateKey(monday);
  const endKey = thailandDateKey(sunday);
  return farmHistoryEvents.filter((event) => {
    const key = thailandDateKey(event.occurredAt);
    return matches(event) && key >= startKey && key <= endKey;
  });
}

window.setFarmBotType = function(type) {
  if (!['all', 'coin', 'powder'].includes(type)) return;
  farmBotTypeFilter = type;
  document.querySelectorAll('.farm-bottype-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.farmBottype === type);
  });
  renderFarmHistory();
};

window.setFarmDevice = function(deviceId) {
  farmDeviceFilter = farmDeviceFilter === deviceId ? 'all' : deviceId;
  renderFarmHistory();
};

function renderFarmDeviceChips() {
  const container = document.getElementById('farm-device-chips');
  if (!container) return;
  const deviceIds = [...new Set(farmHistoryEvents.map((event) => event.deviceId).filter(Boolean))].sort();
  container.innerHTML = deviceIds.map((deviceId) => {
    const rounds = farmHistoryEvents.filter((event) => event.deviceId === deviceId).length;
    const active = farmDeviceFilter === deviceId;
    return `<button type="button" class="farm-device-chip${active ? ' active' : ''}" onclick="setFarmDevice('${deviceId.replace(/'/g, "\\'")}')">
      <span>${farmDeviceLabel(deviceId)}</span>
      <strong>${numberText(rounds)} รอบ</strong>
    </button>`;
  }).join('');
}

function farmHistoryColumns() {
  const id = { key: 'id', label: 'หมายเลขไอดี' };
  const bot = { key: 'bot', label: 'บอท' };
  const time = { key: 'time', label: 'เวลา' };
  const round = { key: 'round', label: 'รอบที่' };
  const duration = { key: 'roundDuration', label: 'ระยะเวลารอบ' };
  const version = { key: 'version', label: 'เวอร์ชัน' };
  const status = { key: 'status', label: 'สถานะ' };
  if (farmBotTypeFilter === 'coin') {
    return [id, time, { key: 'coins', label: 'เหรียญที่ได้รับ' }, { key: 'exp', label: 'EXP ที่ได้รับ' }, round, duration, version, status];
  }
  if (farmBotTypeFilter === 'powder') {
    return [id, time, { key: 'powder', label: 'ได้รับผงจากการย่อย' }, round, duration, version, status];
  }
  return [id, bot, time, { key: 'coins', label: 'เหรียญที่ได้รับ' }, { key: 'exp', label: 'EXP ที่ได้รับ' }, { key: 'powder', label: 'ได้รับผงจากการย่อย' }, round, duration, version, status];
}

function farmHistoryClockTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(date);
}

function farmHistoryCell(key, event, roundNumber) {
  switch (key) {
    case 'id': return farmDeviceLabel(event.deviceId);
    case 'bot': return event.botType === 'coin' ? 'บอทเหรียญ' : 'บอทย่อยผง';
    case 'time': return escapeHtml(farmHistoryClockTime(event.occurredAt));
    case 'coins': return `<strong class="farm-value-coins">🪙 ${numberText(event.coins)}</strong>`;
    case 'exp': return `<strong class="farm-value-exp">EXP ${numberText(event.exp)}</strong>`;
    case 'powder': return `<strong class="farm-value-powder">🧪 ${numberText(event.powder)}</strong>`;
    case 'round': return numberText(roundNumber);
    case 'roundDuration': return formatRoundDurationCell(event.roundDurationSeconds);
    case 'version': return `<span class="farm-table-version">${escapeHtml(event.botVersion || '-')}</span>`;
    case 'status': return '<span class="farm-complete-badge"><i></i> เสร็จสิ้น</span>';
    default: return '';
  }
}

// The bot has never sent a real per-round duration (always 0), but every
// event already carries a real occurredAt timestamp. A round's duration is
// well approximated by the gap since the previous round finished on the
// *same device running the same bot type* -- so we derive it here instead
// of waiting on a bot-side fix. A gap over ROUND_GAP_CAP_SECONDS (10 min)
// means the bot was actually paused/stopped between those two rounds, not
// that the round itself took that long, so it's excluded and flagged
// rather than silently inflating the total.
const ROUND_GAP_CAP_SECONDS = 10 * 60;

function computeRoundDurations(events) {
  const byDeviceAndType = new Map();
  for (const event of events) {
    const key = `${event.deviceId || ''}::${event.botType || ''}`;
    if (!byDeviceAndType.has(key)) byDeviceAndType.set(key, []);
    byDeviceAndType.get(key).push(event);
  }
  for (const group of byDeviceAndType.values()) {
    group.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    group.forEach((event, index) => {
      if (index === 0) {
        event.roundDurationSeconds = 'first';
        return;
      }
      const gapSeconds = Math.round((Date.parse(event.occurredAt) - Date.parse(group[index - 1].occurredAt)) / 1000);
      event.roundDurationSeconds = gapSeconds > ROUND_GAP_CAP_SECONDS || gapSeconds < 0 ? 'gap' : gapSeconds;
    });
  }
}

function formatRoundDurationCell(value) {
  if (value === 'gap') return '<span class="farm-round-duration farm-round-duration--gap">⏸ หยุดพัก (เกิน 10 นาที)</span>';
  if (value === 'first' || typeof value !== 'number') return '<span class="farm-round-duration farm-round-duration--na">-</span>';
  return `<span class="farm-round-duration">${escapeHtml(durationText(value))}</span>`;
}

function farmDailyRoundNumbers(events) {
  // Round numbers reset every midnight (Bangkok time) instead of using the
  // bot's own session counter, which restarts at 1 on every bot launch and
  // otherwise shows confusing duplicate round numbers side by side when
  // multiple sessions/days are listed together.
  const byDay = new Map();
  for (const event of events) {
    const dayKey = thailandDateKey(event.occurredAt);
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(event);
  }
  const numbers = new Map();
  for (const dayEvents of byDay.values()) {
    dayEvents
      .slice()
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
      .forEach((event, index) => numbers.set(event, index + 1));
  }
  return numbers;
}

function renderFarmHistory() {
  const rows = document.getElementById('farm-history-rows');
  const head = document.getElementById('farm-history-head');
  if (!rows) return;
  const events = farmEventsForSelection();
  const coins = events.reduce((sum, event) => sum + (Number(event.coins) || 0), 0);
  const exp = events.reduce((sum, event) => sum + (Number(event.exp) || 0), 0);
  const powder = events.reduce((sum, event) => sum + (Number(event.powder) || 0), 0);
  const seconds = events.reduce((sum, event) => sum + (typeof event.roundDurationSeconds === 'number' ? event.roundDurationSeconds : 0), 0);
  const versions = [...new Set(events.map((event) => event.botVersion).filter(Boolean))];
  const periodLabels = { daily: 'รายวัน', weekly: 'รายสัปดาห์', monthly: 'รายเดือน' };

  document.getElementById('farm-total-coins').textContent = numberText(coins);
  document.getElementById('farm-total-exp').textContent = numberText(exp);
  document.getElementById('farm-total-powder').textContent = numberText(powder);
  document.getElementById('farm-total-rounds').textContent = numberText(events.length);
  document.getElementById('farm-total-time').textContent = durationText(seconds);
  document.getElementById('farm-details-title').textContent = `รายละเอียดการฟาร์ม (${periodLabels[farmHistoryPeriod]})`;
  document.getElementById('farm-bot-version').textContent = `เวอร์ชัน: ${versions.join(', ') || '-'}`;

  document.getElementById('farm-summary-coins')?.classList.toggle('hidden', farmBotTypeFilter === 'powder');
  document.getElementById('farm-summary-exp')?.classList.toggle('hidden', farmBotTypeFilter === 'powder');
  document.getElementById('farm-summary-powder')?.classList.toggle('hidden', farmBotTypeFilter === 'coin');
  renderFarmDeviceChips();

  const columns = farmHistoryColumns();
  if (head) head.innerHTML = `<tr>${columns.map((c) => `<th>${c.label}</th>`).join('')}</tr>`;

  if (!events.length) {
    rows.innerHTML = `<tr><td colspan="${columns.length}" class="farm-empty-cell"><span>💤</span> ยังไม่มีข้อมูลการฟาร์มในช่วงเวลานี้</td></tr>`;
    return;
  }

  const roundNumbers = farmDailyRoundNumbers(events);
  rows.innerHTML = events.map((event) => {
    return `<tr>${columns.map((c) => `<td data-label="${c.label}">${farmHistoryCell(c.key, event, roundNumbers.get(event))}</td>`).join('')}</tr>`;
  }).join('');
}

async function loadFarmHistory() {
  const refreshEl = document.getElementById('farm-history-refresh');
  if (refreshEl) refreshEl.textContent = 'กำลังอัปเดต...';
  try {
    const response = await axios.get(`${API_BASE_URL}/users/farm-history`, { headers: getAuthHeaders() });
    farmHistoryEvents = Array.isArray(response.data?.events) ? response.data.events : [];
    computeRoundDurations(farmHistoryEvents);
    renderFarmHistory();
    if (refreshEl) refreshEl.textContent = `อัปเดตล่าสุด ${new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
  } catch (error) {
    const rows = document.getElementById('farm-history-rows');
    if (rows) rows.innerHTML = `<tr><td colspan="${farmHistoryColumns().length}" class="farm-empty-cell farm-load-error">${escapeHtml(getApiErrorMessage(error, 'โหลดประวัติการฟาร์มไม่สำเร็จ'))}</td></tr>`;
    if (refreshEl) refreshEl.textContent = 'ลองใหม่ใน 1 นาที';
  }
}

window.setFarmHistoryPeriod = function(period) {
  if (!['daily', 'weekly', 'monthly'].includes(period)) return;
  farmHistoryPeriod = period;
  document.querySelectorAll('.farm-period-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.farmPeriod === period);
  });
  renderFarmHistory();
};

function startFarmHistoryUpdates() {
  const dateInput = document.getElementById('farm-history-date');
  if (dateInput && !dateInput.value) dateInput.value = thailandDateKey();
  if (dateInput && !farmDateListenerReady) {
    dateInput.addEventListener('change', renderFarmHistory);
    farmDateListenerReady = true;
  }
  stopFarmHistoryUpdates();
  loadFarmHistory();
  farmHistoryTimer = setInterval(() => {
    if (document.getElementById('section-farm-history')?.classList.contains('active')) loadFarmHistory();
  }, 60_000);
}

function stopFarmHistoryUpdates() {
  if (farmHistoryTimer) clearInterval(farmHistoryTimer);
  farmHistoryTimer = null;
}

function renderUsageHistoryItems() {
  const listEl = document.getElementById('activity-list');
  if (!listEl) return;
  const items = usageHistoryFilter === 'all'
    ? usageHistoryItems
    : usageHistoryItems.filter((item) => item.type === usageHistoryFilter);

  if (!items.length) {
    listEl.innerHTML = `
      <div class="usage-empty-state card-panel">
        <span>📋</span>
        <h3>ยังไม่มีประวัติการใช้งาน</h3>
        <p>รายการเติมเงินและการใช้โค้ดของบัญชีนี้จะแสดงที่นี่</p>
      </div>`;
    return;
  }

  listEl.innerHTML = items.map((item) => {
    const isTopup = item.type === 'topup';
    const approved = item.status === 'approved';
    const details = isTopup
      ? `
        <span><b>ยอดเงิน</b>${numberText(item.amount)} บาท</span>
        <span><b>เครดิตที่ได้รับ</b>${numberText(item.credits)}</span>
        <span><b>เลขอ้างอิง</b>${escapeHtml(item.reference || '-')}</span>
        <span><b>เสร็จสิ้นเมื่อ</b>${escapeHtml(thaiDateTime(item.completedAt || item.createdAt))}</span>`
      : `
        <span><b>โค้ด</b><code>${escapeHtml(item.code || '-')}</code></span>
        <span><b>ระยะเวลาที่ได้รับ</b>${escapeHtml(codeDurationText(item.durationMinutes))}</span>
        <span><b>แหล่งที่มา</b>${item.source === 'line-slip' ? 'ตรวจสลิปผ่าน LINE' : 'โค้ดจากผู้ดูแล'}</span>
        <span><b>วันหมดอายุหลังใช้โค้ด</b>${escapeHtml(thaiDateTime(item.expiresAt))}</span>`;
    return `
      <article class="usage-history-card card-panel usage-history-card--${item.type}">
        <div class="usage-history-icon">${isTopup ? '💰' : '🔑'}</div>
        <div class="usage-history-content">
          <div class="usage-history-card-head">
            <div><span>${isTopup ? 'TOP UP' : 'ACCESS CODE'}</span><h3>${escapeHtml(item.title)}</h3></div>
            <time>${escapeHtml(thaiDateTime(item.createdAt))}</time>
          </div>
          <div class="usage-history-details">${details}</div>
        </div>
        <span class="usage-status ${approved ? 'is-success' : item.status === 'pending' ? 'is-pending' : 'is-failed'}">
          ${approved ? '● สำเร็จ' : item.status === 'pending' ? '● รอตรวจสอบ' : '● ไม่สำเร็จ'}
        </span>
      </article>`;
  }).join('');
}

window.setUsageHistoryFilter = function(filter) {
  if (!['all', 'topup', 'code'].includes(filter)) return;
  usageHistoryFilter = filter;
  document.querySelectorAll('.usage-filter').forEach((button) => {
    button.classList.toggle('active', button.dataset.usageFilter === filter);
  });
  renderUsageHistoryItems();
};

async function renderActivityHistory() {
  const listEl = document.getElementById('activity-list');
  if (!listEl || !currentUser) return;
  listEl.innerHTML = '<div class="usage-loading card-panel"><span>⟳</span> กำลังโหลดประวัติการใช้งาน...</div>';
  try {
    const response = await axios.get(`${API_BASE_URL}/users/activity`, { headers: getAuthHeaders() });
    usageHistoryItems = Array.isArray(response.data?.items) ? response.data.items : [];
    renderUsageHistoryItems();
  } catch (error) {
    listEl.innerHTML = `<div class="usage-empty-state card-panel is-error"><span>!</span><h3>โหลดข้อมูลไม่สำเร็จ</h3><p>${escapeHtml(getApiErrorMessage(error, 'กรุณาลองใหม่อีกครั้ง'))}</p></div>`;
  }
}

// 8. ADMIN PANEL AND USER MANAGEMENT
let adminUsers = [];
let adminTopups = [];
let adminAccessCodes = [];
let latestGeneratedAccessCodes = [];

function adminApiConfig() {
  const token = safeStorageGet('token');
  return { headers: { Authorization: `Bearer ${token}` } };
}

async function reloadAdminUsersData() {
  if (currentUser?.role !== 'admin') return;
  const response = await axios.get(`${API_BASE_URL}/admin/users?limit=500`, adminApiConfig());
  adminUsers = response.data?.users || [];
}

async function reloadAdminTopupsData() {
  if (currentUser?.role !== 'admin') return;
  const response = await axios.get(`${API_BASE_URL}/admin/topups?limit=500`, adminApiConfig());
  adminTopups = response.data?.topups || [];
}

async function reloadAdminData() {
  const results = await Promise.allSettled([reloadAdminUsersData(), reloadAdminTopupsData()]);
  if (results.every((result) => result.status === 'rejected')) throw results[0].reason;
  return results;
}

window.switchAdminTab = function(tabName) {
  document.querySelectorAll('.admin-panel-content').forEach(p => {
    p.classList.remove('active');
    p.classList.add('hidden');
  });
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));

  const activePanel = document.getElementById(`admin-${tabName}`);
  if (activePanel) {
    activePanel.classList.remove('hidden');
    activePanel.classList.add('active');
  }

  const activeTabBtn = document.querySelector(`.admin-tab[onclick*="${tabName}"]`);
  if (activeTabBtn) activeTabBtn.classList.add('active');

  if (tabName === 'stats') updateAdminPanelStats();
  if (tabName === 'users') reloadAdminUsersData().then(renderAdminUsersTable).catch((error) => {
    window.showToast(getApiErrorMessage(error, 'โหลดรายชื่อสมาชิกไม่สำเร็จ'), 'error');
  });
  if (tabName === 'topups') reloadAdminTopupsData().then(renderAdminTopupsTable).catch((error) => {
    window.showToast(getApiErrorMessage(error, 'โหลดประวัติเติมเงินไม่สำเร็จ'), 'error');
  });
  if (tabName === 'codes') loadAdminAccessCodes().catch(() => {});
  if (tabName === 'system') {
    loadSystemSettings(true).catch((error) => {
      window.showToast(getApiErrorMessage(error, 'โหลดการตั้งค่าจริงไม่สำเร็จ'), 'error');
    });
  }
};

function accessCodeDurationLabel(minutes) {
  const value = Number(minutes);
  if (!Number.isInteger(value) || value < 60) return '-';
  const days = Math.floor(value / 1440);
  const hours = Math.floor((value % 1440) / 60);
  if (days && hours) return `${days} วัน ${hours} ชั่วโมง`;
  if (days) return `${days} วัน`;
  return `${hours} ชั่วโมง`;
}

function accessCodeStatusLabel(status) {
  if (status === 'used') return 'ใช้แล้ว';
  if (status === 'processing') return 'กำลังเพิ่มวัน';
  return 'พร้อมใช้งาน';
}

function renderAdminAccessCodes() {
  const container = document.getElementById('admin-codes-table');
  if (!container) return;
  if (!adminAccessCodes.length) {
    container.innerHTML = '<p style="padding:16px; color:var(--text-muted);">ยังไม่มีโค้ดในระบบ</p>';
    return;
  }
  container.innerHTML = `
    <table class="admin-table" style="width:100%; border-collapse:collapse; min-width:760px;">
      <thead><tr>
        <th style="padding:12px; text-align:left;">โค้ด</th>
        <th style="padding:12px; text-align:left;">ระยะเวลา</th>
        <th style="padding:12px; text-align:left;">สถานะ</th>
        <th style="padding:12px; text-align:left;">สมาชิก</th>
        <th style="padding:12px; text-align:left;">สร้างเมื่อ</th>
      </tr></thead>
      <tbody>${adminAccessCodes.map((item) => `
        <tr style="border-top:1px solid var(--border);">
          <td style="padding:12px; font-family:monospace; color:var(--primary);">${escapeHtml(item.code)}</td>
          <td style="padding:12px;">${escapeHtml(accessCodeDurationLabel(item.durationMinutes))}</td>
          <td style="padding:12px;"><span class="code-status ${escapeHtml(item.status || 'available')}">${escapeHtml(accessCodeStatusLabel(item.status))}</span></td>
          <td style="padding:12px;">
            <strong>${escapeHtml(item.memberName || item.memberUsername || (item.memberCode ? 'ไม่พบชื่อสมาชิก' : '-'))}</strong>
            ${item.memberCode ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">${escapeHtml(item.memberCode)}</div>` : ''}
            ${!item.memberCode && item.source === 'line-slip' ? '<div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">ส่งให้ลูกค้าทาง LINE แล้ว แต่ยังไม่มีผู้ใช้โค้ด</div>' : ''}
          </td>
          <td style="padding:12px;">${escapeHtml(item.createdAt ? new Date(item.createdAt).toLocaleString('th-TH') : '-')}</td>
        </tr>
      `).join('')}</tbody>
    </table>`;
}

window.loadAdminAccessCodes = async function() {
  const container = document.getElementById('admin-codes-table');
  if (container) container.innerHTML = '<div class="loading-spinner">⟳</div>';
  try {
    const response = await axios.get(`${API_BASE_URL}/admin/codes`, adminApiConfig());
    adminAccessCodes = response.data?.codes || [];
    renderAdminAccessCodes();
    if (response.data?.warning && container) {
      container.insertAdjacentHTML('afterbegin', `<p style="padding:12px; color:#ffd36a;">${escapeHtml(response.data.warning)}</p>`);
    }
  } catch (error) {
    const text = getApiErrorMessage(error, 'โหลดข้อมูลโค้ดไม่สำเร็จ');
    if (container) container.innerHTML = `<p style="padding:16px; color:var(--danger);">${escapeHtml(text)}</p>`;
    window.showToast(text, 'error');
  }
};

window.createAdminAccessCodes = async function() {
  const count = Number(document.getElementById('admin-code-count')?.value);
  const days = Number(document.getElementById('admin-code-days')?.value);
  const hours = Number(document.getElementById('admin-code-hours')?.value);
  const durationMinutes = (days * 1440) + (hours * 60);
  const button = document.getElementById('admin-code-create');
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    window.showToast('กรุณาเลือกจำนวนโค้ด 1–500 โค้ด', 'error');
    return;
  }
  if (!Number.isInteger(days) || days < 0 || days > 365
    || !Number.isInteger(hours) || hours < 0 || hours > 23
    || durationMinutes < 60 || durationMinutes > 525600) {
    window.showToast('กรุณากำหนดเวลาอย่างน้อย 1 ชั่วโมง และรวมไม่เกิน 365 วัน', 'error');
    return;
  }
  if (button) {
    button.disabled = true;
    button.textContent = 'กำลังสร้าง...';
  }
  try {
    const response = await axios.post(`${API_BASE_URL}/admin/codes`, {
      count,
      durationMinutes
    }, adminApiConfig());
    latestGeneratedAccessCodes = response.data?.codes || [];
    const output = document.getElementById('admin-generated-codes');
    if (output) {
      output.classList.remove('hidden');
      output.innerHTML = `<button class="btn-secondary" type="button" onclick="copyGeneratedAccessCodes()" style="margin-bottom:10px;">📋 คัดลอกทั้งหมด</button>\n${escapeHtml(latestGeneratedAccessCodes.join('\n'))}`;
    }
    window.showToast(response.data?.message || 'สร้างโค้ดเรียบร้อยแล้ว', 'success');
    await window.loadAdminAccessCodes();
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'สร้างโค้ดไม่สำเร็จ'), 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'สร้างโค้ด';
    }
  }
};

window.copyGeneratedAccessCodes = async function() {
  if (!latestGeneratedAccessCodes.length) return;
  try {
    await navigator.clipboard.writeText(latestGeneratedAccessCodes.join('\n'));
    window.showToast('คัดลอกโค้ดทั้งหมดแล้ว', 'success');
  } catch {
    window.showToast('คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกเอง', 'error');
  }
};

async function initAdminPanel() {
  await Promise.all([
    reloadAdminData(),
    loadSystemSettings(true)
  ]).catch(() => {});
  await updateAdminPanelStats().catch(() => {});
  renderAdminUsersTable();
  renderAdminTopupsTable();
  applySystemSettingsToUI();
}

// ── Admin: player farm data (list of every member + per-member detail) ──
let adminFarmDataList = [];
let adminFarmDetailEvents = [];
let adminFarmPeriod = 'daily';
let adminFarmBotTypeFilter = 'all';
let adminFarmDeviceFilter = 'all';
let adminFarmCurrentMember = null;

async function loadPlayerFarmDataList() {
  document.getElementById('admin-farm-list-view')?.classList.remove('hidden');
  document.getElementById('admin-farm-detail-view')?.classList.add('hidden');
  const container = document.getElementById('admin-farm-table-container');
  if (container) container.innerHTML = '<div class="loading-spinner">⟳</div>';
  try {
    const response = await axios.get(`${API_BASE_URL}/admin/farm-data`, adminApiConfig());
    adminFarmDataList = response.data?.members || [];
    window.renderAdminFarmDataTable();
  } catch (error) {
    const text = getApiErrorMessage(error, 'โหลดข้อมูลการฟาร์มผู้เล่นไม่สำเร็จ');
    if (container) container.innerHTML = `<p style="padding:16px; color:var(--danger);">${escapeHtml(text)}</p>`;
    window.showToast(text, 'error');
  }
}

window.renderAdminFarmDataTable = function() {
  const container = document.getElementById('admin-farm-table-container');
  if (!container) return;
  const searchVal = (document.getElementById('admin-farm-search')?.value || '').toLowerCase();
  const [sortKey, sortDir] = (document.getElementById('admin-farm-sort')?.value || 'lastActive-desc').split('-');
  const sortField = { lastActive: 'lastActiveAt', joined: 'joinedAt', duration: 'durationSeconds' }[sortKey] || 'lastActiveAt';

  const filtered = adminFarmDataList.filter((item) =>
    String(item.username || '').toLowerCase().includes(searchVal)
    || String(item.memberCode || '').toLowerCase().includes(searchVal)
  );

  filtered.sort((left, right) => {
    const leftValue = sortField === 'durationSeconds' ? Number(left[sortField] || 0) : Date.parse(left[sortField] || '') || 0;
    const rightValue = sortField === 'durationSeconds' ? Number(right[sortField] || 0) : Date.parse(right[sortField] || '') || 0;
    return sortDir === 'asc' ? leftValue - rightValue : rightValue - leftValue;
  });

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state" style="text-align:center; padding:30px;">
        <div style="font-size:2rem;">📊</div>
        <p style="color:var(--text-muted); margin-top:6px;">${adminFarmDataList.length ? 'ไม่พบสมาชิกที่ตรงกับคำค้นหา' : 'ยังไม่มีสมาชิกที่ใช้งานบอท'}</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <table class="admin-table" style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--border-bright); text-align:left; color:var(--primary);">
          <th style="padding:10px;">ชื่อผู้ใช้</th>
          <th style="padding:10px;">หมายเลขไอดี</th>
          <th style="padding:10px;">วันที่สมัคร</th>
          <th style="padding:10px;">ใช้งานล่าสุด</th>
          <th style="padding:10px;">จำนวนรอบ</th>
          <th style="padding:10px;">เหรียญรวม</th>
          <th style="padding:10px;">EXP รวม</th>
          <th style="padding:10px;">เวลาที่ใช้บอท</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map((item) => `
          <tr class="admin-farm-row" onclick="openAdminFarmDetail('${encodeURIComponent(item.memberCode)}', '${encodeURIComponent(item.username)}')">
            <td style="padding:12px; font-weight:700;">${escapeHtml(item.username)}</td>
            <td style="padding:12px; font-size:0.85rem; color:var(--text-muted);">${escapeHtml(item.memberCode)}</td>
            <td style="padding:12px; font-size:0.85rem;">${item.joinedAt ? escapeHtml(thaiDateTime(item.joinedAt)) : '-'}</td>
            <td style="padding:12px; font-size:0.85rem;">${item.lastActiveAt ? escapeHtml(thaiDateTime(item.lastActiveAt)) : '-'}</td>
            <td style="padding:12px;">${numberText(item.rounds)}</td>
            <td style="padding:12px; color:var(--accent); font-weight:700;">🪙 ${numberText(item.totalCoins)}</td>
            <td style="padding:12px; color:#c79aff; font-weight:700;">⭐ ${numberText(item.totalExp)}</td>
            <td style="padding:12px;">${durationText(item.durationSeconds)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
};

window.openAdminFarmDetail = async function(memberCode, username) {
  memberCode = decodeURIComponent(memberCode);
  username = decodeURIComponent(username);
  adminFarmCurrentMember = { memberCode, username };
  adminFarmPeriod = 'daily';
  adminFarmBotTypeFilter = 'all';
  adminFarmDeviceFilter = 'all';
  document.querySelectorAll('#admin-farm-detail-view .farm-period-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.farmPeriod === 'daily');
  });
  document.querySelectorAll('#admin-farm-detail-view .farm-bottype-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.farmBottype === 'all');
  });
  document.getElementById('admin-farm-detail-username').textContent = username;
  document.getElementById('admin-farm-detail-code').textContent = memberCode;
  const dateInput = document.getElementById('admin-farm-detail-date');
  if (dateInput) dateInput.value = thailandDateKey();

  document.getElementById('admin-farm-list-view')?.classList.add('hidden');
  document.getElementById('admin-farm-detail-view')?.classList.remove('hidden');

  const rows = document.getElementById('admin-farm-history-rows');
  if (rows) rows.innerHTML = '<tr><td colspan="10" class="farm-empty-cell">กำลังโหลดข้อมูล...</td></tr>';
  try {
    const response = await axios.get(
      `${API_BASE_URL}/admin/farm-data/${encodeURIComponent(memberCode)}`,
      adminApiConfig()
    );
    adminFarmDetailEvents = Array.isArray(response.data?.events) ? response.data.events : [];
    computeRoundDurations(adminFarmDetailEvents);
    renderAdminFarmDetail();
    if (!dateInput?.dataset.adminFarmListenerReady) {
      dateInput?.addEventListener('change', renderAdminFarmDetail);
      if (dateInput) dateInput.dataset.adminFarmListenerReady = 'true';
    }
  } catch (error) {
    if (rows) rows.innerHTML = `<tr><td colspan="10" class="farm-empty-cell farm-load-error">${escapeHtml(getApiErrorMessage(error, 'โหลดประวัติการฟาร์มของสมาชิกไม่สำเร็จ'))}</td></tr>`;
  }
};

window.closeAdminFarmDetail = function() {
  adminFarmCurrentMember = null;
  document.getElementById('admin-farm-detail-view')?.classList.add('hidden');
  document.getElementById('admin-farm-list-view')?.classList.remove('hidden');
};

window.setAdminFarmBotType = function(type) {
  if (!['all', 'coin', 'powder'].includes(type)) return;
  adminFarmBotTypeFilter = type;
  document.querySelectorAll('#admin-farm-detail-view .farm-bottype-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.farmBottype === type);
  });
  renderAdminFarmDetail();
};

window.setAdminFarmPeriod = function(period) {
  if (!['daily', 'weekly', 'monthly'].includes(period)) return;
  adminFarmPeriod = period;
  document.querySelectorAll('#admin-farm-detail-view .farm-period-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.farmPeriod === period);
  });
  renderAdminFarmDetail();
};

function adminFarmEventsForSelection() {
  const dateInput = document.getElementById('admin-farm-detail-date');
  const selected = dateInput?.value || thailandDateKey();
  const matches = (event) => (
    (adminFarmBotTypeFilter === 'all' || event.botType === adminFarmBotTypeFilter)
    && (adminFarmDeviceFilter === 'all' || event.deviceId === adminFarmDeviceFilter)
  );

  if (adminFarmPeriod === 'daily') {
    return adminFarmDetailEvents.filter((event) => matches(event) && thailandDateKey(event.occurredAt) === selected);
  }
  if (adminFarmPeriod === 'monthly') {
    return adminFarmDetailEvents.filter((event) => matches(event) && thailandDateKey(event.occurredAt).slice(0, 7) === selected.slice(0, 7));
  }

  const selectedDate = new Date(`${selected}T12:00:00+07:00`);
  const weekday = selectedDate.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(selectedDate.getTime() + mondayOffset * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  const startKey = thailandDateKey(monday);
  const endKey = thailandDateKey(sunday);
  return adminFarmDetailEvents.filter((event) => {
    const key = thailandDateKey(event.occurredAt);
    return matches(event) && key >= startKey && key <= endKey;
  });
}

function adminFarmHistoryColumns() {
  const id = { key: 'id', label: 'หมายเลขไอดี' };
  const bot = { key: 'bot', label: 'บอท' };
  const time = { key: 'time', label: 'เวลา' };
  const round = { key: 'round', label: 'รอบที่' };
  const duration = { key: 'roundDuration', label: 'ระยะเวลารอบ' };
  const version = { key: 'version', label: 'เวอร์ชัน' };
  const status = { key: 'status', label: 'สถานะ' };
  if (adminFarmBotTypeFilter === 'coin') {
    return [id, time, { key: 'coins', label: 'เหรียญที่ได้รับ' }, { key: 'exp', label: 'EXP ที่ได้รับ' }, round, duration, version, status];
  }
  if (adminFarmBotTypeFilter === 'powder') {
    return [id, time, { key: 'powder', label: 'ได้รับผงจากการย่อย' }, round, duration, version, status];
  }
  return [id, bot, time, { key: 'coins', label: 'เหรียญที่ได้รับ' }, { key: 'exp', label: 'EXP ที่ได้รับ' }, { key: 'powder', label: 'ได้รับผงจากการย่อย' }, round, duration, version, status];
}

function renderAdminFarmDetail() {
  const rows = document.getElementById('admin-farm-history-rows');
  const head = document.getElementById('admin-farm-history-head');
  if (!rows || !adminFarmCurrentMember) return;
  const events = adminFarmEventsForSelection();
  const coins = events.reduce((sum, event) => sum + (Number(event.coins) || 0), 0);
  const exp = events.reduce((sum, event) => sum + (Number(event.exp) || 0), 0);
  const powder = events.reduce((sum, event) => sum + (Number(event.powder) || 0), 0);
  const seconds = events.reduce((sum, event) => sum + (typeof event.roundDurationSeconds === 'number' ? event.roundDurationSeconds : 0), 0);
  const versions = [...new Set(events.map((event) => event.botVersion).filter(Boolean))];
  const periodLabels = { daily: 'รายวัน', weekly: 'รายสัปดาห์', monthly: 'รายเดือน' };

  document.getElementById('admin-farm-total-coins').textContent = numberText(coins);
  document.getElementById('admin-farm-total-exp').textContent = numberText(exp);
  document.getElementById('admin-farm-total-powder').textContent = numberText(powder);
  document.getElementById('admin-farm-total-rounds').textContent = numberText(events.length);
  document.getElementById('admin-farm-total-time').textContent = durationText(seconds);
  document.getElementById('admin-farm-details-title').textContent = `รายละเอียดการฟาร์ม (${periodLabels[adminFarmPeriod]})`;
  document.getElementById('admin-farm-bot-version').textContent = `เวอร์ชัน: ${versions.join(', ') || '-'}`;

  document.getElementById('admin-farm-summary-coins')?.classList.toggle('hidden', adminFarmBotTypeFilter === 'powder');
  document.getElementById('admin-farm-summary-exp')?.classList.toggle('hidden', adminFarmBotTypeFilter === 'powder');
  document.getElementById('admin-farm-summary-powder')?.classList.toggle('hidden', adminFarmBotTypeFilter === 'coin');

  const columns = adminFarmHistoryColumns();
  if (head) head.innerHTML = `<tr>${columns.map((c) => `<th>${c.label}</th>`).join('')}</tr>`;

  if (!events.length) {
    rows.innerHTML = `<tr><td colspan="${columns.length}" class="farm-empty-cell"><span>💤</span> ยังไม่มีข้อมูลการฟาร์มในช่วงเวลานี้</td></tr>`;
    return;
  }

  const roundNumbers = farmDailyRoundNumbers(events);
  rows.innerHTML = events.map((event) => {
    return `<tr>${columns.map((c) => `<td data-label="${c.label}">${farmHistoryCell(c.key, event, roundNumbers.get(event))}</td>`).join('')}</tr>`;
  }).join('');
}

async function updateAdminPanelStats() {
  const totalUsersEl = document.getElementById('stat-total-users');
  const activeUsersEl = document.getElementById('stat-active-users');
  const pendingTopupsEl = document.getElementById('stat-pending-topups');
  const revenueEl = document.getElementById('stat-today-revenue');

  let stats;
  try {
    stats = (await axios.get(`${API_BASE_URL}/admin/stats`, adminApiConfig())).data;
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'โหลดสถิติไม่สำเร็จ'), 'error');
    return;
  }

  if (totalUsersEl) totalUsersEl.textContent = stats.totalUsers || 0;
  if (activeUsersEl) activeUsersEl.textContent = stats.activeUsers || 0;
  if (pendingTopupsEl) pendingTopupsEl.textContent = stats.pendingTopups || 0;
  if (revenueEl) revenueEl.textContent = Number(stats.todayRevenue || 0).toLocaleString('th-TH');
}

function renderAdminUsersTable() {
  const container = document.getElementById('users-table-container');
  if (!container) return;

  const users = adminUsers;
  const searchVal = (document.getElementById('user-search')?.value || '').toLowerCase();
  const filtered = users.filter((u) =>
    String(u.username || '').toLowerCase().includes(searchVal)
    || String(u.memberCode || '').toLowerCase().includes(searchVal)
    || String(u.sessionIp || '').toLowerCase().includes(searchVal)
  );

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="text-align:center; padding:30px;">
        <div style="font-size:2rem;">👥</div>
        <p style="color:var(--text-muted); margin-top:6px;">ไม่พบข้อมูลสมาชิก</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="admin-table" style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--border-bright); text-align:left; color:var(--primary);">
          <th style="padding:10px;">ชื่อผู้ใช้</th>
          <th style="padding:10px;">วันที่สมัคร</th>
          <th style="padding:10px;">สิทธิ์</th>
          <th style="padding:10px;">เพชร 💎</th>
          <th style="padding:10px;">วันหมดอายุ</th>
          <th style="padding:10px;">โปรแกรมที่กำลังใช้งาน</th>
          <th style="padding:10px;">IP ที่กำลังใช้งาน</th>
          <th style="padding:10px; text-align:right;">จัดการ</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(u => `
          <tr style="border-bottom:1px solid rgba(0,212,255,0.15);">
            <td style="padding:12px; font-weight:700;">
              ${escapeHtml(u.username)}
              <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(u.memberCode)}</div>
              <div style="font-size:0.78rem; color:var(--primary); margin-top:5px;">โปรแกรมที่ใช้งาน: ${Number(u.activePrograms ?? u.activeScreens ?? 0)} / ${Number(u.maxPrograms || 4)}</div>
              <div style="font-size:0.75rem; color:var(--text-muted);">IP ล่าสุด: ${escapeHtml(u.sessionIp || 'ยังไม่มี Heartbeat')}</div>
            </td>
            <td style="padding:12px; font-size:0.85rem; color:var(--text-muted);">${u.createdAt ? new Date(u.createdAt).toLocaleString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}</td>
            <td style="padding:12px;"><span style="padding:4px 8px; border-radius:12px; font-size:0.8rem; background:${u.role === 'admin' ? 'rgba(255,170,0,0.2)' : 'rgba(0,212,255,0.2)'}; color:${u.role === 'admin' ? '#ffcc00' : 'var(--primary)'}">${u.role === 'admin' ? '👑 แอดมิน' : '👤 สมาชิก'}</span></td>
            <td style="padding:12px; color:var(--accent); font-weight:700;">${u.diamonds || 0}</td>
            <td style="padding:12px; font-size:0.85rem;">${u.botExpiry ? new Date(u.botExpiry).toLocaleString('th-TH') : 'ยังไม่ได้เช่า'}</td>
            <td style="padding:12px; font-weight:700;">${Number(u.activePrograms ?? u.activeScreens ?? 0)} / ${Number(u.maxPrograms || 4)}</td>
            <td style="padding:12px; font-size:0.85rem; color:var(--text-muted);">${escapeHtml(u.sessionIp || '-')}</td>
            <td style="padding:12px; text-align:right;">
              <button onclick="openEditUserModal('${encodeURIComponent(u._id)}')" style="background:rgba(0,212,255,0.2); color:var(--primary); border:1px solid var(--primary); padding:4px 10px; border-radius:6px; font-weight:700; cursor:pointer;">✏️ จัดการ</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

window.searchUsers = function() {
  renderAdminUsersTable();
};

window.openEditUserModal = function(userId) {
  userId = decodeURIComponent(userId);
  const users = adminUsers;
  const user = users.find(u => u._id === userId || u.username === userId);
  if (!user) return;

  const idInput = document.getElementById('edit-user-id');
  const userInput = document.getElementById('edit-user-username');
  const passInput = document.getElementById('edit-user-password');
  const diaInput = document.getElementById('edit-user-diamonds');
  const addTimeInput = document.getElementById('edit-user-add-time');
  const programLimitInput = document.getElementById('edit-user-program-limit');

  if (idInput) idInput.value = user._id || user.username;
  if (userInput) {
    userInput.value = user.username;
    userInput.readOnly = true;
  }
  if (passInput) passInput.value = '';
  if (diaInput) diaInput.value = user.diamonds || 0;
  if (addTimeInput) addTimeInput.value = '';
  if (programLimitInput) programLimitInput.value = Number(user.maxPrograms || 4);

  window.openModal('user-modal');
};

window.saveEditedUser = async function() {
  const userId = document.getElementById('edit-user-id')?.value;
  const newUsername = document.getElementById('edit-user-username')?.value.trim();
  const newDiamonds = parseInt(document.getElementById('edit-user-diamonds')?.value || 0);
  const addTime = parseInt(document.getElementById('edit-user-add-time')?.value || 0);
  const newPassword = document.getElementById('edit-user-password')?.value || '';
  const maxPrograms = parseInt(document.getElementById('edit-user-program-limit')?.value || 4);

  if (!userId || !newUsername) return;
  if (!Number.isInteger(newDiamonds) || newDiamonds < 0 || newDiamonds > 1000000) {
    window.showToast('จำนวนเครดิตต้องเป็นเลขเต็ม 0-1,000,000', 'error');
    return;
  }
  if (addTime < 0 || addTime > 365) {
    window.showToast('จำนวนวันต้องอยู่ระหว่าง 0-365 วัน', 'error');
    return;
  }
  if (newPassword && (newPassword.length < 8 || newPassword.length > 128)) {
    window.showToast('รหัสผ่านใหม่ต้องยาว 8-128 ตัวอักษร', 'error');
    return;
  }
  if (!Number.isInteger(maxPrograms) || maxPrograms < 1 || maxPrograms > 100) {
    window.showToast('จำนวนโปรแกรมต้องเป็นเลขเต็ม 1-100', 'error');
    return;
  }

  try {
    const user = adminUsers.find(item => item._id === userId);
    const requests = [];
    if (Number(user?.maxPrograms || 4) !== maxPrograms) requests.push(
      axios.patch(`${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/program-limit`, { maxPrograms }, adminApiConfig())
    );
    if (Number(user?.diamonds || 0) !== newDiamonds) requests.push(
      axios.patch(`${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/diamonds`, { diamonds: newDiamonds }, adminApiConfig())
    );
    if (addTime > 0) requests.push(
      axios.patch(`${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/days`, {
        days: addTime
      }, adminApiConfig())
    );
    if (newPassword) requests.push(
      axios.patch(`${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/reset-password`, { newPassword }, adminApiConfig())
    );
    await Promise.all(requests);
    await reloadAdminData();
    window.closeModal('user-modal');
    renderAdminUsersTable();
    await updateAdminPanelStats();
    window.showToast('บันทึกข้อมูลสมาชิกสำเร็จ', 'success');
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'บันทึกข้อมูลสมาชิกไม่สำเร็จ'), 'error');
  }
};

window.deleteSelectedUser = function() {
  window.showToast('ระบบฐานข้อมูลเดิมไม่รองรับการลบสมาชิกจากหน้าเว็บ', 'error');
};

window.resetSelectedDevice = async function() {
  const userId = document.getElementById('edit-user-id')?.value;
  if (!userId) return;
  try {
    await axios.patch(
      `${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/reset-device`,
      {},
      adminApiConfig()
    );
    await reloadAdminData();
    renderAdminUsersTable();
    window.closeModal('user-modal');
    window.showToast('รีเซ็ตเครื่องสมาชิกเรียบร้อยแล้ว', 'success');
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'รีเซ็ตเครื่องไม่สำเร็จ'), 'error');
  }
};

window.disableSelectedUser = async function() {
  const userId = document.getElementById('edit-user-id')?.value;
  const username = document.getElementById('edit-user-username')?.value || userId;
  if (!userId) return;
  if (!window.confirm(`ปิดบัญชี "${username}" ใช่หรือไม่? บัญชีจะเข้าสู่ระบบไม่ได้จนกว่าจะเปิดใช้งานกลับที่หน้า "บัญชีที่ปิด"`)) return;
  try {
    await axios.patch(`${API_BASE_URL}/admin/users/${encodeURIComponent(userId)}/disable`, {}, adminApiConfig());
    await reloadAdminData();
    renderAdminUsersTable();
    window.closeModal('user-modal');
    window.showToast('ปิดบัญชีเรียบร้อยแล้ว', 'success');
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'ปิดบัญชีไม่สำเร็จ'), 'error');
  }
};

// ── Closed accounts (admin) ──────────────────────────────────────────────
let closedAccounts = [];

async function loadClosedAccounts() {
  const container = document.getElementById('closed-accounts-table-container');
  if (container) container.innerHTML = '<div class="loading-spinner">⟳</div>';
  try {
    const response = await axios.get(`${API_BASE_URL}/admin/users/disabled`, adminApiConfig());
    closedAccounts = response.data?.users || [];
    renderClosedAccountsTable();
  } catch (error) {
    const text = getApiErrorMessage(error, 'โหลดรายชื่อบัญชีที่ปิดไม่สำเร็จ');
    if (container) container.innerHTML = `<p style="padding:16px; color:var(--danger);">${escapeHtml(text)}</p>`;
    window.showToast(text, 'error');
  }
}

window.renderClosedAccountsTable = function() {
  const container = document.getElementById('closed-accounts-table-container');
  if (!container) return;
  const searchVal = (document.getElementById('closed-accounts-search')?.value || '').toLowerCase();
  const filtered = closedAccounts.filter((item) =>
    String(item.username || '').toLowerCase().includes(searchVal)
    || String(item.memberCode || '').toLowerCase().includes(searchVal)
  );

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state" style="text-align:center; padding:30px;">
        <div style="font-size:2rem;">🔒</div>
        <p style="color:var(--text-muted); margin-top:6px;">${closedAccounts.length ? 'ไม่พบบัญชีที่ตรงกับคำค้นหา' : 'ยังไม่มีบัญชีที่ปิดอยู่'}</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <table class="admin-table" style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--border-bright); text-align:left; color:var(--primary);">
          <th style="padding:10px;">ชื่อผู้ใช้</th>
          <th style="padding:10px;">หมายเลขไอดี</th>
          <th style="padding:10px;">ปิดเมื่อ</th>
          <th style="padding:10px; text-align:right;">จัดการ</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map((item) => `
          <tr style="border-bottom:1px solid rgba(0,212,255,0.15);">
            <td style="padding:12px; font-weight:700;">${escapeHtml(item.username)}</td>
            <td style="padding:12px; font-size:0.85rem; color:var(--text-muted);">${escapeHtml(item.memberCode)}</td>
            <td style="padding:12px; font-size:0.85rem;">${item.disabledAt ? escapeHtml(thaiDateTime(item.disabledAt)) : '-'}</td>
            <td style="padding:12px; text-align:right;">
              <button onclick="reactivateAccount('${encodeURIComponent(item.memberCode)}')" style="background:rgba(0,255,170,0.2); color:var(--accent); border:1px solid var(--accent); padding:6px 12px; border-radius:6px; font-weight:700; cursor:pointer;">✅ เปิดใช้งานกลับ</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
};

window.reactivateAccount = async function(memberCode) {
  memberCode = decodeURIComponent(memberCode);
  try {
    await axios.patch(`${API_BASE_URL}/admin/users/${encodeURIComponent(memberCode)}/enable`, {}, adminApiConfig());
    await loadClosedAccounts();
    window.showToast('เปิดใช้งานบัญชีกลับเรียบร้อยแล้ว บัญชีนี้กลับไปอยู่ในหน้าจัดการผู้ใช้ปกติแล้ว', 'success');
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'เปิดใช้งานบัญชีไม่สำเร็จ'), 'error');
  }
};

function renderAdminTopupsTable() {
  const container = document.getElementById('topups-table-container');
  if (!container) return;

  const topups = adminTopups;
  const filterVal = document.getElementById('topup-filter')?.value || '';
  const filtered = filterVal ? topups.filter(t => t.status === filterVal) : topups;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="text-align:center; padding:30px;">
        <div style="font-size:2rem;">💰</div>
        <p style="color:var(--text-muted); margin-top:6px;">ยังไม่มีรายการเติมเงิน</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="admin-table" style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--border-bright); text-align:left; color:var(--primary);">
          <th style="padding:10px;">สมาชิก</th>
          <th style="padding:10px;">ช่องทาง</th>
          <th style="padding:10px;">จำนวนเงิน</th>
          <th style="padding:10px;">สิทธิ์ที่ได้รับ</th>
          <th style="padding:10px;">เลขอ้างอิง</th>
          <th style="padding:10px;">เวลา</th>
          <th style="padding:10px;">สถานะ</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(t => `
          <tr style="border-bottom:1px solid rgba(0,212,255,0.15);">
            <td style="padding:10px;">
              <strong>${escapeHtml(t.memberName || t.username || '-')}</strong>
              ${t.memberCode ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">${escapeHtml(t.memberCode)}</div>` : ''}
              ${t.source === 'line-slip' && !t.memberCode ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">ยังไม่มีสมาชิกใช้โค้ด</div>` : ''}
            </td>
            <td style="padding:10px;">${t.source === 'line-slip' ? 'LINE ตรวจสลิป' : 'หน้าเว็บไซต์'}</td>
            <td style="padding:10px; color:var(--accent); font-weight:700;">${t.amount} บาท</td>
            <td style="padding:10px; font-weight:700;">${t.source === 'line-slip'
              ? `${escapeHtml(accessCodeDurationLabel(t.durationMinutes))} × ${Number(t.codeCount || 1)} โค้ด`
              : `${Number(t.diamonds || 0)} เครดิต`}</td>
            <td style="padding:10px; font-size:0.85rem;">${escapeHtml(t.slipRef || t.orderId || '-')}</td>
            <td style="padding:10px; font-size:0.85rem;">${t.createdAt ? new Date(t.createdAt).toLocaleString('th-TH') : '-'}</td>
            <td style="padding:10px;">
              <span style="padding:4px 8px; border-radius:12px; font-size:0.8rem; background:${t.status === 'approved' ? 'rgba(0,255,170,0.2)' : t.status === 'pending' ? 'rgba(255,190,0,0.2)' : 'rgba(255,51,102,0.2)'}; color:${t.status === 'approved' ? 'var(--accent)' : t.status === 'pending' ? '#ffd34e' : 'var(--danger)'}">
                ${t.status === 'approved' ? '✅ อนุมัติแล้ว' : t.status === 'pending' ? '⏳ รอตรวจสอบ' : '❌ ปฏิเสธ'}
              </span>
              ${['pending', 'pending_review'].includes(t.status) ? `
                <button onclick="processTopup('${encodeURIComponent(t._id)}', 'approved', ${Number(t.diamonds || t.amount || 0)})">อนุมัติ</button>
                <button onclick="processTopup('${encodeURIComponent(t._id)}', 'rejected', 0)">ปฏิเสธ</button>
              ` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

window.loadAdminTopups = async function() {
  await reloadAdminData().catch(() => {});
  renderAdminTopupsTable();
};

window.processTopup = async function(topupId, status, diamonds) {
  topupId = decodeURIComponent(topupId);
  try {
    await axios.patch(`${API_BASE_URL}/admin/topups/${encodeURIComponent(topupId)}`, {
      status,
      diamonds,
      adminNote: status === 'approved' ? 'อนุมัติผ่านแผงผู้ดูแล' : 'ปฏิเสธผ่านแผงผู้ดูแล'
    }, adminApiConfig());
    await reloadAdminData();
    renderAdminTopupsTable();
    await updateAdminPanelStats();
    window.showToast('อัปเดตสถานะรายการแล้ว', 'success');
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'อัปเดตรายการไม่สำเร็จ'), 'error');
  }
};

window.savePromptPaySettings = async function() {
  const ppNum = document.getElementById('sys-promptpay')?.value.trim();
  const ppName = document.getElementById('sys-promptpay-name')?.value.trim();
  const receiverName = document.getElementById('sys-slip-receiver')?.value.trim();
  const qrUrl = document.getElementById('sys-qr-url')?.value.trim() || '';

  if (!ppNum || !ppName || !receiverName) {
    window.showToast('กรุณากรอกข้อมูลพร้อมเพย์และชื่อผู้รับให้ครบ', 'error');
    return;
  }
  if (qrUrl && !qrUrl.startsWith('https://')) {
    window.showToast('ลิงก์รูป QR ต้องขึ้นต้นด้วย https://', 'error');
    return;
  }

  try {
    await axios.post(`${API_BASE_URL}/admin/settings`, {
      promptpayNumber: ppNum,
      promptpayLabel: ppName,
      slipReceiverName: receiverName,
      paymentQrUrl: qrUrl
    }, adminApiConfig());
    await loadSystemSettings(true);
    window.showToast('บันทึกข้อมูลพร้อมเพย์ลงฐานข้อมูลแล้ว', 'success');
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'บันทึกข้อมูลพร้อมเพย์ไม่สำเร็จ'), 'error');
  }
};

window.savePaymentPlans = async function() {
  const rows = [...document.querySelectorAll('#payment-plans-editor .payment-plan-row')];
  const paymentPlans = rows.map((row) => ({
    amount: Number(row.querySelector('.payment-plan-amount')?.value),
    days: Number(row.querySelector('.payment-plan-days')?.value)
  }));
  const valid = paymentPlans.length >= 1 && paymentPlans.length <= 10
    && paymentPlans.every(({ amount, days }) => (
      Number.isInteger(amount) && amount >= 1 && amount <= 100000
      && Number.isInteger(days) && days >= 1 && days <= 365
    ));
  if (!valid) {
    window.showToast('ราคาและจำนวนวันต้องเป็นเลขจำนวนเต็ม โดยวันต้องอยู่ระหว่าง 1-365 วัน', 'error');
    return;
  }
  if (new Set(paymentPlans.map(({ amount }) => amount)).size !== paymentPlans.length) {
    window.showToast('ราคาแต่ละแพ็กเกจต้องไม่ซ้ำกัน', 'error');
    return;
  }

  try {
    await axios.post(`${API_BASE_URL}/admin/settings`, { paymentPlans }, adminApiConfig());
    await loadSystemSettings(true);
    window.showToast('บันทึกราคาและจำนวนวันแล้ว ระบบหน้าเว็บและ LINE อัปเดตเรียบร้อย', 'success');
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'บันทึกแพ็กเกจราคาไม่สำเร็จ'), 'error');
  }
};

window.handleAdminQrUpload = async function(event) {
  const file = event.target.files?.[0];
  const status = document.getElementById('admin-qr-status');
  const preview = document.getElementById('admin-qr-preview');
  const qrUrlInput = document.getElementById('sys-qr-url');
  if (!file) return;
  if (!file.type.startsWith('image/') || file.size > 5_000_000) {
    window.showToast('กรุณาเลือกไฟล์รูปภาพขนาดไม่เกิน 5 MB', 'error');
    event.target.value = '';
    return;
  }

  if (status) status.textContent = 'กำลังอ่านข้อมูลจาก QR...';
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1400;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const decoded = window.jsQR?.(
      imageData.data,
      imageData.width,
      imageData.height,
      { inversionAttempts: 'attemptBoth' }
    );
    if (!decoded?.data) {
      throw new Error('อ่าน QR จากไฟล์ไม่ได้ กรุณาใช้รูปที่คมชัดและเห็น QR เต็มภาพ');
    }

    const generatedUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&format=png&data=${encodeURIComponent(decoded.data)}`;
    if (generatedUrl.length > 500) {
      throw new Error('ข้อมูลใน QR ยาวเกินไป กรุณาใช้ QR พร้อมเพย์มาตรฐาน');
    }
    if (qrUrlInput) qrUrlInput.value = generatedUrl;
    if (preview) {
      preview.src = URL.createObjectURL(file);
      preview.classList.remove('hidden');
    }
    if (status) status.textContent = '✓ อ่าน QR สำเร็จ กดบันทึกข้อมูลพร้อมเพย์ได้เลย';
    window.showToast('อ่านไฟล์ QR สำเร็จ กรุณากดบันทึก', 'success');
  } catch (error) {
    if (status) status.textContent = error.message;
    window.showToast(error.message || 'อ่านไฟล์ QR ไม่สำเร็จ', 'error');
    event.target.value = '';
  }
};

window.saveAnnouncement = async function() {
  const announcement = document.getElementById('sys-announcement')?.value.trim() || '';
  if (announcement.length > 240) {
    window.showToast('ข้อความประกาศต้องไม่เกิน 240 ตัวอักษร', 'error');
    return;
  }
  try {
    await axios.post(`${API_BASE_URL}/admin/settings`, {
      announcement
    }, adminApiConfig());
    await loadSystemSettings(true);
    window.showToast('บันทึกประกาศหน้าแรกแล้ว', 'success');
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'บันทึกประกาศไม่สำเร็จ'), 'error');
  }
};

window.saveBotInfo = async function() {
  const name = document.getElementById('sys-bot-name')?.value.trim();
  const url = document.getElementById('sys-bot-url')?.value.trim();

  if (!name) {
    window.showToast('กรุณากรอกชื่อบอท', 'error');
    return;
  }
  if (url && !url.startsWith('https://')) {
    window.showToast('ลิงก์ดาวน์โหลดต้องขึ้นต้นด้วย https://', 'error');
    return;
  }

  try {
    const payload = { botName: name };
    if (url) payload.downloadUrl = url;
    await axios.post(`${API_BASE_URL}/admin/settings`, payload, adminApiConfig());
    await loadSystemSettings(true);
    window.showToast('บันทึกชื่อบอทและลิงก์ดาวน์โหลดแล้ว', 'success');
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'บันทึกข้อมูลบอทไม่สำเร็จ'), 'error');
  }
};

window.massCompensation = async function() {
  const timeInput = document.getElementById('comp-time');
  const noteInput = document.getElementById('comp-note');

  const addTime = parseInt(timeInput?.value || 0);

  if (!Number.isInteger(addTime) || addTime < 1 || addTime > 365) {
    window.showToast('กรุณาระบุจำนวนวัน 1-365 วัน', 'error');
    return;
  }

  try {
    await axios.post(`${API_BASE_URL}/admin/mass-compensation`, {
      days: addTime,
      note: noteInput?.value.trim() || ''
    }, adminApiConfig());
    if (timeInput) timeInput.value = '';
    if (noteInput) noteInput.value = '';
    await reloadAdminData();
    await updateAdminPanelStats();
    window.showToast(`ชดเชยเวลา ${addTime} วันสำเร็จ`, 'success');
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'ชดเชยเวลาไม่สำเร็จ'), 'error');
  }
};

// 9. DOM READY INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tab-login')?.addEventListener('click', () => window.switchTab('login'));
  document.getElementById('tab-register')?.addEventListener('click', () => window.switchTab('register'));
  document.getElementById('login-form')?.addEventListener('submit', window.handleLogin);
  document.getElementById('register-form')?.addEventListener('submit', window.handleRegister);
  window.switchTab(currentAuthView);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') window.closeSidebarDrawer();
  });

  // Remove plaintext passwords left by older local-preview versions.
  if (safeStorageGet('registeredUsers')) {
    saveRegisteredUsers(getRegisteredUsers());
  }
  initThreeJS();
  loadSystemSettings(false);

  let token = safeStorageGet('token');
  let user = safeStorageGet('user');

  if (token && user) {
    try {
      const savedUser = JSON.parse(user);
      const staleAdminSession = savedUser?.role === 'admin'
        && safeStorageGet('authSessionVersion') !== 'legacy-admin-v2';
      if (staleAdminSession) {
        safeStorageRemove('token');
        safeStorageRemove('user');
        token = null;
        user = null;
      }
    } catch (e) {}
  }

  if (token && user) {
    try {
      currentUser = JSON.parse(user);
    } catch (e) {
      safeStorageRemove('token');
      safeStorageRemove('user');
      currentUser = null;
    }
  }

  initRouter({
    isAuthed: () => Boolean(currentUser),
    isAdmin: () => currentUser?.role === 'admin',
    onNavigate: handleRouteEnter,
    onNotFound: () => window.showPage('notfound-page'),
    onForbidden: () => window.showToast('คุณไม่มีสิทธิ์เข้าหน้านี้', 'error')
  });
});
