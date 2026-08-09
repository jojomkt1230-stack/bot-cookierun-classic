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
  document.querySelectorAll('.content-section').forEach((section) => {
    const isTarget = section.id === `section-${sectionId}`;
    section.classList.toggle('hidden', !isTarget);
    section.classList.toggle('active', isTarget);
  });
  document.querySelectorAll('.menu-item').forEach((item) => item.classList.remove('active'));
  document.getElementById(`menu-${sectionId}`)?.classList.add('active');

  if (sectionId === 'activity') renderActivityHistory();
  if (sectionId === 'farm') loadFarmData();
  if (sectionId === 'admin') initAdminPanel();
  if (sectionId === 'tutorial') renderTutorialSteps(getSystemSettings().steps || []);
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
  if (typeof responseData === 'string' && responseData.trim()) return responseData.trim();

  return responseData?.message
    || responseData?.error
    || responseData?.details?.message
    || error?.message
    || fallbackMessage;
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
    { id: 'farm', icon: '💰📦', label: 'ฟาร์มเงิน/กล่อง', description: 'วิ่งเก็บกล่องออโต้รันตลอดวัน', url: '', tutorialUrl: '' },
    { id: 'powder', icon: '🧪', label: 'ย่อยผง', description: 'ย่อยผงอัตโนมัติ เปิดพร้อมกันได้หลายจอ', url: '', tutorialUrl: '' },
    { id: 'friend', icon: '💌', label: 'เพิ่มเพื่อน/ส่งใจ', description: 'เพิ่มเพื่อนและส่งใจให้ครบทุกวัน (แบบเพิ่มเพื่อนปกติครบ 300 คน และส่งใจตรงรายชื่อเพื่อนทุกคน)', url: '', tutorialUrl: 'https://youtu.be/hBXOy-5lAyQ' },
    { id: 'account', icon: '🆕', label: 'สมัครไอดี/ส่งใจ/เพิ่มเพื่อน', description: 'สมัครไอดีใหม่ ส่งใจ และเพิ่มเพื่อนในตัวเดียว (วนส่งใจให้ไอดีที่ขาดหัวใจ รองรับหลายจอ)', url: '', tutorialUrl: 'https://youtu.be/BVrpmF8Qarc' }
  ],
  plans: {
    day1: { label: '1 วัน', days: 1, price: 15 },
    day3: { label: '3 วัน', days: 3, price: 40 },
    day7: { label: '7 วัน', days: 7, price: 100 },
    month1: { label: '30 วัน', days: 30, price: 300 }
  },
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

// The four bots advertised on the home page. `id` and `icon` are fixed so the
// cards stay consistent; the admin panel only edits label, note and link.
const DOWNLOAD_ITEM_PRESETS = DEFAULT_SETTINGS.downloadItems;

function downloadItemsOf(settings = getSystemSettings()) {
  const saved = Array.isArray(settings.downloadItems) ? settings.downloadItems : [];
  return DOWNLOAD_ITEM_PRESETS.map((preset, index) => {
    const item = saved.find((entry) => entry?.id === preset.id) || saved[index] || {};
    return {
      id: preset.id,
      icon: preset.icon,
      label: String(item.label || preset.label),
      description: String(item.description ?? preset.description),
      url: String(item.url || ''),
      tutorialUrl: String(item.tutorialUrl || preset.tutorialUrl || '')
    };
  });
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
    status.className = 'home-bot-status';
    const dot = document.createElement('span');
    dot.className = 'home-bot-status-dot';
    dot.setAttribute('aria-hidden', 'true');
    const statusText = document.createElement('span');
    statusText.textContent = 'ใช้งานได้ปกติ';
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

  editor.replaceChildren(...downloadItemsOf(settings).map((item) => {
    const row = document.createElement('div');
    row.className = 'download-item-row';
    row.dataset.itemId = item.id;

    const heading = document.createElement('div');
    heading.className = 'download-item-heading';
    heading.textContent = `${item.icon} ${item.label}`;

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'admin-input download-item-label';
    labelInput.maxLength = 60;
    labelInput.placeholder = 'ชื่อที่แสดงบนหน้าเว็บ';
    labelInput.value = item.label;
    labelInput.addEventListener('input', () => {
      heading.textContent = `${item.icon} ${labelInput.value.trim() || item.label}`;
    });

    const descriptionInput = document.createElement('input');
    descriptionInput.type = 'text';
    descriptionInput.className = 'admin-input download-item-description';
    descriptionInput.maxLength = 120;
    descriptionInput.placeholder = 'คำอธิบายสั้น ๆ ใต้ชื่อ';
    descriptionInput.value = item.description;

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

    row.append(heading, labelInput, descriptionInput, urlInput, tutorialUrlInput);
    return row;
  }));
}

window.saveDownloadItems = async function() {
  const rows = [...document.querySelectorAll('#download-items-editor .download-item-row')];
  if (!rows.length) return;

  const downloadItems = rows.map((row) => ({
    id: row.dataset.itemId,
    label: row.querySelector('.download-item-label')?.value.trim() || '',
    description: row.querySelector('.download-item-description')?.value.trim() || '',
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
    window.showPage('dashboard-page');
    // We already have fresh user data from the login response itself --
    // skip the immediate re-fetch so a slow/cold backend on this first
    // request right after login can't misfire a false "session expired".
    initDashboard(true);
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
  if (typeof liveCountdownInterval !== 'undefined' && liveCountdownInterval) {
    clearInterval(liveCountdownInterval);
  }
  window.showPage('auth-page');
  window.switchTab('login');
  window.showToast('ออกจากระบบเรียบร้อยแล้ว 👋', 'info');
};


// 6. DASHBOARD AND RENTAL SYSTEM
let liveCountdownInterval = null;
let pendingRedeem = null;

function initDashboard(skipRefresh = false) {
  const userStr = safeStorageGet('user');
  if (userStr) {
    try { currentUser = JSON.parse(userStr); } catch (e) {}
  }
  if (!currentUser) {
    window.showPage('auth-page');
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
          window.showPage('auth-page');
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

function getTopupHistory() {
  const saved = safeStorageGet('topupHistory');
  if (saved) {
    try { return JSON.parse(saved); } catch (e) {}
  }
  return [];
}

function saveTopupHistory(history) {
  safeStorageSet('topupHistory', JSON.stringify(history));
}

function renderActivityHistory() {
  const listEl = document.getElementById('activity-list');
  if (!listEl) return;

  if (!currentUser) return;
  const history = getTopupHistory().filter(t => t.username === currentUser.username);

  if (history.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state card-panel" style="text-align:center; padding:40px 20px;">
        <div style="font-size:3rem; margin-bottom:10px;">📋</div>
        <h3 style="color:var(--text-secondary);">ยังไม่มีประวัติกิจกรรม</h3>
        <p style="color:var(--text-muted); font-size:0.9rem; margin-top:5px;">รายการเติมเงินและเช่าบอทของคุณจะแสดงที่นี่</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = history.map(item => `
    <div class="activity-card card-panel" style="display:flex; justify-content:space-between; align-items:center; padding:16px; margin-bottom:12px; border-radius:10px;">
      <div>
        <div style="font-weight:700; color:var(--primary); font-size:1.05rem;">💰 เติมเงิน ${item.amount} บาท (+${item.diamonds} 💎)</div>
        <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">เลขอ้างอิง: ${item.transRef} | เวลา: ${item.createdAt}</div>
      </div>
      <div>
        <span class="status-badge ${item.status === 'approved' ? 'success' : 'danger'}" style="padding:6px 12px; border-radius:20px; font-weight:700; font-size:0.85rem; background:${item.status === 'approved' ? 'rgba(0,255,170,0.2)' : 'rgba(255,51,102,0.2)'}; color:${item.status === 'approved' ? 'var(--accent)' : 'var(--danger)'}; border:1px solid ${item.status === 'approved' ? 'var(--accent)' : 'var(--danger)'};">
          ${item.status === 'approved' ? '✅ สำเร็จ' : '❌ ไม่สำเร็จ'}
        </span>
      </div>
    </div>
  `).join('');
}

function farmDeviceLabel(deviceId) {
  const match = /(\d{1,2})\s*$/.exec(String(deviceId || '').trim());
  return match ? `หมายเลข ${match[1].padStart(2, '0')}` : (deviceId ? escapeHtml(deviceId) : 'ไม่ระบุ');
}

let farmDataCache = null;
let currentFarmTab = 'all';

window.switchFarmTab = function(tab) {
  currentFarmTab = tab;
  document.querySelectorAll('#section-farm .admin-tab').forEach((btn) => btn.classList.remove('active'));
  document.getElementById(`farm-tab-${tab}`)?.classList.add('active');
  renderFarmData();
};

async function loadFarmData() {
  const body = document.getElementById('farm-device-table-body');
  if (body) body.innerHTML = '<tr><td colspan="7" class="empty-state">⟳ กำลังโหลด...</td></tr>';

  try {
    const response = await axios.get(`${API_BASE_URL}/member/farm`, { headers: getAuthHeaders() });
    farmDataCache = response.data || {};
    renderFarmData();
  } catch (error) {
    if (body) body.innerHTML = '<tr><td colspan="7" class="empty-state">โหลดข้อมูลฟาร์มไม่สำเร็จ ลองกด "อัปเดตข้อมูล" อีกครั้ง</td></tr>';
    window.showToast(getApiErrorMessage(error, 'โหลดข้อมูลฟาร์มไม่สำเร็จ'), 'error');
  }
}
window.loadFarmData = loadFarmData;

function renderFarmData() {
  const body = document.getElementById('farm-device-table-body');
  if (!farmDataCache) return;

  const tab = currentFarmTab;
  const matchesTab = (botType) => tab === 'all' || botType === tab;

  const summaries = (Array.isArray(farmDataCache.summaries) ? farmDataCache.summaries : [])
    .filter((row) => matchesTab(row.bot_type));
  const deviceSummaries = (Array.isArray(farmDataCache.deviceSummaries) ? farmDataCache.deviceSummaries : [])
    .filter((row) => matchesTab(row.bot_type));

  const totalCoins = summaries.reduce((sum, row) => sum + Number(row.coins || 0), 0);
  const totalExp = summaries.reduce((sum, row) => sum + Number(row.exp || 0), 0);
  const totalPowder = summaries.reduce((sum, row) => sum + Number(row.powder || 0), 0);
  const totalRounds = summaries.reduce((sum, row) => sum + Number(row.rounds || 0), 0);

  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('farm-total-coins', totalCoins.toLocaleString('th-TH'));
  set('farm-total-exp', totalExp.toLocaleString('th-TH'));
  set('farm-total-powder', totalPowder.toLocaleString('th-TH'));
  set('farm-total-rounds', totalRounds.toLocaleString('th-TH'));
  set('farm-latest-version', farmDataCache.latestVersion || '-');

  if (!body) return;
  if (!deviceSummaries.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">ยังไม่มีข้อมูล เมื่อบอทฟาร์มสำเร็จ ข้อมูลจะปรากฏที่นี่อัตโนมัติ</td></tr>';
    return;
  }
  body.innerHTML = deviceSummaries.map((row) => `
    <tr>
      <td>${farmDeviceLabel(row.device_id)}</td>
      <td>${row.bot_type === 'coin' ? 'บอทเหรียญ' : 'บอทย่อยผง'}</td>
      <td>${Number(row.rounds || 0).toLocaleString('th-TH')}</td>
      <td>${Number(row.coins || 0).toLocaleString('th-TH')}</td>
      <td>${Number(row.exp || 0).toLocaleString('th-TH')}</td>
      <td>${Number(row.powder || 0).toLocaleString('th-TH')}</td>
      <td><small>${row.last_at ? new Date(row.last_at).toLocaleString('th-TH') : '-'}</small></td>
    </tr>
  `).join('');
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

async function reloadAdminData() {
  if (currentUser?.role !== 'admin') return;
  try {
    const [usersResponse, topupsResponse] = await Promise.all([
      axios.get(`${API_BASE_URL}/admin/users?limit=500`, adminApiConfig()),
      axios.get(`${API_BASE_URL}/admin/topups?limit=500`, adminApiConfig())
    ]);
    adminUsers = usersResponse.data?.users || [];
    adminTopups = topupsResponse.data?.topups || [];
  } catch (error) {
    window.showToast(getApiErrorMessage(error, 'โหลดข้อมูลแอดมินไม่สำเร็จ'), 'error');
    throw error;
  }
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
  if (tabName === 'users') reloadAdminData().then(renderAdminUsersTable).catch(() => {});
  if (tabName === 'topups') reloadAdminData().then(renderAdminTopupsTable).catch(() => {});
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
          <th style="padding:10px; text-align:right;">จัดการ</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(u => `
          <tr style="border-bottom:1px solid rgba(0,212,255,0.15);">
            <td style="padding:12px; font-weight:700;">
              ${escapeHtml(u.username)}
              <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(u.memberCode)}</div>
            </td>
            <td style="padding:12px; font-size:0.85rem; color:var(--text-muted);">${u.createdAt ? new Date(u.createdAt).toLocaleString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}</td>
            <td style="padding:12px;"><span style="padding:4px 8px; border-radius:12px; font-size:0.8rem; background:${u.role === 'admin' ? 'rgba(255,170,0,0.2)' : 'rgba(0,212,255,0.2)'}; color:${u.role === 'admin' ? '#ffcc00' : 'var(--primary)'}">${u.role === 'admin' ? '👑 แอดมิน' : '👤 สมาชิก'}</span></td>
            <td style="padding:12px; color:var(--accent); font-weight:700;">${u.diamonds || 0}</td>
            <td style="padding:12px; font-size:0.85rem;">${u.botExpiry ? new Date(u.botExpiry).toLocaleString('th-TH') : 'ยังไม่ได้เช่า'}</td>
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

  if (idInput) idInput.value = user._id || user.username;
  if (userInput) {
    userInput.value = user.username;
    userInput.readOnly = true;
  }
  if (passInput) passInput.value = '';
  if (diaInput) diaInput.value = user.diamonds || 0;
  if (addTimeInput) addTimeInput.value = '';

  window.openModal('user-modal');
};

window.saveEditedUser = async function() {
  const userId = document.getElementById('edit-user-id')?.value;
  const newUsername = document.getElementById('edit-user-username')?.value.trim();
  const newDiamonds = parseInt(document.getElementById('edit-user-diamonds')?.value || 0);
  const addTime = parseInt(document.getElementById('edit-user-add-time')?.value || 0);
  const newPassword = document.getElementById('edit-user-password')?.value || '';

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

  try {
    const user = adminUsers.find(item => item._id === userId);
    const requests = [];
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
      window.showPage('dashboard-page');
      initDashboard();
    } catch (e) {
      safeStorageRemove('token');
      safeStorageRemove('user');
      window.showPage('auth-page');
    }
  } else {
    window.showPage('auth-page');
  }
});
