/**
 * options.js
 * Extension settings: login/logout + backend URL + default rate.
 */

'use strict';

// ---- DOM references ----
var backendUrlInput  = document.getElementById('backend-url');
var defaultRateInput = document.getElementById('default-rate');
var btnSave          = document.getElementById('btn-save');
var saveFeedback     = document.getElementById('save-feedback');

// Auth elements
var authStatus       = document.getElementById('auth-status');
var authLogin        = document.getElementById('auth-login');
var authEmail        = document.getElementById('auth-email');
var loginEmailInput  = document.getElementById('login-email');
var loginPasswordInput = document.getElementById('login-password');
var btnLogin         = document.getElementById('btn-login');
var btnLogout        = document.getElementById('btn-logout');
var loginFeedback    = document.getElementById('login-feedback');

// ---- Show/hide auth state ----
function showLoggedIn(email) {
  authEmail.textContent = email;
  authStatus.classList.remove('hidden');
  authStatus.style.display = 'flex';
  authLogin.classList.add('hidden');
  authLogin.style.display = 'none';
}

function showLoggedOut() {
  authStatus.classList.add('hidden');
  authStatus.style.display = 'none';
  authLogin.classList.remove('hidden');
  authLogin.style.display = 'block';
  loginEmailInput.value = '';
  loginPasswordInput.value = '';
}

// ---- Load settings on page open ----
function loadPage() {
  getSettings().then(function (settings) {
    backendUrlInput.value  = settings.backendUrl || BACKEND_URL_DEFAULT;
    defaultRateInput.value = settings.defaultRate || 50;

    if (settings.accessToken && settings.userEmail) {
      showLoggedIn(settings.userEmail);
    } else {
      showLoggedOut();
    }
  });
}

// ---- Login ----
btnLogin.addEventListener('click', function () {
  var email = loginEmailInput.value.trim();
  var password = loginPasswordInput.value.trim();

  if (!email || !password) {
    loginFeedback.textContent = 'Email and password required.';
    loginFeedback.classList.remove('hidden');
    return;
  }

  loginFeedback.classList.add('hidden');
  btnLogin.disabled = true;
  btnLogin.textContent = 'Logging in...';

  var backendUrl = (backendUrlInput.value.trim() || BACKEND_URL_DEFAULT).replace(/\/$/, '');

  fetch(backendUrl + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: password })
  })
    .then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, data: data };
      });
    })
    .then(function (result) {
      if (!result.ok) {
        loginFeedback.textContent = (result.data.error && result.data.error.message) || 'Login failed.';
        loginFeedback.classList.remove('hidden');
        return;
      }

      return saveSettings({
        accessToken: result.data.accessToken,
        refreshToken: result.data.refreshToken,
        userEmail: result.data.user.email
      }).then(function () {
        showLoggedIn(result.data.user.email);
      });
    })
    .catch(function (err) {
      loginFeedback.textContent = 'Network error: ' + (err.message || 'Cannot reach backend.');
      loginFeedback.classList.remove('hidden');
    })
    .finally(function () {
      btnLogin.disabled = false;
      btnLogin.textContent = 'Login';
    });
});

// ---- Logout ----
btnLogout.addEventListener('click', function () {
  clearAuth().then(function () {
    showLoggedOut();
  });
});

// ---- Save non-auth settings ----
function saveNonAuthSettings() {
  var settings = {
    backendUrl:  backendUrlInput.value.trim() || BACKEND_URL_DEFAULT,
    defaultRate: parseInt(defaultRateInput.value, 10) || 50
  };

  saveSettings(settings).then(function () {
    saveFeedback.classList.remove('hidden');
    clearTimeout(saveFeedback._hideTimer);
    saveFeedback._hideTimer = setTimeout(function () {
      saveFeedback.classList.add('hidden');
    }, 2500);
  });
}

btnSave.addEventListener('click', saveNonAuthSettings);

// ---- Allow saving with Enter ----
[backendUrlInput, defaultRateInput].forEach(function (input) {
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') saveNonAuthSettings();
  });
});

// ---- Allow login with Enter ----
[loginEmailInput, loginPasswordInput].forEach(function (input) {
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') btnLogin.click();
  });
});

// ---- Boot ----
document.addEventListener('DOMContentLoaded', loadPage);
