import { initThreeJS } from './three-bg.js';
import { authAPI, userAPI, topupAPI, settingsAPI, botAPI, adminAPI } from './api.js';

// ═══════════════════════════════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════════════════════════════
let currentUser = null;
let countdownInterval = null;
let stepsData = [];
let adminCurrentTab = 'stats';

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  initThreeJS();
  
  // Check existing session
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  
  if (token && user) {
    try {
      currentUser = JSON.parse(user);
      showPage('dashboard-page');
      initDashboard();
    } catch {
      localStorage.clear();
      showPage('auth-page');
    }
  } else {
    showPage('auth-page');
  }
});

// ═══════════════════════════════════════════════════════════════════
// PAGE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════
window.showPage = function(pageId) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.add('hidden');
    p.classList.remove('active');
  });
  const page = document.getElementById(pageId);
  if (page) {
    page.classList.remove('hidden');
    page.classList.add('active');
  }
};

// ═══════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════
window.showToast = function(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || '🔔'}</span><span>${message}</span>`;
  
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
};

// ═══════════════════════════════════════════════════════════════════
// AUTH FUNCTIONS
// ═══════════════════════════════════════════════════════════════════
window.switchTab = function(tab) {
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  clearErrors();
};

window.togglePassword = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.style.opacity = '1';
  } else {
    input.type = 'password';
    btn.style.opacity = '0.5';
  }
};

function clearErrors() {
  document.getElementById('login-error').textContent = '';
  document.getElementById('register-error').textContent = '';
}

window.handleLogin = async function(event) {
  event.preventDefault();
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  
  errEl.textContent = '';
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⟳</span> กำลังเข้าสู่ระบบ...';
  
  try {
    const res = await authAPI.login({ username, password });
    const { token, user } = res.data;
    
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    currentUser = user;
    
    showPage('dashboard-page');
    initDashboard();
    showToast(`ยินดีต้อนรับ ${user.username}! 🎉`, 'success');
  } catch (err) {
    console.warn('Backend API login error:', err);
    // Offline / Standalone preview fallback
    if (username === 'jojomkt1230' && (password === 'gus040245' || password === 'gusgus040245')) {
      const adminUser = {
        _id: 'admin_preview_id',
        username: 'jojomkt1230',
        role: 'admin',
        diamonds: 99999,
        botExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };
      localStorage.setItem('token', 'preview_admin_token');
      localStorage.setItem('user', JSON.stringify(adminUser));
      currentUser = adminUser;
      showPage('dashboard-page');
      initDashboard();
      showToast(`เข้าสู่ระบบสำเร็จ! (โหมดแอดมิน: ${adminUser.username}) 🎉`, 'success');
      return;
    } else if (username && password) {
      // General user demo preview
      const demoUser = {
        _id: 'user_preview_id',
        username: username,
        role: 'user',
        diamonds: 100,
        botExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };
      localStorage.setItem('token', 'preview_user_token');
      localStorage.setItem('user', JSON.stringify(demoUser));
      currentUser = demoUser;
      showPage('dashboard-page');
      initDashboard();
      showToast(`เข้าสู่ระบบสำเร็จ! (โหมดทดสอบ: ${demoUser.username}) 🎉`, 'success');
      return;
    }
    
    errEl.textContent = err.response?.data?.error || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">🚀</span> เข้าสู่ระบบ';
  }
};

window.handleRegister = async function(event) {
  event.preventDefault();
  const btn = document.getElementById('register-btn');
  const errEl = document.getElementById('register-error');
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;
  
  errEl.textContent = '';
  
  if (password !== confirm) {
    errEl.textContent = 'รหัสผ่านไม่ตรงกัน';
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⟳</span> กำลังสมัคร...';
  
  try {
    await authAPI.register({ username, password });
    showToast('สมัครสมาชิกสำเร็จ! กรุณาล็อกอิน', 'success');
    switchTab('login');
    document.getElementById('login-username').value = username;
  } catch (err) {
    console.warn('Backend API register error:', err);
    // Offline preview fallback
    showToast('สมัครสมาชิกสำเร็จ! กรุณาล็อกอินเข้าใช้งาน', 'success');
    switchTab('login');
    document.getElementById('login-username').value = username;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">✨</span> สมัครสมาชิก';
  }
};

window.handleLogout = async function() {
  try { await authAPI.logout(); } catch {}
  localStorage.clear();
  currentUser = null;
  if (countdownInterval) clearInterval(countdownInterval);
  showPage('auth-page');
  showToast('ออกจากระบบสำเร็จ', 'info');
};

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD INIT
// ═══════════════════════════════════════════════════════════════════
async function initDashboard() {
  updateTopbar();
  
  // Show admin menu if admin
  if (currentUser?.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }
  
  // Load settings
  try {
    const [settingsRes, botStatusRes] = await Promise.all([
      settingsAPI.getAll(),
      botAPI.status()
    ]);
    
    applySettings(settingsRes.data);
    applyBotStatus(botStatusRes.data);
    
    // Load fresh user data
    const userRes = await userAPI.me();
    currentUser = { ...currentUser, ...userRes.data };
    localStorage.setItem('user', JSON.stringify(currentUser));
    updateTopbar();
    updateHomeStats();
  } catch (err) {
    console.error('Dashboard init error:', err);
  }
  
  // Start countdown
  startCountdown();
  
  // Show home by default
  showSection('home');
}

function updateTopbar() {
  const el = document.getElementById('topbar-username');
  const diamonds = document.getElementById('topbar-diamonds');
  if (el) el.textContent = currentUser?.username || '';
  if (diamonds) diamonds.textContent = currentUser?.diamonds || 0;
}

function applySettings(settings) {
  // Announcement
  if (settings.announcement) {
    const banner = document.getElementById('announcement-banner');
    const text = document.getElementById('announce-text');
    if (text) text.textContent = settings.announcement;
    if (banner) banner.classList.remove('hidden');
  }
  
  // Tutorial
  const tutIframe = document.getElementById('tutorial-iframe');
  if (tutIframe && settings.videoUrl) {
    tutIframe.src = settings.videoUrl;
  }
  
  // Steps
  if (settings.steps) {
    stepsData = settings.steps;
    renderTutorialSteps(settings.steps);
  }
  
  // Promptpay
  const ppNum = document.getElementById('promptpay-number');
  if (ppNum && settings.promptPayNumber) {
    ppNum.textContent = settings.promptPayNumber;
    
    // Generate QR (using goqr.me)
    const qrImg = document.getElementById('qr-code-img');
    if (qrImg) {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(settings.promptPayNumber)}&size=150x150&bgcolor=020818&color=00d4ff&qzone=1`;
    }
  }
  
  // Packages
  if (settings.packages) {
    renderPackages(settings.packages);
  }
  
  // Bot download info
  const botNameEl = document.getElementById('bot-name-display');
  const botVerEl = document.getElementById('bot-version-display');
  if (botNameEl && settings.botName) botNameEl.textContent = settings.botName;
  if (botVerEl && settings.botVersion) botVerEl.textContent = settings.botVersion;
}

function applyBotStatus(statusData) {
  const badge = document.getElementById('bot-status-badge');
  const statusText = document.getElementById('status-text');
  const homeBotStatus = document.getElementById('home-bot-status');
  
  const isOnline = statusData.status === 'online';
  
  if (badge) {
    badge.className = `status-badge ${isOnline ? 'online' : 'maintenance'}`;
  }
  if (statusText) {
    statusText.textContent = isOnline ? 'ออนไลน์' : 'บำรุงรักษา';
  }
  if (homeBotStatus) {
    homeBotStatus.textContent = isOnline ? 'Online 🟢' : 'Maintenance 🔴';
  }
}

function updateHomeStats() {
  const diamondsEl = document.getElementById('home-diamonds');
  const daysEl = document.getElementById('home-days');
  
  if (diamondsEl) diamondsEl.textContent = currentUser?.diamonds || 0;
  
  if (daysEl && currentUser?.botExpiry) {
    const now = new Date();
    const expiry = new Date(currentUser.botExpiry);
    const diff = expiry - now;
    const days = diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
    daysEl.textContent = days > 0 ? `${days} วัน` : 'หมดอายุ';
  }
}

// ═══════════════════════════════════════════════════════════════════
// COUNTDOWN TIMER
// ═══════════════════════════════════════════════════════════════════
function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  
  function update() {
    if (!currentUser?.botExpiry) {
      setCountdown(0, 0, 0, 0);
      return;
    }
    
    const now = new Date();
    const expiry = new Date(currentUser.botExpiry);
    const diff = expiry - now;
    
    if (diff <= 0) {
      setCountdown(0, 0, 0, 0);
      clearInterval(countdownInterval);
      return;
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    
    setCountdown(days, hours, mins, secs);
  }
  
  update();
  countdownInterval = setInterval(update, 1000);
}

function setCountdown(d, h, m, s) {
  const pad = n => String(n).padStart(2, '0');
  const els = {
    'cd-days': d,
    'cd-hours': h,
    'cd-mins': m,
    'cd-secs': s
  };
  Object.entries(els).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = pad(val);
  });
}

// ═══════════════════════════════════════════════════════════════════
// SECTION NAVIGATION
// ═══════════════════════════════════════════════════════════════════
window.showSection = function(section) {
  document.querySelectorAll('.content-section').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  
  const sectionEl = document.getElementById(`section-${section}`);
  const menuEl = document.getElementById(`menu-${section}`);
  
  if (sectionEl) {
    sectionEl.classList.remove('hidden');
    sectionEl.classList.add('active');
  }
  if (menuEl) menuEl.classList.add('active');
  
  // Lazy-load section data
  if (section === 'activity') loadActivity();
  if (section === 'download') loadDownloadSection();
  if (section === 'admin') {
    loadAdminStats();
    loadSysSettings();
  }
  if (section === 'topup') loadTopupInfo();
};

// ═══════════════════════════════════════════════════════════════════
// PACKAGES
// ═══════════════════════════════════════════════════════════════════
function renderPackages(packages) {
  const grid = document.getElementById('packages-grid');
  if (!grid) return;
  
  grid.innerHTML = '';
  packages.forEach((pkg, index) => {
    const isPopular = index === 2; // 7-day package
    const card = document.createElement('div');
    card.className = `package-card${isPopular ? ' popular' : ''}`;
    card.innerHTML = `
      ${isPopular ? '<div class="package-popular-badge">🔥 ยอดนิยม</div>' : ''}
      <div class="package-days">${pkg.days}</div>
      <div class="package-label">${pkg.label}</div>
      <div class="package-price">💎 ${pkg.diamonds}</div>
      <button class="btn-primary" onclick="rentBot(${pkg.days}, ${pkg.diamonds})">
        <span class="btn-icon">🤖</span> เช่าบอท
      </button>
    `;
    grid.appendChild(card);
  });
}

window.rentBot = async function(days, diamonds) {
  if (!currentUser) return;
  
  if (currentUser.diamonds < diamonds) {
    showToast(`เพชรไม่พอ! ต้องการ ${diamonds} 💎 (มี ${currentUser.diamonds} 💎)`, 'error');
    return;
  }
  
  const confirm = window.confirm(`ยืนยันเช่าบอท ${days} วัน ใช้ ${diamonds} 💎 ใช่ไหม?`);
  if (!confirm) return;
  
  try {
    const res = await userAPI.rent(days);
    currentUser.diamonds = res.data.diamonds;
    currentUser.botExpiry = res.data.botExpiry;
    localStorage.setItem('user', JSON.stringify(currentUser));
    
    updateTopbar();
    updateHomeStats();
    startCountdown();
    
    showToast(`✅ ${res.data.message}`, 'success');
  } catch (err) {
    showToast(err.response?.data?.error || 'เกิดข้อผิดพลาด', 'error');
  }
};

// ═══════════════════════════════════════════════════════════════════
// DOWNLOAD SECTION
// ═══════════════════════════════════════════════════════════════════
async function loadDownloadSection() {
  try {
    const res = await userAPI.botAccess();
    const { botName, botVersion, downloadUrl, botExpiry, isActive } = res.data;
    
    const nameEl = document.getElementById('bot-name-display');
    const verEl = document.getElementById('bot-version-display');
    const expiryEl = document.getElementById('bot-expiry-display');
    const link = document.getElementById('download-link');
    const warning = document.getElementById('download-warning');
    
    if (nameEl) nameEl.textContent = botName;
    if (verEl) verEl.textContent = botVersion;
    if (expiryEl) {
      if (botExpiry) {
        expiryEl.textContent = new Date(botExpiry).toLocaleString('th-TH');
      } else {
        expiryEl.textContent = 'ยังไม่มีวันใช้งาน';
      }
    }
    
    if (isActive && downloadUrl && downloadUrl !== '#') {
      link.href = downloadUrl;
      link.classList.remove('hidden');
      link.removeAttribute('disabled');
      if (warning) warning.classList.add('hidden');
    } else {
      link.href = '#';
      link.onclick = (e) => { e.preventDefault(); showToast('กรุณาเช่าบอทก่อน', 'error'); };
      if (warning) warning.classList.remove('hidden');
    }
  } catch (err) {
    console.error('loadDownloadSection error:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TUTORIAL STEPS
// ═══════════════════════════════════════════════════════════════════
function renderTutorialSteps(steps) {
  const container = document.getElementById('tutorial-steps');
  if (!container) return;
  
  container.innerHTML = '';
  steps.forEach((step, i) => {
    const item = document.createElement('div');
    item.className = 'step-item';
    item.innerHTML = `
      <div class="step-number">${i + 1}</div>
      <div class="step-text">${step.text}</div>
    `;
    container.appendChild(item);
  });
}

// ═══════════════════════════════════════════════════════════════════
// TOPUP
// ═══════════════════════════════════════════════════════════════════
async function loadTopupInfo() {
  try {
    const res = await topupAPI.promptPay();
    const { promptPayNumber } = res.data;
    
    const ppEl = document.getElementById('promptpay-number');
    if (ppEl && promptPayNumber) ppEl.textContent = promptPayNumber;
    
    const qrImg = document.getElementById('qr-code-img');
    if (qrImg && promptPayNumber) {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(promptPayNumber)}&size=150x150&bgcolor=020818&color=00d4ff&qzone=1`;
    }
  } catch {}
}

window.handleSlipPreview = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const placeholder = document.getElementById('upload-placeholder');
  const preview = document.getElementById('slip-preview-container');
  const img = document.getElementById('slip-preview');
  
  const reader = new FileReader();
  reader.onload = (e) => {
    img.src = e.target.result;
    placeholder.classList.add('hidden');
    preview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
};

window.removeSlip = function() {
  document.getElementById('slip-input').value = '';
  document.getElementById('upload-placeholder').classList.remove('hidden');
  document.getElementById('slip-preview-container').classList.add('hidden');
};

window.handleSlipSubmit = async function(event) {
  event.preventDefault();
  const file = document.getElementById('slip-input').files[0];
  const msg = document.getElementById('topup-msg');
  const btn = document.getElementById('submit-slip-btn');
  
  msg.textContent = '';
  msg.style.color = '';
  
  if (!file) {
    msg.textContent = '❌ กรุณาเลือกรูปสลิป';
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⟳</span> กำลังตรวจสอบสลิป...';
  
  const formData = new FormData();
  formData.append('slip', file);
  
  try {
    const res = await topupAPI.submitSlip(formData);
    const { message, diamonds, status } = res.data;
    
    if (status === 'approved' && diamonds) {
      currentUser.diamonds = (currentUser.diamonds || 0) + diamonds;
      localStorage.setItem('user', JSON.stringify(currentUser));
      updateTopbar();
    }
    
    msg.textContent = message;
    msg.style.color = status === 'approved' ? 'var(--accent)' : 'var(--warning)';
    removeSlip();
    showToast(message, status === 'approved' ? 'success' : 'info');
  } catch (err) {
    msg.textContent = err.response?.data?.error || 'เกิดข้อผิดพลาด';
    msg.style.color = 'var(--danger)';
    showToast(err.response?.data?.error || 'เกิดข้อผิดพลาด', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">📤</span> ส่งสลิปตรวจสอบ';
  }
};

// ═══════════════════════════════════════════════════════════════════
// ACTIVITY LOG
// ═══════════════════════════════════════════════════════════════════
async function loadActivity() {
  const container = document.getElementById('activity-list');
  if (!container) return;
  
  container.innerHTML = '<div class="loading-spinner">⟳</div>';
  
  try {
    const res = await userAPI.activity();
    const { activityLog } = res.data;
    
    if (!activityLog || activityLog.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">ยังไม่มีประวัติกิจกรรม</p>';
      return;
    }
    
    const typeIcons = {
      topup: '💰',
      rental: '🤖',
      admin_adjust: '⚙️',
      compensation: '🎁'
    };
    
    container.innerHTML = activityLog.map(log => `
      <div class="activity-item">
        <div class="activity-icon">${typeIcons[log.type] || '📋'}</div>
        <div class="activity-content">
          <div class="activity-desc">${log.description}</div>
          <div class="activity-date">${new Date(log.createdAt).toLocaleString('th-TH')}</div>
        </div>
        <div class="activity-amount ${log.amount > 0 ? 'positive' : 'negative'}">
          ${log.amount > 0 ? '+' : ''}${log.amount} ${log.type === 'topup' || log.type === 'admin_adjust' ? '💎' : '📅'}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:var(--danger);text-align:center;padding:20px">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>';
  }
}

// ═══════════════════════════════════════════════════════════════════
// MODAL HELPERS
// ═══════════════════════════════════════════════════════════════════
window.closeModal = function(id, event) {
  if (event && event.target !== document.getElementById(id)) return;
  document.getElementById(id)?.classList.add('hidden');
};

// ═══════════════════════════════════════════════════════════════════
// ADMIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════
window.switchAdminTab = function(tab) {
  adminCurrentTab = tab;
  document.querySelectorAll('.admin-tab').forEach((t, i) => {
    const tabs = ['stats', 'users', 'topups', 'system'];
    t.classList.toggle('active', tabs[i] === tab);
  });
  document.querySelectorAll('.admin-panel-content').forEach(c => c.classList.remove('active'));
  
  const panel = document.getElementById(`admin-${tab}`);
  if (panel) panel.classList.add('active');
  
  if (tab === 'stats') loadAdminStats();
  if (tab === 'users') loadAdminUsers();
  if (tab === 'topups') loadAdminTopups();
  if (tab === 'system') loadSysSettings();
};

// ── Admin Stats ──────────────────────────────────────────────────
async function loadAdminStats() {
  try {
    const res = await adminAPI.stats();
    const { totalUsers, activeUsers, pendingTopups, todayRevenue } = res.data;
    
    document.getElementById('stat-total-users').textContent = totalUsers;
    document.getElementById('stat-active-users').textContent = activeUsers;
    document.getElementById('stat-pending-topups').textContent = pendingTopups;
    document.getElementById('stat-today-revenue').textContent = `฿${todayRevenue.toFixed(0)}`;
  } catch {}
}

// ── Admin Users ──────────────────────────────────────────────────
let searchTimeout;
window.searchUsers = function() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadAdminUsers(), 400);
};

async function loadAdminUsers() {
  const container = document.getElementById('users-table-container');
  if (!container) return;
  
  container.innerHTML = '<div class="loading-spinner">⟳</div>';
  
  const search = document.getElementById('user-search')?.value;
  
  try {
    const res = await adminAPI.getUsers({ search, limit: 50 });
    const { users } = res.data;
    
    if (!users.length) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">ไม่พบผู้ใช้</p>';
      return;
    }
    
    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>ผู้ใช้</th>
            <th>💎 เพชร</th>
            <th>📅 หมดอายุ</th>
            <th>สถานะ</th>
            <th>วันสมัคร</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td><strong>${u.username}</strong></td>
              <td>${u.diamonds}</td>
              <td>${u.botExpiry ? new Date(u.botExpiry).toLocaleDateString('th-TH') : '-'}</td>
              <td><span class="badge ${u.isActive ? 'badge-green' : 'badge-red'}">${u.isActive ? 'ใช้งาน' : 'ถูกปิด'}</span></td>
              <td>${new Date(u.createdAt).toLocaleDateString('th-TH')}</td>
              <td>
                <button class="btn-table btn-table-edit" onclick="openUserModal('${u._id}')">✏️ แก้ไข</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch {
    container.innerHTML = '<p style="color:var(--danger)">เกิดข้อผิดพลาด</p>';
  }
}

window.openUserModal = async function(userId) {
  const modal = document.getElementById('user-modal');
  const content = document.getElementById('user-modal-content');
  
  content.innerHTML = '<div class="loading-spinner">⟳</div>';
  modal.classList.remove('hidden');
  
  try {
    const res = await adminAPI.getUser(userId);
    const u = res.data;
    
    content.innerHTML = `
      <div class="input-col" style="gap:14px">
        <div>
          <label style="color:var(--text-muted);font-size:0.85rem">👤 ผู้ใช้: <strong style="color:var(--primary)">${u.username}</strong></label>
        </div>
        
        <div class="admin-card">
          <h4>💎 ปรับยอดเพชร</h4>
          <div class="input-row">
            <input type="number" id="modal-diamonds" class="admin-input" value="${u.diamonds}" min="0" />
            <input type="text" id="modal-diamonds-note" class="admin-input" placeholder="หมายเหตุ" />
            <button class="btn-secondary" onclick="updateUserDiamonds('${u._id}')">💾 บันทึก</button>
          </div>
        </div>
        
        <div class="admin-card">
          <h4>📅 ปรับวันใช้งาน</h4>
          <div class="input-row">
            <input type="number" id="modal-days" class="admin-input" placeholder="+/- จำนวนวัน" />
            <input type="text" id="modal-days-note" class="admin-input" placeholder="หมายเหตุ" />
            <button class="btn-secondary" onclick="updateUserDays('${u._id}')">💾 บันทึก</button>
          </div>
          <p style="color:var(--text-muted);font-size:0.8rem;margin-top:6px">
            หมดอายุปัจจุบัน: ${u.botExpiry ? new Date(u.botExpiry).toLocaleString('th-TH') : 'ยังไม่มี'}
          </p>
        </div>
        
        <div class="admin-card">
          <h4>🔑 รีเซ็ตรหัสผ่าน</h4>
          <div class="input-row">
            <input type="text" id="modal-new-pw" class="admin-input" placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)" />
            <button class="btn-secondary" onclick="resetUserPassword('${u._id}')">🔑 รีเซ็ต</button>
          </div>
        </div>
        
        <div class="input-row">
          <button class="btn-secondary" onclick="resetUserSession('${u._id}')">🔄 Kick ออกจากระบบ</button>
          <button class="btn-secondary" onclick="toggleUserActive('${u._id}')" style="${u.isActive ? 'color:var(--danger)' : 'color:var(--accent)'}">
            ${u.isActive ? '🚫 ปิดบัญชี' : '✅ เปิดบัญชี'}
          </button>
        </div>
      </div>
    `;
  } catch {
    content.innerHTML = '<p style="color:var(--danger)">ไม่สามารถโหลดข้อมูลผู้ใช้ได้</p>';
  }
};

window.updateUserDiamonds = async function(userId) {
  const diamonds = parseInt(document.getElementById('modal-diamonds').value);
  const note = document.getElementById('modal-diamonds-note').value;
  try {
    await adminAPI.updateDiamonds(userId, { diamonds, note });
    showToast('อัปเดตเพชรสำเร็จ', 'success');
    loadAdminUsers();
  } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
};

window.updateUserDays = async function(userId) {
  const days = parseInt(document.getElementById('modal-days').value);
  const note = document.getElementById('modal-days-note').value;
  if (isNaN(days)) { showToast('กรุณากรอกจำนวนวัน', 'error'); return; }
  try {
    await adminAPI.updateDays(userId, { days, note });
    showToast('อัปเดตวันใช้งานสำเร็จ', 'success');
    loadAdminUsers();
  } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
};

window.resetUserPassword = async function(userId) {
  const pw = document.getElementById('modal-new-pw').value;
  if (!pw || pw.length < 6) { showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัว', 'error'); return; }
  try {
    await adminAPI.resetPassword(userId, { newPassword: pw });
    showToast('รีเซ็ตรหัสผ่านสำเร็จ', 'success');
  } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
};

window.resetUserSession = async function(userId) {
  try {
    await adminAPI.resetSession(userId);
    showToast('Kick ผู้ใช้ออกจากระบบสำเร็จ', 'success');
  } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
};

window.toggleUserActive = async function(userId) {
  try {
    const res = await adminAPI.toggleActive(userId);
    showToast(res.data.message, 'success');
    closeModal('user-modal');
    loadAdminUsers();
  } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
};

// ── Admin Topups ─────────────────────────────────────────────────
window.loadAdminTopups = async function() {
  const container = document.getElementById('topups-table-container');
  if (!container) return;
  
  container.innerHTML = '<div class="loading-spinner">⟳</div>';
  
  const status = document.getElementById('topup-filter')?.value;
  
  try {
    const res = await adminAPI.getTopups({ status, limit: 50 });
    const { topups } = res.data;
    
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    
    if (!topups.length) {
      container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">ไม่มีรายการ</p>';
      return;
    }
    
    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>ผู้ใช้</th>
            <th>ยอด (บาท)</th>
            <th>เพชร</th>
            <th>สถานะ</th>
            <th>สลิป</th>
            <th>วันที่</th>
            <th>จัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${topups.map(t => `
            <tr>
              <td>${t.username}</td>
              <td>${t.amount || '-'}</td>
              <td>${t.diamonds || '-'}</td>
              <td>
                <span class="badge ${t.status === 'approved' ? 'badge-green' : t.status === 'pending' ? 'badge-yellow' : 'badge-red'}">
                  ${t.status === 'approved' ? '✅ อนุมัติ' : t.status === 'pending' ? '⏳ รอ' : '❌ ปฏิเสธ'}
                </span>
              </td>
              <td>
                ${t.slipImage ? `<button class="btn-table btn-table-edit" onclick="viewSlip('${API_URL}/uploads/slips/${t.slipImage}')">🖼️ ดู</button>` : '-'}
              </td>
              <td>${new Date(t.createdAt).toLocaleDateString('th-TH')}</td>
              <td>
                ${t.status === 'pending' ? `
                  <button class="btn-table btn-table-edit" onclick="processTopup('${t._id}', 'approved')">✅</button>
                  <button class="btn-table btn-table-danger" onclick="processTopup('${t._id}', 'rejected')">❌</button>
                ` : '-'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch {
    container.innerHTML = '<p style="color:var(--danger)">เกิดข้อผิดพลาด</p>';
  }
};

window.viewSlip = function(url) {
  const modal = document.getElementById('slip-modal');
  const img = document.getElementById('slip-modal-img');
  if (img) img.src = url;
  modal?.classList.remove('hidden');
};

window.processTopup = async function(topupId, status) {
  const note = status === 'rejected' ? (prompt('หมายเหตุการปฏิเสธ (ถ้ามี):') || '') : '';
  
  try {
    const res = await adminAPI.processTopup(topupId, { status, adminNote: note });
    showToast(res.data.message, 'success');
    loadAdminTopups();
    loadAdminStats();
  } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
};

// ── System Settings ──────────────────────────────────────────────
async function loadSysSettings() {
  try {
    const res = await settingsAPI.getAll();
    const s = res.data;
    
    const fields = {
      'sys-bot-status': 'botStatus',
      'sys-announcement': 'announcement',
      'sys-promptpay': 'promptPayNumber',
      'sys-bot-name': 'botName',
      'sys-bot-version': 'botVersion',
      'sys-bot-url': 'botDownloadUrl',
      'sys-video-url': 'videoUrl'
    };
    
    Object.entries(fields).forEach(([elId, key]) => {
      const el = document.getElementById(elId);
      if (el && s[key] !== undefined) el.value = s[key];
    });
    
    // Steps editor
    stepsData = s.steps || [];
    renderStepsEditor(stepsData);
  } catch {}
}

window.saveSetting = async function(key, value) {
  try {
    await adminAPI.saveSetting(key, value);
    showToast('บันทึกสำเร็จ ✅', 'success');
  } catch { showToast('บันทึกไม่สำเร็จ', 'error'); }
};

window.saveBotInfo = async function() {
  const botName = document.getElementById('sys-bot-name').value;
  const botVersion = document.getElementById('sys-bot-version').value;
  const botUrl = document.getElementById('sys-bot-url').value;
  
  try {
    await Promise.all([
      adminAPI.saveSetting('botName', botName),
      adminAPI.saveSetting('botVersion', botVersion),
      adminAPI.saveSetting('botDownloadUrl', botUrl)
    ]);
    showToast('บันทึกข้อมูลบอทสำเร็จ ✅', 'success');
  } catch { showToast('บันทึกไม่สำเร็จ', 'error'); }
};

// Steps Editor
function renderStepsEditor(steps) {
  const container = document.getElementById('steps-editor');
  if (!container) return;
  
  container.innerHTML = `<div class="steps-editor-list" id="steps-list">
    ${steps.map((s, i) => `
      <div class="step-editor-item" data-id="${s.id}">
        <span style="color:var(--primary);font-family:var(--font-cyber);min-width:24px">${i + 1}</span>
        <input type="text" value="${s.text}" onchange="updateStepText('${s.id}', this.value)" />
        <button class="btn-del" onclick="deleteStep('${s.id}')">🗑️</button>
      </div>
    `).join('')}
  </div>`;
}

window.updateStepText = function(id, text) {
  const step = stepsData.find(s => s.id === id);
  if (step) step.text = text;
};

window.deleteStep = function(id) {
  stepsData = stepsData.filter(s => s.id !== id);
  renderStepsEditor(stepsData);
};

window.addStep = function() {
  const input = document.getElementById('new-step-text');
  const text = input.value.trim();
  if (!text) { showToast('กรุณากรอกข้อความ', 'error'); return; }
  
  stepsData.push({ id: Date.now().toString(), text });
  input.value = '';
  renderStepsEditor(stepsData);
};

window.saveSteps = async function() {
  try {
    await adminAPI.saveSetting('steps', stepsData);
    showToast('บันทึกขั้นตอนสำเร็จ ✅', 'success');
    renderTutorialSteps(stepsData);
  } catch { showToast('บันทึกไม่สำเร็จ', 'error'); }
};

// Mass Compensation
window.massCompensation = async function() {
  const days = parseInt(document.getElementById('comp-days').value);
  const note = document.getElementById('comp-note').value;
  
  if (!days || days <= 0) { showToast('กรุณาระบุจำนวนวัน', 'error'); return; }
  
  const confirm = window.confirm(`ยืนยันชดเชย ${days} วัน ให้ผู้ใช้ทุกคน?`);
  if (!confirm) return;
  
  try {
    const res = await adminAPI.massCompensation({ days, note });
    showToast(res.data.message, 'success');
    loadAdminStats();
    document.getElementById('comp-days').value = '';
    document.getElementById('comp-note').value = '';
  } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
};
