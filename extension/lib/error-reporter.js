// Best-effort client-side error reporter.
//
// Captures unhandled errors and unhandled promise rejections in the calling
// context and POSTs them to /api/v1/errors so they show up in backend logs
// instead of disappearing. Per-context throttling caps the volume.
//
// Usage: call installErrorReporter('popup' | 'service-worker' | 'content-script')
// once at startup. Reporting silently no-ops if apiFetch isn't loaded yet.

(function () {
  var MAX_REPORTS_PER_MINUTE = 10;
  var _reportCount = 0;
  var _windowResetAt = Date.now() + 60000;
  var _source = null;
  var _installed = false;

  function _shouldReport() {
    var now = Date.now();
    if (now > _windowResetAt) {
      _reportCount = 0;
      _windowResetAt = now + 60000;
    }
    if (_reportCount >= MAX_REPORTS_PER_MINUTE) return false;
    _reportCount++;
    return true;
  }

  function _isOurStack(stackText) {
    if (!stackText) return false;
    // Content scripts share window with the host page; only report if the
    // stack frames mention our extension URL.
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      return stackText.indexOf('chrome-extension://') !== -1;
    }
    return true;
  }

  function _reportError(payload) {
    if (!_shouldReport()) return;
    if (typeof apiFetch !== 'function') return;
    try {
      apiFetch('/api/v1/errors', {
        method: 'POST',
        body: JSON.stringify(payload),
      }).catch(function () { /* never throw out of error reporter */ });
    } catch (e) { /* never throw out of error reporter */ }
  }

  function _onError(event) {
    var msg = event && event.message ? String(event.message) : 'unknown error';
    var stack = event && event.error && event.error.stack ? String(event.error.stack) : '';
    if (_source === 'content-script' && !_isOurStack(stack)) return;
    _reportError({
      source: _source,
      message: msg.slice(0, 2000),
      stack: stack ? stack.slice(0, 20000) : undefined,
      url: typeof location !== 'undefined' ? String(location.href).slice(0, 2000) : undefined,
      userAgent: typeof navigator !== 'undefined' ? String(navigator.userAgent).slice(0, 500) : undefined,
    });
  }

  function _onUnhandledRejection(event) {
    var reason = event && event.reason;
    var msg = (reason && (reason.message || reason.toString())) || 'unhandled promise rejection';
    var stack = reason && reason.stack ? String(reason.stack) : '';
    if (_source === 'content-script' && !_isOurStack(stack)) return;
    _reportError({
      source: _source,
      message: ('[unhandledrejection] ' + msg).slice(0, 2000),
      stack: stack ? stack.slice(0, 20000) : undefined,
      url: typeof location !== 'undefined' ? String(location.href).slice(0, 2000) : undefined,
      userAgent: typeof navigator !== 'undefined' ? String(navigator.userAgent).slice(0, 500) : undefined,
    });
  }

  function installErrorReporter(source) {
    if (_installed) return;
    _installed = true;
    _source = source;
    if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
      self.addEventListener('error', _onError);
      self.addEventListener('unhandledrejection', _onUnhandledRejection);
    }
  }

  // Expose globally so the various extension contexts can call it.
  if (typeof window !== 'undefined') {
    window.installErrorReporter = installErrorReporter;
  }
  if (typeof self !== 'undefined') {
    self.installErrorReporter = installErrorReporter;
  }
})();
