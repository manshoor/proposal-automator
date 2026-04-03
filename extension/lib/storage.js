// Promise-based chrome.storage.sync helpers

var STORAGE_KEYS = ['backendUrl', 'defaultRate', 'accessToken', 'refreshToken', 'userEmail'];

function getSettings() {
  return new Promise(function (resolve) {
    chrome.storage.sync.get(STORAGE_KEYS, function (result) {
      resolve({
        backendUrl: (result.backendUrl || BACKEND_URL_DEFAULT).replace(/\/$/, ''),
        defaultRate: result.defaultRate || 50,
        accessToken: result.accessToken || '',
        refreshToken: result.refreshToken || '',
        userEmail: result.userEmail || ''
      });
    });
  });
}

function saveSettings(settings) {
  return new Promise(function (resolve) {
    chrome.storage.sync.set(settings, resolve);
  });
}

function clearAuth() {
  return new Promise(function (resolve) {
    chrome.storage.sync.remove(['accessToken', 'refreshToken', 'userEmail'], resolve);
  });
}

function isLoggedIn() {
  return getSettings().then(function (s) {
    return !!s.accessToken;
  });
}
