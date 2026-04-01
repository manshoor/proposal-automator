/**
 * options.js
 * Loads and saves extension settings via chrome.storage.sync.
 */

'use strict';

// ---- DOM references ----
const providerSelect  = document.getElementById('provider');
const apiKeyInput     = document.getElementById('api-key');
const backendUrlInput = document.getElementById('backend-url');
const defaultRateInput= document.getElementById('default-rate');
const btnSave         = document.getElementById('btn-save');
const saveFeedback    = document.getElementById('save-feedback');
const btnToggleKey    = document.getElementById('btn-toggle-key');
const iconEyeOpen     = document.getElementById('icon-eye-open');
const iconEyeOff      = document.getElementById('icon-eye-off');

// ---- Load settings on page open ----
function loadSettings() {
  chrome.storage.sync.get(
    ['provider', 'apiKey', 'backendUrl', 'defaultRate'],
    (result) => {
      providerSelect.value   = result.provider   || 'anthropic';
      apiKeyInput.value      = result.apiKey     || '';
      backendUrlInput.value  = result.backendUrl || 'http://localhost:3002';
      defaultRateInput.value = result.defaultRate != null ? result.defaultRate : 50;
    }
  );
}

// ---- Save settings ----
function saveSettings() {
  const settings = {
    provider:    providerSelect.value.trim(),
    apiKey:      apiKeyInput.value.trim(),
    backendUrl:  backendUrlInput.value.trim() || 'http://localhost:3002',
    defaultRate: parseInt(defaultRateInput.value, 10) || 50
  };

  chrome.storage.sync.set(settings, () => {
    // Show "Settings saved!" feedback for 2.5 seconds
    saveFeedback.classList.remove('hidden');
    clearTimeout(saveFeedback._hideTimer);
    saveFeedback._hideTimer = setTimeout(() => {
      saveFeedback.classList.add('hidden');
    }, 2500);
  });
}

// ---- Show/hide API key toggle ----
btnToggleKey.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  iconEyeOpen.classList.toggle('hidden', isPassword);
  iconEyeOff.classList.toggle('hidden', !isPassword);
});

// ---- Save button ----
btnSave.addEventListener('click', saveSettings);

// ---- Allow saving with Enter in any text field ----
[apiKeyInput, backendUrlInput, defaultRateInput].forEach((input) => {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveSettings();
  });
});

// ---- Boot ----
document.addEventListener('DOMContentLoaded', loadSettings);
