// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺�
// CKRCS BOT RENTAL - FULLY FUNCTIONAL PRODUCTION APPLICATION SCRIPT
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺�

// 鈹€鈹€鈹€ 1. THREE.JS 3D BACKGROUND LOGIC 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ 2. SYSTEM SETTINGS & LOCAL STORAGE MANAGEMENT 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const DEFAULT_SETTINGS = {
  botStatus: 'online',
  announcement: '喔⑧复喔權笖喔掂笗喙夃腑喔權福喔编笟喔�腹喙堗福喔班笟喔氞箑喔娻箞喔侧笟喔�笚 CKRCS Bot Kingdom! 1 喔氞覆喔� = 1 馃拵 喙€喔炧笂喔�',
  promptPayNumber: '0655611571',
  promptPayAccountName: '喙€喔堗俯喔庎覆喔犩福喔撪箤',
  promptPayQrUrl: 'cookierun-world.png',
  botName: 'CKRCS Bot Kingdom',
  botVersion: 'v2.9.0',
  botUrl: 'https://drive.google.com/file/d/ckrcs_bot_v29/view',
  videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
  steps: [
    '喔�浮喔编竸喔｀釜喔∴覆喔娻复喔佮箒喔ム赴喔ム箛喔�竵喔�复喔權箑喔傕箟喔侧釜喔灌箞喔｀赴喔氞笟',
    '喙€喔曕复喔∴箑喔囙复喔權笖喙夃抚喔� PromptPay 喔�箒喔佮笝 QR Code 喙佮弗喙夃抚喔�箞喔囙釜喔ム复喔涏箑喔炧阜喙堗腑喙佮弗喔佮箑喔炧笂喔�',
    '喙€喔ム阜喔�竵喙佮笧喙囙竵喙€喔佮笀喙€喔娻箞喔侧笟喔�笚喔椸傅喙堗笗喙夃腑喔囙竵喔侧福 (1 喔о副喔� / 3 喔о副喔� / 7 喔о副喔� / 30 喔о副喔�)',
    '喔斷覆喔о笝喙屶箓喔�弗喔斷箓喔涏福喙佮竵喔｀浮喔氞腑喔椸箒喔ム箟喔о笝喔� Token 喙勦笡喙冟釜喙堗箖喔娻箟喔囙覆喔權箘喔斷箟喔椸副喔權笚喔�!'
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
  if (ppName) ppName.textContent = `喔娻阜喙堗腑喔氞副喔嵿笂喔�: ${settings.promptPayAccountName || '喙€喔堗俯喔庎覆喔犩福喔撪箤'}`;
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
  if (sysPPName) sysPPName.value = settings.promptPayAccountName || '喙€喔堗俯喔庎覆喔犩福喔撪箤';
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
        <button class="btn-danger" onclick="deleteStep(${idx})" style="background:var(--danger); color:#fff; border:none; padding:6px 12px; border-radius:6px; font-weight:bold; cursor:pointer;">鉁�</button>
      </div>
    `).join('');
  }
}

// 鈹€鈹€鈹€ 3. USER MANAGEMENT & STATE 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
let currentUser = null;

function getRegisteredUsers() {
  const saved = localStorage.getItem('registeredUsers');
  if (saved) {
    try { return JSON.parse(saved); } catch (e) {}
  }
  return [
    {
      _id: 'admin_demo_id',
      username: 'jojomkt1230',
      password: 'gus040245',
      role: 'admin',
      diamonds: 99999,
      botExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];
}

function saveRegisteredUsers(users) {
  localStorage.setItem('registeredUsers', JSON.stringify(users));
}

// 鈹€鈹€鈹€ 4. TOAST & MODAL HELPERS 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
window.showToast = function(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
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
    if (btn) btn.textContent = '馃檲';
  } else {
    input.type = 'password';
    if (btn) btn.textContent = '馃憗锔�';
  }
};

// ─── 5. AUTHENTICATION (LOGIN / REGISTER / LOGOUT) ──────────────────────────

// ── Tab Switcher ──────────────────────────────────────────────────────────────
window.switchTab = function(tabName) {
  console.log('[AUTH] switchTab called:', tabName);
  var loginForm = document.getElementById('login-form');
  var regForm   = document.getElementById('register-form');
  var tabLogin  = document.getElementById('tab-login');
  var tabReg    = document.getElementById('tab-register');

  if (!loginForm || !regForm) {
    console.warn('[AUTH] switchTab: login-form or register-form not found in DOM');
    return;
  }

  if (tabName === 'login') {
    loginForm.classList.remove('hidden');
    regForm.classList.add('hidden');
    if (tabLogin) { tabLogin.classList.add('active'); }
    if (tabReg)   { tabReg.classList.remove('active'); }
  } else {
    loginForm.classList.add('hidden');
    regForm.classList.remove('hidden');
    if (tabLogin) { tabLogin.classList.remove('active'); }
    if (tabReg)   { tabReg.classList.add('active'); }
  }
};

// ── Login ─────────────────────────────────────────────────────────────────────
window.handleLogin = function(event) {
  if (event) event.preventDefault();
  console.log('[AUTH] handleLogin triggered');

  var usernameEl = document.getElementById('login-username');
  var passwordEl = document.getElementById('login-password');
  var errEl      = document.getElementById('login-error');

  if (!usernameEl || !passwordEl) {
    console.error('[AUTH] handleLogin: input elements not found');
    return;
  }

  var username = usernameEl.value.trim();
  var password = passwordEl.value;

  if (errEl) errEl.textContent = '';

  if (!username || !password) {
    if (errEl) errEl.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
    return;
  }

  // Admin bypass
  if (username === 'jojomkt1230' && (password === 'gus040245' || password === 'gusgus040245')) {
    console.log('[AUTH] Admin login success');
    var adminUser = {
      _id: 'admin_demo_id',
      username: 'jojomkt1230',
      password: password,
      role: 'admin',
      diamonds: 99999,
      botExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    currentUser = adminUser;
    localStorage.setItem('token', 'admin_token');
    localStorage.setItem('user', JSON.stringify(currentUser));
    window.showPage('dashboard-page');
    initDashboard();
    window.showToast('เข้าสู่ระบบแผงผู้ดูแลระบบ (' + adminUser.username + ') 👑', 'success');
    return;
  }

  // Local storage lookup
  var users = getRegisteredUsers();
  var found  = users.find(function(u) { return u.username === username && u.password === password; });

  if (found) {
    console.log('[AUTH] User login success:', username);
    currentUser = found;
    localStorage.setItem('token', 'auth_token_' + found.username);
    localStorage.setItem('user', JSON.stringify(currentUser));
    window.showPage('dashboard-page');
    initDashboard();
    window.showToast('เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับ ' + found.username + ' 🎉', 'success');
  } else {
    console.warn('[AUTH] Login failed for:', username);
    if (errEl) errEl.textContent = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
  }
};

// ── Register ──────────────────────────────────────────────────────────────────
window.handleRegister = function(event) {
  if (event) event.preventDefault();
  console.log('[AUTH] handleRegister triggered');

  var usernameEl = document.getElementById('reg-username');
  var passwordEl = document.getElementById('reg-password');
  var confirmEl  = document.getElementById('reg-confirm');
  var errEl      = document.getElementById('register-error');
  var btn        = document.getElementById('register-btn');

  if (!usernameEl || !passwordEl || !confirmEl) {
    console.error('[AUTH] handleRegister: form elements not found');
    return;
  }

  var username = usernameEl.value.trim();
  var password = passwordEl.value;
  var confirm  = confirmEl.value;

  if (errEl) errEl.textContent = '';

  if (!username || username.length < 3) {
    console.warn('[AUTH] Register: username too short');
    if (errEl) errEl.textContent = 'กรุณากรอกชื่อผู้ใช้อย่างน้อย 3 ตัวอักษร';
    return;
  }
  if (password.length < 6) {
    console.warn('[AUTH] Register: password too short');
    if (errEl) errEl.textContent = 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร';
    return;
  }
  if (password !== confirm) {
    console.warn('[AUTH] Register: passwords do not match');
    if (errEl) errEl.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
    return;
  }

  var users = getRegisteredUsers();
  if (users.some(function(u) { return u.username === username; })) {
    console.warn('[AUTH] Register: username already exists:', username);
    if (errEl) errEl.textContent = 'ชื่อผู้ใช้นี้มีในระบบแล้ว กรุณาใช้ชื่ออื่น';
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span> กำลังสมัครสมาชิก...';
  }

  var newUser = {
    _id: 'user_' + Date.now(),
    username: username,
    password: password,
    role: 'user',
    diamonds: 0,
    botExpiry: null
  };
  users.push(newUser);
  saveRegisteredUsers(users);
  console.log('[AUTH] Register success:', username);

  window.showToast('🎉 สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ', 'success');
  window.switchTab('login');

  var loginUserEl = document.getElementById('login-username');
  if (loginUserEl) loginUserEl.value = username;

  usernameEl.value = '';
  passwordEl.value = '';
  confirmEl.value  = '';

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">✨</span> สมัครสมาชิก';
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


// 鈹€鈹€鈹€ 6. DASHBOARD & RENTAL SYSTEM 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

  if (currentUser.botExpiry) {
    const expiry = new Date(currentUser.botExpiry).getTime();
    const diff = expiry - Date.now();
    if (diff > 0) {
      if (homeBotStatusEl) homeBotStatusEl.textContent = '喔�腑喔權箘喔ム笝喙�';
    } else {
      if (homeBotStatusEl) homeBotStatusEl.textContent = '喔�浮喔斷腑喔侧涪喔�';
    }
  } else {
    if (homeBotStatusEl) homeBotStatusEl.textContent = '喔⑧副喔囙箘喔∴箞喙€喔娻箞喔�';
  }

  // Toggle Admin Menu Button Visibility
  const isAdmin = (currentUser.username === 'jojomkt1230' || currentUser.role === 'admin');
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
    window.showToast('喙€喔炧笂喔｀箘喔∴箞喔炧腑 喔佮福喔膏笓喔侧箑喔曕复喔∴箑喔囙复喔權竵喙堗腑喔權竸喔｀副喔� 馃拵', 'error');
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

window.confirmRedeemBot = function() {
  if (!currentUser || !pendingRedeem) return;

  const { days, price } = pendingRedeem;
  const userDiamonds = currentUser.diamonds || 0;

  if (userDiamonds < price) {
    window.showToast('喙€喔炧笂喔｀箘喔∴箞喔炧腑 喔佮福喔膏笓喔侧箑喔曕复喔∴箑喔囙复喔權竵喙堗腑喔權竸喔｀副喔� 馃拵', 'error');
    window.closeModal('confirm-modal');
    return;
  }

  currentUser.diamonds = userDiamonds - price;
  const currentExpiry = currentUser.botExpiry ? new Date(currentUser.botExpiry).getTime() : Date.now();
  const baseTime = Math.max(Date.now(), currentExpiry);
  currentUser.botExpiry = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();

  // Update in registeredUsers list
  const users = getRegisteredUsers();
  const idx = users.findIndex(u => u.username === currentUser.username);
  if (idx !== -1) {
    users[idx] = currentUser;
    saveRegisteredUsers(users);
  }
  localStorage.setItem('user', JSON.stringify(currentUser));

  pendingRedeem = null;
  window.closeModal('confirm-modal');

  initDashboard();
  window.showToast(`喙€喔娻箞喔侧笟喔�笚 ${days} 喔о副喔� 喙€喔｀傅喔⑧笟喔｀箟喔�涪喙佮弗喙夃抚! 馃帀`, 'success');
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

  if (!currentUser || !currentUser.botExpiry) {
    cdDays.textContent = '00';
    cdHours.textContent = '00';
    cdMins.textContent = '00';
    cdSecs.textContent = '00';
    return;
  }

  const expiry = new Date(currentUser.botExpiry).getTime();
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

  if (!currentSelectedSlipFile) {
    window.showToast('กรุณาเลือกรูปสลิปการโอนเงินก่อนครับ 📸', 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⟳</span> กำลังตรวจสอบสลิปผ่าน Thunder v2...';
  }

  if (msgEl) msgEl.textContent = '';

  const backendUrl = window.BACKEND_URL || 'http://localhost:5000/api';

  try {
    const token = localStorage.getItem('token');
    
    // 1. Create Server-Side Order
    const orderRes = await axios.post(`${backendUrl}/topup/orders/create`, {
      amountBaht: 100
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!orderRes.data || !orderRes.data.orderId) {
      throw new Error('ไม่สามารถสร้างคำสั่งซื้อจากเซิร์ฟเวอร์ได้');
    }

    const orderId = orderRes.data.orderId;

    // 2. Submit Slip Image to Backend Thunder v2 Verification Endpoint
    const formData = new FormData();
    formData.append('image', currentSelectedSlipFile);
    formData.append('orderId', orderId);

    const verifyRes = await axios.post(`${backendUrl}/topup/verify-slip`, formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });

    if (verifyRes.data && verifyRes.data.status === 'approved') {
      currentUser.diamonds = verifyRes.data.diamonds || ((currentUser.diamonds || 0) + (orderRes.data.creditToReceive || 100));
      localStorage.setItem('user', JSON.stringify(currentUser));

      window.removeSlip();
      initDashboard();
      window.showToast(verifyRes.data.message || '🎉 เติมเงินสำเร็จผ่าน Thunder v2!', 'success');
    } else {
      window.showToast(`❌ เติมเงินไม่สำเร็จ: ${verifyRes.data?.error || 'สลิปไม่ผ่านเงื่อนไขความปลอดภัย'}`, 'error');
    }
  } catch (err) {
    console.error('Slip Verification error:', err.message);
    const errMessage = err.response?.data?.error || err.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ตรวจสอบสลิป';
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
        <div style="font-size:3rem; margin-bottom:10px;">馃摥</div>
        <h3 style="color:var(--text-secondary);">喔⑧副喔囙箘喔∴箞喔∴傅喔傕箟喔�浮喔灌弗喔佮覆喔｀箑喔曕复喔∴箑喔囙复喔�</h3>
        <p style="color:var(--text-muted); font-size:0.9rem; margin-top:5px;">喙€喔∴阜喙堗腑喔勦父喔撪箓喔�笝喙€喔囙复喔權箒喔ム赴喔�箞喔囙釜喔ム复喔� 喔涏福喔班抚喔编笗喔脆竵喔侧福喙€喔曕复喔∴箑喔囙复喔權笀喔班箒喔�笖喔囙競喔多箟喔權笚喔掂箞喔權傅喙堗竸喔｀副喔�</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = history.map(item => `
    <div class="activity-card card-panel" style="display:flex; justify-content:space-between; align-items:center; padding:16px; margin-bottom:12px; border-radius:10px;">
      <div>
        <div style="font-weight:700; color:var(--primary); font-size:1.05rem;">馃挵 喙€喔曕复喔∴箑喔囙复喔� ${item.amount} 喔氞覆喔� (+${item.diamonds} 馃拵)</div>
        <div style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">喔�箟喔侧竾喔�复喔�: ${item.transRef} | 喙€喔о弗喔�: ${item.createdAt}</div>
      </div>
      <div>
        <span class="status-badge ${item.status === 'approved' ? 'success' : 'danger'}" style="padding:6px 12px; border-radius:20px; font-weight:700; font-size:0.85rem; background:${item.status === 'approved' ? 'rgba(0,255,170,0.2)' : 'rgba(255,51,102,0.2)'}; color:${item.status === 'approved' ? 'var(--accent)' : 'var(--danger)'}; border:1px solid ${item.status === 'approved' ? 'var(--accent)' : 'var(--danger)'};">
          ${item.status === 'approved' ? '鉁� 喔�赋喙€喔｀箛喔�' : '鉂� 喙勦浮喙堗釜喔赤箑喔｀箛喔�'}
        </span>
      </div>
    </div>
  `).join('');
}

// 鈹€鈹€鈹€ 8. ADMIN PANEL & USER MANAGEMENT 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
        <div style="font-size:2rem;">馃懃</div>
        <p style="color:var(--text-muted); margin-top:6px;">喔⑧副喔囙箘喔∴箞喔∴傅喔�浮喔侧笂喔脆竵喙冟笝喔｀赴喔氞笟</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="admin-table" style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--border-bright); text-align:left; color:var(--primary);">
          <th style="padding:10px;">喔娻阜喙堗腑喔溹腹喙夃箖喔娻箟</th>
          <th style="padding:10px;">喔�复喔椸笜喔脆箤</th>
          <th style="padding:10px;">喙€喔炧笂喔� 馃拵</th>
          <th style="padding:10px;">喔�浮喔斷腑喔侧涪喔膏笟喔�笚</th>
          <th style="padding:10px; text-align:right;">喔堗副喔斷竵喔侧福</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(u => `
          <tr style="border-bottom:1px solid rgba(0,212,255,0.15);">
            <td style="padding:12px; font-weight:700;">${u.username}</td>
            <td style="padding:12px;"><span style="padding:4px 8px; border-radius:12px; font-size:0.8rem; background:${u.role === 'admin' ? 'rgba(255,170,0,0.2)' : 'rgba(0,212,255,0.2)'}; color:${u.role === 'admin' ? '#ffcc00' : 'var(--primary)'}">${u.role === 'admin' ? '馃憫 喙佮腑喔斷浮喔脆笝' : '馃懁 喔�浮喔侧笂喔脆竵'}</span></td>
            <td style="padding:12px; color:var(--accent); font-weight:700;">${u.diamonds || 0}</td>
            <td style="padding:12px; font-size:0.85rem;">${u.botExpiry ? new Date(u.botExpiry).toLocaleString('th-TH') : '喔⑧副喔囙箘喔∴箞喙€喔娻箞喔�'}</td>
            <td style="padding:12px; text-align:right;">
              <button onclick="openEditUserModal('${u._id}')" style="background:rgba(0,212,255,0.2); color:var(--primary); border:1px solid var(--primary); padding:4px 10px; border-radius:6px; font-weight:700; cursor:pointer; margin-right:6px;">鉁忥笍 喙佮竵喙夃箘喔�</button>
              ${u.username !== 'jojomkt1230' ? `<button onclick="deleteUser('${u._id}')" style="background:rgba(255,51,102,0.2); color:var(--danger); border:1px solid var(--danger); padding:4px 10px; border-radius:6px; font-weight:700; cursor:pointer;">馃棏锔� 喔ム笟</button>` : ''}
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
  const addDaysInput = document.getElementById('edit-user-add-days');

  if (idInput) idInput.value = user._id || user.username;
  if (userInput) userInput.value = user.username;
  if (passInput) passInput.value = '';
  if (diaInput) diaInput.value = user.diamonds || 0;
  if (addDaysInput) addDaysInput.value = '';

  window.openModal('user-modal');
};

window.saveEditedUser = function() {
  const userId = document.getElementById('edit-user-id')?.value;
  const newUsername = document.getElementById('edit-user-username')?.value.trim();
  const newPassword = document.getElementById('edit-user-password')?.value;
  const newDiamonds = parseInt(document.getElementById('edit-user-diamonds')?.value || 0);
  const addDays = parseInt(document.getElementById('edit-user-add-days')?.value || 0);

  if (!userId || !newUsername) return;

  const users = getRegisteredUsers();
  const idx = users.findIndex(u => u._id === userId);
  if (idx === -1) return;

  users[idx].username = newUsername;
  if (newPassword) users[idx].password = newPassword;
  users[idx].diamonds = newDiamonds;

  if (addDays > 0) {
    const currentExp = users[idx].botExpiry ? new Date(users[idx].botExpiry).getTime() : Date.now();
    const base = Math.max(Date.now(), currentExp);
    users[idx].botExpiry = new Date(base + addDays * 24 * 60 * 60 * 1000).toISOString();
  }

  saveRegisteredUsers(users);

  if (currentUser && currentUser._id === userId) {
    currentUser = users[idx];
    localStorage.setItem('user', JSON.stringify(currentUser));
    initDashboard();
  }

  window.closeModal('edit-user-modal');
  renderAdminUsersTable();
  updateAdminPanelStats();
  window.showToast('馃捑 喔氞副喔權笚喔多竵喙佮竵喙夃箘喔傕競喙夃腑喔∴腹喔ム釜喔∴覆喔娻复喔佮箑喔｀傅喔⑧笟喔｀箟喔�涪喙佮弗喙夃抚', 'success');
};

window.deleteSelectedUser = function() {
  const userId = document.getElementById('edit-user-id')?.value;
  if (userId) window.deleteUser(userId);
};

window.deleteUser = function(userId) {
  const users = getRegisteredUsers();
  const user = users.find(u => u._id === userId);
  if (!user) return;

  if (user.username === 'jojomkt1230') {
    window.showToast('喙勦浮喙堗釜喔侧浮喔侧福喔栢弗喔氞笢喔灌箟喔斷腹喙佮弗喔｀赴喔氞笟喔�弗喔编竵喙勦笖喙�', 'error');
    return;
  }

  if (confirm(`喔勦父喔撪笗喙夃腑喔囙竵喔侧福喔ム笟喔�浮喔侧笂喔脆竵 "${user.username}" 喙冟笂喙堗斧喔｀阜喔�箘喔∴箞?`)) {
    const updated = users.filter(u => u._id !== userId);
    saveRegisteredUsers(updated);

    window.closeModal('edit-user-modal');
    renderAdminUsersTable();
    updateAdminPanelStats();
    window.showToast(`馃棏锔� 喔ム笟喔�浮喔侧笂喔脆竵 "${user.username}" 喙€喔｀傅喔⑧笟喔｀箟喔�涪喙佮弗喙夃抚`, 'info');
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
        <div style="font-size:2rem;">馃挰</div>
        <p style="color:var(--text-muted); margin-top:6px;">喔⑧副喔囙箘喔∴箞喔∴傅喔傕箟喔�浮喔灌弗喔佮覆喔｀箑喔曕复喔∴箑喔囙复喔�</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="admin-table" style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--border-bright); text-align:left; color:var(--primary);">
          <th style="padding:10px;">喔�浮喔侧笂喔脆竵</th>
          <th style="padding:10px;">喔堗赋喔權抚喔權箑喔囙复喔�</th>
          <th style="padding:10px;">喙€喔炧笂喔� 馃拵</th>
          <th style="padding:10px;">喙€喔ム競喔�弗喔脆笡</th>
          <th style="padding:10px;">喙€喔о弗喔�</th>
          <th style="padding:10px;">喔�笘喔侧笝喔�</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(t => `
          <tr style="border-bottom:1px solid rgba(0,212,255,0.15);">
            <td style="padding:10px; font-weight:700;">${t.username}</td>
            <td style="padding:10px; color:var(--accent); font-weight:700;">${t.amount} 喔氞覆喔�</td>
            <td style="padding:10px; font-weight:700;">${t.diamonds}</td>
            <td style="padding:10px; font-size:0.85rem;">${t.transRef}</td>
            <td style="padding:10px; font-size:0.85rem;">${t.createdAt}</td>
            <td style="padding:10px;">
              <span style="padding:4px 8px; border-radius:12px; font-size:0.8rem; background:${t.status === 'approved' ? 'rgba(0,255,170,0.2)' : 'rgba(255,51,102,0.2)'}; color:${t.status === 'approved' ? 'var(--accent)' : 'var(--danger)'}">
                ${t.status === 'approved' ? '鉁� 喔�笝喔膏浮喔编笗喔脆箒喔ム箟喔�' : '鉂� 喔涏笍喔脆箑喔�笜'}
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
  window.showToast('馃捑 喔氞副喔權笚喔多竵喔佮覆喔｀笗喔编箟喔囙竸喙堗覆喙€喔｀傅喔⑧笟喔｀箟喔�涪喙佮弗喙夃抚', 'success');
};

window.savePromptPaySettings = function() {
  const ppNum = document.getElementById('sys-promptpay')?.value.trim();
  const ppName = document.getElementById('sys-promptpay-name')?.value.trim();

  const settings = getSystemSettings();
  if (ppNum) settings.promptPayNumber = ppNum;
  if (ppName) settings.promptPayAccountName = ppName;

  saveSystemSettings(settings);
  window.showToast('馃捑 喔氞副喔權笚喔多竵喔傕箟喔�浮喔灌弗喔炧福喙夃腑喔∴箑喔炧涪喙� & 喔娻阜喙堗腑喔氞副喔嵿笂喔掂笢喔灌箟喔｀副喔氞箑喔囙复喔權箑喔｀傅喔⑧笟喔｀箟喔�涪喙佮弗喙夃抚', 'success');
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
    window.showToast('馃柤锔� 喔�副喔涏箓喔�弗喔斷福喔灌笡 QR Code PromptPay 喔�赋喙€喔｀箛喔�', 'success');
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
  window.showToast('馃捑 喔氞副喔權笚喔多竵喔傕箟喔�浮喔灌弗喔氞腑喔椸箑喔｀傅喔⑧笟喔｀箟喔�涪喙佮弗喙夃抚', 'success');
};

window.massCompensation = function() {
  const timeInput = document.getElementById('comp-time');
  const unitSelect = document.getElementById('comp-unit');
  const noteInput = document.getElementById('comp-note');

  const addTime = parseInt(timeInput?.value || 0);
  const unit = unitSelect?.value || 'hours';

  if (addTime <= 0) {
    window.showToast('喔佮福喔膏笓喔侧福喔班笟喔膏笀喔赤笝喔о笝喙€喔о弗喔侧笚喔掂箞喔曕箟喔�竾喔佮覆喔｀笂喔斷箑喔娻涪', 'error');
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

  const unitText = unit === 'hours' ? '喔娻副喙堗抚喙傕浮喔�' : '喔о副喔�';
  window.showToast(`馃巵 喔娻笖喙€喔娻涪喙€喔о弗喔侧箖喔娻箟喔囙覆喔� ${addTime} ${unitText} 喙冟斧喙夃釜喔∴覆喔娻复喔佮笚喔膏竵喔勦笝喙€喔｀傅喔⑧笟喔｀箟喔�涪喙佮弗喙夃抚!`, 'success');
};

// 鈹€鈹€鈹€ 9. DOM READY INITIALIZATION 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
document.addEventListener('DOMContentLoaded', () => {
  // Bind Tab Switchers
  const tabLogin = document.getElementById('tab-login');
  const tabReg = document.getElementById('tab-register');
  if (tabLogin) tabLogin.addEventListener('click', () => window.switchTab('login'));
  if (tabReg) tabReg.addEventListener('click', () => window.switchTab('register'));

  // Bind Form Submissions
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');
  if (loginForm) loginForm.addEventListener('submit', (e) => window.handleLogin(e));
  if (regForm) regForm.addEventListener('submit', (e) => window.handleRegister(e));

  // Note: register-btn is type="submit" inside register-form.
  // The form 'submit' listener above already handles it.
  // This extra click listener ensures it also works as a plain click.
  const regBtn = document.getElementById('register-btn');
  if (regBtn) {
    regBtn.addEventListener('click', function(e) {
      console.log('[AUTH] register-btn clicked, type:', e.target.type);
      // If the button is inside a form it will trigger 'submit' automatically.
      // Only call manually if NOT inside a <form> context (safety net).
      if (!regForm) {
        e.preventDefault();
        window.handleRegister(e);
      }
    });
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
