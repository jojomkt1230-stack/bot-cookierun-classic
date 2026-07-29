import axios from 'axios';

const getApiUrl = () => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.env && import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL;
    }
  } catch (e) {}
  return 'https://ibot-cookierun-classic.onrender.com';
};
const API_URL = getApiUrl();
console.log('[API] Base URL:', `${API_URL}/api`);

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
});

// ── Request interceptor - attach token ───────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor - handle 401 ───────────────────────────
api.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status;
    const errorCode = err.response?.data?.error;

    console.log('[API] Request error:', {
      message: err.message,
      code: err.code,
      status,
      response: err.response?.data,
      method: err.config?.method,
      url: err.config?.url
    });
    
    if (status === 401) {
      if (errorCode === 'SESSION_CONFLICT') {
        // Another device logged in
        localStorage.clear();
        window.showPage('auth-page');
        window.showToast('⚠️ บัญชีนี้ถูกล็อกอินจากอุปกรณ์อื่น', 'error');
      } else {
        localStorage.clear();
        window.showPage('auth-page');
      }
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Auth ─────────────────────────────────────────────────────────
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
};

// ── User ─────────────────────────────────────────────────────────
export const userAPI = {
  me: () => api.get('/users/me'),
  activity: () => api.get('/users/activity'),
  rent: (days) => api.post('/users/rent', { days }),
  botAccess: () => api.get('/users/bot-access'),
};

// ── Topup ────────────────────────────────────────────────────────
export const topupAPI = {
  submitSlip: (formData) => api.post('/topup/submit', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  history: () => api.get('/topup/history'),
  promptPay: () => api.get('/topup/promptpay'),
};

// ── Settings ─────────────────────────────────────────────────────
export const settingsAPI = {
  getAll: () => api.get('/settings'),
  get: (key) => api.get(`/settings/${key}`),
};

// ── Bot ──────────────────────────────────────────────────────────
export const botAPI = {
  status: () => api.get('/bot/status'),
};

// ── Admin ────────────────────────────────────────────────────────
export const adminAPI = {
  stats: () => api.get('/admin/stats'),
  
  // Users
  getUsers: (params) => api.get('/admin/users', { params }),
  getUser: (id) => api.get(`/admin/users/${id}`),
  updateDiamonds: (id, data) => api.patch(`/admin/users/${id}/diamonds`, data),
  updateDays: (id, data) => api.patch(`/admin/users/${id}/days`, data),
  resetPassword: (id, data) => api.patch(`/admin/users/${id}/reset-password`, data),
  resetSession: (id) => api.patch(`/admin/users/${id}/reset-session`),
  toggleActive: (id) => api.patch(`/admin/users/${id}/toggle-active`),
  
  // Topups
  getTopups: (params) => api.get('/admin/topups', { params }),
  processTopup: (id, data) => api.patch(`/admin/topups/${id}`, data),
  
  // Settings
  saveSetting: (key, value) => api.put(`/admin/settings/${key}`, { value }),
  
  // Mass compensation
  massCompensation: (data) => api.post('/admin/mass-compensation', data),
};
