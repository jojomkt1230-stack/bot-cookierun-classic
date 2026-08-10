// Tiny native History-API router. No SPA framework is loaded in this project
// (no react-router/vue-router), so this is the "framework router" for a
// vanilla-JS app: it only decides *when* to call the page/section renderers
// that already exist in app.js, it never renders anything itself.

const ROUTES = [
  { path: '/login', page: 'auth-page', title: 'เข้าสู่ระบบ' },
  { path: '/dashboard', page: 'dashboard-page', section: 'home', title: 'หน้าหลัก' },
  { path: '/downloads', page: 'dashboard-page', section: 'download', title: 'ดาวน์โหลดและวิธีตั้งค่า' },
  { path: '/top-up', page: 'dashboard-page', section: 'topup', title: 'เติมเงิน' },
  { path: '/farm-history', page: 'dashboard-page', section: 'farm-history', title: 'ประวัติการฟาร์ม' },
  { path: '/usage-history', page: 'dashboard-page', section: 'activity', title: 'ประวัติการใช้งาน' },
  { path: '/admin', page: 'dashboard-page', section: 'admin', title: 'แผงผู้ดูแลระบบ', adminOnly: true },
  { path: '/player-farm-data', page: 'dashboard-page', section: 'player-farm-data', title: 'ข้อมูลการฟาร์มผู้เล่น', adminOnly: true },
  { path: '/closed-accounts', page: 'dashboard-page', section: 'closed-accounts', title: 'บัญชีที่ปิด', adminOnly: true }
];

const REDIRECT_STORAGE_KEY = 'ckrcs_post_login_redirect';

let handlers = null;

function safeSessionGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private-mode / blocked storage: redirect-after-login is best-effort only */
  }
}

function safeSessionRemove(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function normalizePath(pathname) {
  if (!pathname) return '/';
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function findRoute(pathname) {
  return ROUTES.find((route) => route.path === pathname) || null;
}

function savePostLoginRedirect(path) {
  if (findRoute(path) && path !== '/login') safeSessionSet(REDIRECT_STORAGE_KEY, path);
}

export function consumePostLoginRedirect() {
  const value = safeSessionGet(REDIRECT_STORAGE_KEY);
  safeSessionRemove(REDIRECT_STORAGE_KEY);
  return findRoute(value) ? value : null;
}

function setDocumentTitle(title) {
  document.title = title ? `${title} • CKRCS BOT` : 'CKRCS BOT';
}

export function navigateTo(path, { replace = false } = {}) {
  const normalized = normalizePath(path);
  const current = normalizePath(location.pathname);
  if (replace) {
    history.replaceState({}, '', normalized);
  } else if (normalized !== current) {
    history.pushState({}, '', normalized);
  }
  render(normalized);
}

function render(pathname) {
  const path = normalizePath(pathname);

  if (path === '/' || path === '/index.html') {
    navigateTo(handlers.isAuthed() ? '/dashboard' : '/login', { replace: true });
    return;
  }

  const route = findRoute(path);
  if (!route) {
    handlers.onNotFound();
    setDocumentTitle('ไม่พบหน้านี้');
    return;
  }

  const authed = handlers.isAuthed();

  if (route.page === 'auth-page') {
    if (authed) {
      navigateTo(consumePostLoginRedirect() || '/dashboard', { replace: true });
      return;
    }
  } else {
    if (!authed) {
      savePostLoginRedirect(path);
      navigateTo('/login', { replace: true });
      return;
    }
    if (route.adminOnly && !handlers.isAdmin()) {
      handlers.onForbidden?.();
      navigateTo('/dashboard', { replace: true });
      return;
    }
  }

  handlers.onNavigate(route, path);
  setDocumentTitle(route.title);
}

function isModifiedClick(event) {
  return event.defaultPrevented
    || event.button !== 0
    || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function handleDocumentClick(event) {
  if (isModifiedClick(event)) return;
  const link = event.target.closest('a[data-route]');
  if (!link) return;
  if (link.target && link.target !== '_self') return;

  let url;
  try {
    url = new URL(link.href, window.location.origin);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) return;

  event.preventDefault();
  navigateTo(url.pathname);
}

export function initRouter(config) {
  handlers = config;
  document.addEventListener('click', handleDocumentClick);
  window.addEventListener('popstate', () => render(location.pathname));
  render(location.pathname);
}
