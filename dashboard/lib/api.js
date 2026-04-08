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

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
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

async function upload(path, formData) {
  const opts = {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
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
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
  upload: (path, formData) => upload(path, formData),
};
