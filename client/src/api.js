const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('ic_token');
}

export function setToken(token) {
  localStorage.setItem('ic_token', token);
}

export function clearToken() {
  localStorage.removeItem('ic_token');
  localStorage.removeItem('ic_user');
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('ic_user'));
  } catch {
    return null;
  }
}

export function setUser(user) {
  localStorage.setItem('ic_user', JSON.stringify(user));
}

async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // Don't set Content-Type for FormData (let browser set it with boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401 || res.status === 403) {
    clearToken();
    window.location.hash = '#/login';
    throw new Error('認証エラー');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'リクエストに失敗しました');
  }
  return data;
}

// Auth
export const auth = {
  login: (email, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  register: (email, password, username) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, username }),
  }),
  me: () => request('/auth/me'),
};

// Prompts (user-facing)
export const prompts = {
  list: () => request('/prompts'),
};

// Admin
export const admin = {
  getPrompts: () => request('/admin/prompts'),
  createPrompt: (data) => request('/admin/prompts', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updatePrompt: (id, data) => request(`/admin/prompts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  deletePrompt: (id) => request(`/admin/prompts/${id}`, {
    method: 'DELETE',
  }),
};

// Inpaint
export const images = {
  inpaint: (formData) => request('/inpaint', {
    method: 'POST',
    body: formData,
  }),
  getJobs: () => request('/jobs'),
};
