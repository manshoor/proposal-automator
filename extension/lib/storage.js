// Promise-based chrome.storage.sync helpers

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      ['provider', 'apiKey', 'backendUrl', 'defaultRate'],
      (result) => {
        resolve({
          provider: result.provider || 'anthropic',
          apiKey: result.apiKey || '',
          backendUrl: result.backendUrl || BACKEND_URL_DEFAULT,
          defaultRate: result.defaultRate || 50
        });
      }
    );
  });
}

function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, resolve);
  });
}
