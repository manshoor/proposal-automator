// Centralized backend fetch wrapper with JWT auth and auto-refresh

/**
 * Make an authenticated fetch to the backend.
 * Automatically adds Bearer token and refreshes on 401.
 *
 * @param {string} path - API path (e.g., '/api/v1/profile')
 * @param {object} [options] - fetch options (method, body, headers)
 * @returns {Promise<Response>}
 */
function apiFetch(path, options) {
  options = options || {};

  return getSettings().then(function (settings) {
    var url = settings.backendUrl + path;
    var headers = Object.assign(
      { 'Content-Type': 'application/json' },
      options.headers || {}
    );

    if (settings.accessToken) {
      headers['Authorization'] = 'Bearer ' + settings.accessToken;
    }

    var fetchOpts = Object.assign({}, options, { headers: headers });

    return fetch(url, fetchOpts).then(function (res) {
      // Auto-refresh on 401
      if (res.status === 401 && settings.refreshToken) {
        return _refreshAccessToken(settings).then(function (newToken) {
          if (!newToken) return res; // refresh failed, return original 401
          headers['Authorization'] = 'Bearer ' + newToken;
          return fetch(url, Object.assign({}, options, { headers: headers }));
        });
      }
      return res;
    });
  });
}

/**
 * Refresh the access token using the stored refresh token.
 * @returns {Promise<string|null>} new access token or null on failure
 */
function _refreshAccessToken(settings) {
  return fetch(settings.backendUrl + '/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: settings.refreshToken })
  })
    .then(function (res) {
      if (!res.ok) {
        return clearAuth().then(function () { return null; });
      }
      return res.json().then(function (data) {
        return saveSettings({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken
        }).then(function () {
          return data.accessToken;
        });
      });
    })
    .catch(function () {
      return null;
    });
}
