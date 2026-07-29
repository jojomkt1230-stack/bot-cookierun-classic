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
  if (sectionId === 'admin') initAdminPanel();
  if (sectionId === 'tutorial') renderTutorialSteps(getSystemSettings().steps || []);
  if (sectionId === 'topup') applySystemSettingsToUI();
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

function getAuthHeaders() {
  const token = localStorage.getItem('token');
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
  announcement: 'ยินดีต้อนรับสู่ CKRCS Bot Classic! 1 บาท = 1 เพชร',
  promptPayNumber: '0655611571',
  promptPayAccountName: 'กรุณาตั้งชื่อบัญชี',
  promptPayQrUrl: 'cookierun-world.png',
  botName: 'CKRCS Bot Classic',
  botVersion: 'v2.9.0',
  botUrl: 'https://drive.google.com/file/d/ckrcs_bot_v29/view',
  videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  steps: [
    'สมัครสมาชิกและเข้าสู่ระบบด้วยบัญชีของคุณ',
    'เติมเงินผ่าน PromptPay และแนบรูปสลิปที่ถูกต้อง',
    'เลือกแพ็กเกจเช่าบอท 1, 3, 7 หรือ 30 วัน',
    'ดาวน์โหลดบอทและใช้งานภายในวันหมดอายุที่ระบบแสดง'
  ]
};

function getSystemSettings() {
  const saved = localStorage.getItem('systemSettings');
  if (saved) {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }; } catch (e) {}
  }
  return DEFAULT_SETTINGS;
}

function saveSystemSettings(settings) {
  localStorage.setItem('systemSettings', JSON.stringify(settings));
  applySystemSettingsToUI();
}

function applySystemSettingsToUI() {
  const settings = getSystemSettings();

  // Topup Section PromptPay Info
  const ppNum = document.getElementById('promptpay-number');
  const ppName = document.getElementById('promptpay-account-name');
  const qrImg = document.getElementById('qr-code-img');

  if (ppNum) ppNum.textContent = settings.promptPayNumber || '0655611571';
  if (ppName) ppName.textContent = `ชื่อบัญชี: ${settings.promptPayAccountName || 'กรุณาตั้งชื่อบัญชี'}`;
  if (qrImg) qrImg.src = settings.promptPayQrUrl || 'cookierun-world.png';

  // System Settings Panel Inputs
  const sysBotStatus = document.getElementById('sys-bot-status');
  const sysAnnounce = document.getElementById('sys-announcement');
  const sysPP = document.getElementById('sys-promptpay');
  const sysPPName = document.getElementById('sys-promptpay-name');
  const sysBotName = document.getElementById('sys-bot-name');
  const sysBotVer = document.getElementById('sys-bot-version');
  const sysBotUrl = document.getElementById('sys-bot-url');
  const sysVidUrl = document.getElementById('sys-video-url');

  if (sysBotStatus) sysBotStatus.value = settings.botStatus || 'online';
  if (sysAnnounce) sysAnnounce.value = settings.announcement || '';
  if (sysPP) sysPP.value = settings.promptPayNumber || '0655611571';
  if (sysPPName) sysPPName.value = settings.promptPayAccountName || 'กรุณาตั้งชื่อบัญชี';
  if (sysBotName) sysBotName.value = settings.botName || '';
  if (sysBotVer) sysBotVer.value = settings.botVersion || '';
  if (sysBotUrl) sysBotUrl.value = settings.botUrl || '';
  if (sysVidUrl) sysVidUrl.value = settings.videoUrl || '';

  // Tutorial Video Iframe & Steps
  const tutIframe = document.getElementById('tutorial-iframe');
  if (tutIframe && settings.videoUrl) tutIframe.src = settings.videoUrl;

  renderTutorialSteps(settings.steps || []);
}

function renderTutorialSteps(steps) {
  const stepsContainer = document.getElementById('tutorial-steps');
  const editorContainer = document.getElementById('steps-editor');

  if (stepsContainer) {
    stepsContainer.innerHTML = steps.map((step, idx) => `
      <div class="step-card card-panel">
        <div class="step-num">${idx + 1}</div>
        <div class="step-text">${step}</div>
      </div>
    `).join('');
  }

  if (editorContainer) {
    editorContainer.innerHTML = steps.map((step, idx) => `
      <div class="input-row" style="margin-bottom:8px">
        <input type="text" value="${step}" class="admin-input step-edit-input" data-idx="${idx}" />
        <button class="btn-danger" onclick="deleteStep(${idx})" style="background:var(--danger); color:#fff; border:none; padding:6px 12px; border-radius:6px; font-weight:bold; cursor:pointer;">✕</button>
      </div>
    `).join('');
  }
}

// 3. USER MANAGEMENT AND STATE
let currentUser = null;

function getRegisteredUsers() {
  const saved = localStorage.getItem('registeredUsers');
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
  settings.steps = [...(settings.steps || []), text];
  saveSystemSettings(settings);
  input.value = '';
};

window.deleteStep = function(index) {
  const settings = getSystemSettings();
  settings.steps = (settings.steps || []).filter((_, itemIndex) => itemIndex !== Number(index));
  saveSystemSettings(settings);
};

window.saveSteps = function() {
  const settings = getSystemSettings();
  settings.steps = [...document.querySelectorAll('.step-edit-input')]
    .map((input) => input.value.trim())
    .filter(Boolean);
  saveSystemSettings(settings);
  window.showToast('บันทึกขั้นตอนสำเร็จ', 'success');
};

function saveRegisteredUsers(users) {
  localStorage.setItem('registeredUsers', JSON.stringify(users));
}

// 4. TOAST AND MODAL HELPERS
window.showToast = function(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${msg}</span>`;
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
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    if (passwordEl) passwordEl.value = '';
    window.showPage('dashboard-page');
    initDashboard();
    window.showToast(`เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ${user.username} 🎉`, 'success');
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
  if (password.length < 6) {
    if (errEl) errEl.textContent = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
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
  localStorage.removeItem('token');
  localStorage.removeItem('user');
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

function initDashboard() {
  const userStr = localStorage.getItem('user');
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
}

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
    localStorage.setItem('user', JSON.stringify(currentUser));
    pendingRedeem = null;
    window.closeModal('confirm-modal');
    initDashboard();
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

// ─── 7. CLIENT SLIP TOPUP & SLIPOK API VERIFICATION ────────────────
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
  if (file.size > 5 * 1024 * 1024) {
    event.target.value = '';
    window.showToast('ไฟล์สลิปต้องมีขนาดไม่เกิน 5MB', 'error');
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
    btn.innerHTML = '<span class="btn-icon">⟳</span> กำลังตรวจสอบสลิปผ่าน Thunder v2...';
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

    // 2. Submit Slip Image to Backend Thunder v2 Verification Endpoint
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
      localStorage.setItem('user', JSON.stringify(currentUser));

      window.removeSlip();
      if (amountEl) amountEl.value = '';
      initDashboard();
      if (msgEl) {
        msgEl.textContent = verifyRes.data.message || 'เติมเงินสำเร็จ';
        msgEl.style.color = 'var(--accent)';
      }
      window.showToast(verifyRes.data.message || '🎉 เติมเงินสำเร็จผ่าน Thunder v2!', 'success');
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
  const saved = localStorage.getItem('topupHistory');
  if (saved) {
    try { return JSON.parse(saved); } catch (e) {}
  }
  return [];
}

function saveTopupHistory(history) {
  localStorage.setItem('topupHistory', JSON.stringify(history));
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

// 8. ADMIN PANEL AND USER MANAGEMENT
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

  if (tabName === 'overview') updateAdminPanelStats();
  if (tabName === 'users') renderAdminUsersTable();
  if (tabName === 'topups') renderAdminTopupsTable();
  if (tabName === 'system') applySystemSettingsToUI();
};

function initAdminPanel() {
  updateAdminPanelStats();
  renderAdminUsersTable();
  renderAdminTopupsTable();
  applySystemSettingsToUI();
}

function updateAdminPanelStats() {
  const totalUsersEl = document.getElementById('stat-total-users');
  const activeUsersEl = document.getElementById('stat-active-users');
  const pendingTopupsEl = document.getElementById('stat-pending-topups');
  const revenueEl = document.getElementById('stat-today-revenue');

  const users = getRegisteredUsers();
  const topups = getTopupHistory();

  const totalUsers = users.length;
  const activeBots = users.filter(u => u.botExpiry && new Date(u.botExpiry) > new Date()).length;
  const pendingTopups = topups.filter(t => t.status === 'pending').length;
  const todayRevenue = topups.filter(t => t.status === 'approved').reduce((sum, t) => sum + (t.amount || 0), 0);

  if (totalUsersEl) totalUsersEl.textContent = totalUsers;
  if (activeUsersEl) activeUsersEl.textContent = activeBots;
  if (pendingTopupsEl) pendingTopupsEl.textContent = pendingTopups;
  if (revenueEl) revenueEl.textContent = todayRevenue.toLocaleString('th-TH');
}

function renderAdminUsersTable() {
  const container = document.getElementById('users-table-container');
  if (!container) return;

  const users = getRegisteredUsers();
  const searchVal = (document.getElementById('user-search')?.value || '').toLowerCase();
  const filtered = users.filter(u => u.username.toLowerCase().includes(searchVal));

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
          <th style="padding:10px;">สิทธิ์</th>
          <th style="padding:10px;">เพชร 💎</th>
          <th style="padding:10px;">วันหมดอายุ</th>
          <th style="padding:10px; text-align:right;">จัดการ</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(u => `
          <tr style="border-bottom:1px solid rgba(0,212,255,0.15);">
            <td style="padding:12px; font-weight:700;">${u.username}</td>
            <td style="padding:12px;"><span style="padding:4px 8px; border-radius:12px; font-size:0.8rem; background:${u.role === 'admin' ? 'rgba(255,170,0,0.2)' : 'rgba(0,212,255,0.2)'}; color:${u.role === 'admin' ? '#ffcc00' : 'var(--primary)'}">${u.role === 'admin' ? '👑 แอดมิน' : '👤 สมาชิก'}</span></td>
            <td style="padding:12px; color:var(--accent); font-weight:700;">${u.diamonds || 0}</td>
            <td style="padding:12px; font-size:0.85rem;">${u.botExpiry ? new Date(u.botExpiry).toLocaleString('th-TH') : 'ยังไม่ได้เช่า'}</td>
            <td style="padding:12px; text-align:right;">
              <button onclick="openEditUserModal('${u._id}')" style="background:rgba(0,212,255,0.2); color:var(--primary); border:1px solid var(--primary); padding:4px 10px; border-radius:6px; font-weight:700; cursor:pointer; margin-right:6px;">✏️ แก้ไข</button>
              ${u.role !== 'admin' ? `<button onclick="deleteUser('${u._id}')" style="background:rgba(255,51,102,0.2); color:var(--danger); border:1px solid var(--danger); padding:4px 10px; border-radius:6px; font-weight:700; cursor:pointer;">🗑️ ลบ</button>` : ''}
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
  const users = getRegisteredUsers();
  const user = users.find(u => u._id === userId || u.username === userId);
  if (!user) return;

  const idInput = document.getElementById('edit-user-id');
  const userInput = document.getElementById('edit-user-username');
  const passInput = document.getElementById('edit-user-password');
  const diaInput = document.getElementById('edit-user-diamonds');
  const addTimeInput = document.getElementById('edit-user-add-time');

  if (idInput) idInput.value = user._id || user.username;
  if (userInput) userInput.value = user.username;
  if (passInput) passInput.value = '';
  if (diaInput) diaInput.value = user.diamonds || 0;
  if (addTimeInput) addTimeInput.value = '';

  window.openModal('user-modal');
};

window.saveEditedUser = function() {
  const userId = document.getElementById('edit-user-id')?.value;
  const newUsername = document.getElementById('edit-user-username')?.value.trim();
  const newDiamonds = parseInt(document.getElementById('edit-user-diamonds')?.value || 0);
  const addTime = parseInt(document.getElementById('edit-user-add-time')?.value || 0);
  const timeUnit = document.getElementById('edit-user-time-unit')?.value || 'hours';

  if (!userId || !newUsername) return;

  const users = getRegisteredUsers();
  const idx = users.findIndex(u => u._id === userId);
  if (idx === -1) return;

  users[idx].username = newUsername;
  users[idx].diamonds = newDiamonds;

  if (addTime > 0) {
    const currentExp = users[idx].botExpiry ? new Date(users[idx].botExpiry).getTime() : Date.now();
    const base = Math.max(Date.now(), currentExp);
    const multiplier = timeUnit === 'days' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    users[idx].botExpiry = new Date(base + addTime * multiplier).toISOString();
  }

  saveRegisteredUsers(users);

  if (currentUser && currentUser._id === userId) {
    currentUser = users[idx];
    localStorage.setItem('user', JSON.stringify(currentUser));
    initDashboard();
  }

  window.closeModal('user-modal');
  renderAdminUsersTable();
  updateAdminPanelStats();
  window.showToast('บันทึกข้อมูลสมาชิกสำเร็จ', 'success');
};

window.deleteSelectedUser = function() {
  const userId = document.getElementById('edit-user-id')?.value;
  if (userId) window.deleteUser(userId);
};

window.deleteUser = function(userId) {
  const users = getRegisteredUsers();
  const user = users.find(u => u._id === userId);
  if (!user) return;

  if (user.role === 'admin') {
    window.showToast('ไม่สามารถลบบัญชีผู้ดูแลระบบได้', 'error');
    return;
  }

  if (confirm(`ยืนยันการลบสมาชิก "${user.username}" ใช่หรือไม่?`)) {
    const updated = users.filter(u => u._id !== userId);
    saveRegisteredUsers(updated);

    window.closeModal('user-modal');
    renderAdminUsersTable();
    updateAdminPanelStats();
    window.showToast(`ลบสมาชิก "${user.username}" แล้ว`, 'info');
  }
};

function renderAdminTopupsTable() {
  const container = document.getElementById('topups-table-container');
  if (!container) return;

  const topups = getTopupHistory();
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
          <th style="padding:10px;">จำนวนเงิน</th>
          <th style="padding:10px;">เพชร 💎</th>
          <th style="padding:10px;">เลขอ้างอิง</th>
          <th style="padding:10px;">เวลา</th>
          <th style="padding:10px;">สถานะ</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(t => `
          <tr style="border-bottom:1px solid rgba(0,212,255,0.15);">
            <td style="padding:10px; font-weight:700;">${t.username}</td>
            <td style="padding:10px; color:var(--accent); font-weight:700;">${t.amount} บาท</td>
            <td style="padding:10px; font-weight:700;">${t.diamonds}</td>
            <td style="padding:10px; font-size:0.85rem;">${t.transRef}</td>
            <td style="padding:10px; font-size:0.85rem;">${t.createdAt}</td>
            <td style="padding:10px;">
              <span style="padding:4px 8px; border-radius:12px; font-size:0.8rem; background:${t.status === 'approved' ? 'rgba(0,255,170,0.2)' : 'rgba(255,51,102,0.2)'}; color:${t.status === 'approved' ? 'var(--accent)' : 'var(--danger)'}">
                ${t.status === 'approved' ? '✅ อนุมัติแล้ว' : '❌ ไม่ผ่าน'}
              </span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

window.loadAdminTopups = function() {
  renderAdminTopupsTable();
};

window.saveSetting = function(key, val) {
  const settings = getSystemSettings();
  settings[key] = val;
  saveSystemSettings(settings);
  window.showToast('บันทึกการตั้งค่าสำเร็จ', 'success');
};

window.savePromptPaySettings = function() {
  const ppNum = document.getElementById('sys-promptpay')?.value.trim();
  const ppName = document.getElementById('sys-promptpay-name')?.value.trim();

  const settings = getSystemSettings();
  if (ppNum) settings.promptPayNumber = ppNum;
  if (ppName) settings.promptPayAccountName = ppName;

  saveSystemSettings(settings);
  window.showToast('บันทึกข้อมูล PromptPay สำเร็จ', 'success');
};

window.handleAdminQrUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    const settings = getSystemSettings();
    settings.promptPayQrUrl = dataUrl;
    saveSystemSettings(settings);

    const prevImg = document.getElementById('admin-qr-preview');
    if (prevImg) {
      prevImg.src = dataUrl;
      prevImg.style.display = 'block';
    }
    window.showToast('อัปโหลด QR Code PromptPay สำเร็จ', 'success');
  };
  reader.readAsDataURL(file);
};

window.saveBotInfo = function() {
  const name = document.getElementById('sys-bot-name')?.value.trim();
  const ver = document.getElementById('sys-bot-version')?.value.trim();
  const url = document.getElementById('sys-bot-url')?.value.trim();

  const settings = getSystemSettings();
  if (name) settings.botName = name;
  if (ver) settings.botVersion = ver;
  if (url) settings.botUrl = url;

  saveSystemSettings(settings);
  window.showToast('บันทึกข้อมูลบอทสำเร็จ', 'success');
};

window.massCompensation = function() {
  const timeInput = document.getElementById('comp-time');
  const unitSelect = document.getElementById('comp-unit');
  const noteInput = document.getElementById('comp-note');

  const addTime = parseInt(timeInput?.value || 0);
  const unit = unitSelect?.value || 'hours';

  if (addTime <= 0) {
    window.showToast('กรุณาระบุระยะเวลาชดเชยให้ถูกต้อง', 'error');
    return;
  }

  const addedMs = unit === 'hours' ? addTime * 60 * 60 * 1000 : addTime * 24 * 60 * 60 * 1000;

  const users = getRegisteredUsers();
  users.forEach(u => {
    const currentExp = u.botExpiry ? new Date(u.botExpiry).getTime() : Date.now();
    const base = Math.max(Date.now(), currentExp);
    u.botExpiry = new Date(base + addedMs).toISOString();
  });

  saveRegisteredUsers(users);

  if (currentUser) {
    const me = users.find(u => u.username === currentUser.username);
    if (me) {
      currentUser = me;
      localStorage.setItem('user', JSON.stringify(currentUser));
      initDashboard();
    }
  }

  if (timeInput) timeInput.value = '';
  if (noteInput) noteInput.value = '';

  const unitText = unit === 'hours' ? 'ชั่วโมง' : 'วัน';
  window.showToast(`ชดเชยเวลา ${addTime} ${unitText} ให้สมาชิกแล้ว`, 'success');
};

// 9. DOM READY INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tab-login')?.addEventListener('click', () => window.switchTab('login'));
  document.getElementById('tab-register')?.addEventListener('click', () => window.switchTab('register'));
  document.getElementById('login-form')?.addEventListener('submit', window.handleLogin);
  document.getElementById('register-form')?.addEventListener('submit', window.handleRegister);
  window.switchTab(currentAuthView);

  // Remove plaintext passwords left by older local-preview versions.
  if (localStorage.getItem('registeredUsers')) {
    saveRegisteredUsers(getRegisteredUsers());
  }
  initThreeJS();

  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');

  if (token && user) {
    try {
      currentUser = JSON.parse(user);
      window.showPage('dashboard-page');
      initDashboard();
    } catch (e) {
      localStorage.clear();
      window.showPage('auth-page');
    }
  } else {
    window.showPage('auth-page');
  }
});
