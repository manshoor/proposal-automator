const BASE = '/api/v1';

async function refreshAccessToken() {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: '{}',
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function request(method, path, body, options = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal: options.signal,
  };
  if (body) opts.body = JSON.stringify(body);

  let res = await fetch(`${BASE}${path}`, opts);

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
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
    body: formData,
    credentials: 'include',
    signal: options.signal,
  };

  let res = await fetch(`${BASE}${path}`, opts);

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
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
