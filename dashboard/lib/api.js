const BASE = '/api/v1';

function getToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('accessToken');
  }
  return null;
}

async function refreshAccessToken() {
  const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function authHeaders() {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function request(method, path, body, options = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    signal: options.signal,
  };

  if (body) opts.body = JSON.stringify(body);

  let res = await fetch(`${BASE}${path}`, opts);

  // Auto-refresh on 401
  if (res.status === 401 && getToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      opts.headers['Authorization'] = `Bearer ${getToken()}`;
      res = await fetch(`${BASE}${path}`, opts);
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(text);
  }
  return res.json();
}

async function upload(path, formData, options = {}) {
  const opts = {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
    signal: options.signal,
  };

  let res = await fetch(`${BASE}${path}`, opts);

  if (res.status === 401 && getToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      opts.headers['Authorization'] = `Bearer ${getToken()}`;
      res = await fetch(`${BASE}${path}`, opts);
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(text);
  }
  return res.json();
}

export const api = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  del: (path, options) => request('DELETE', path, undefined, options),
  upload: (path, formData, options) => upload(path, formData, options),
};
