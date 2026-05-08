'use strict';

(function () {

  // ---- Constants ----
  var MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  var COUNTDOWN_SECS  = 3;             // auto-close delay after success

  // ---- State ----
  var STATE = {
    stream:      null,   // combined MediaStream (screen video + mic audio)
    recorder:    null,   // MediaRecorder instance
    chunks:      [],     // Blob[] from ondataavailable
    startedAt:   0,      // ms epoch when recording began
    timerId:     null,   // setInterval handle for the elapsed-time UI
    pendingUrl:  null,   // URL returned by the backend
    autoCloseId: null,   // setTimeout handle for the 3-s auto-close
  };

  // ---- DOM refs ----
  var setupScreen    = document.getElementById('screen-setup');
  var recordingScreen = document.getElementById('screen-recording');
  var uploadScreen   = document.getElementById('screen-upload');

  var startBtn       = document.getElementById('btn-start');
  var stopBtn        = document.getElementById('btn-stop');
  var cancelRecBtn   = document.getElementById('btn-cancel-rec');
  var cancelSetupLink = document.getElementById('btn-cancel-setup');
  var retryBtn       = document.getElementById('btn-retry');

  var elapsedEl      = document.getElementById('elapsed-time');
  var remainingEl    = document.getElementById('remaining-time');
  var micStatusText  = document.getElementById('mic-status-text');
  var setupError     = document.getElementById('setup-error');
  var setupErrorText = document.getElementById('setup-error-text');

  var uploadTitle    = document.getElementById('upload-title');
  var uploadSpinner  = document.getElementById('upload-spinner');
  var uploadCheck    = document.getElementById('upload-check');
  var uploadStatus   = document.getElementById('upload-status');
  var resultSection  = document.getElementById('result-section');
  var urlInput       = document.getElementById('result-url');
  var copyUrlBtn     = document.getElementById('btn-copy-url');
  var openPopupBtn   = document.getElementById('btn-open-popup');
  var countdownEl    = document.getElementById('countdown');

  var optScreenAudio = document.getElementById('opt-screen-audio');
  var optMicOnly     = document.getElementById('opt-mic-only');

  // ---- Wire up events ----
  startBtn.addEventListener('click', startRecording);
  stopBtn.addEventListener('click', stopRecording);

  cancelRecBtn.addEventListener('click', function () {
    cancelRecording();
  });

  cancelSetupLink.addEventListener('click', function (e) {
    e.preventDefault();
    window.close();
  });

  retryBtn.addEventListener('click', function () {
    hideSetupError();
    startRecording();
  });

  // Mutual exclusion: mic-only disables screen-audio checkbox
  optMicOnly.addEventListener('change', function () {
    optScreenAudio.disabled = optMicOnly.checked;
    if (optMicOnly.checked) optScreenAudio.checked = false;
  });

  copyUrlBtn.addEventListener('click', function () {
    if (!urlInput.value) return;
    navigator.clipboard.writeText(urlInput.value).then(function () {
      copyUrlBtn.textContent = 'Copied!';
      setTimeout(function () { copyUrlBtn.textContent = 'Copy'; }, 2000);
    }).catch(function () {
      // Fallback for environments without clipboard API
      urlInput.select();
      document.execCommand('copy');
      copyUrlBtn.textContent = 'Copied!';
      setTimeout(function () { copyUrlBtn.textContent = 'Copy'; }, 2000);
    });
  });

  openPopupBtn.addEventListener('click', function () {
    if (STATE.pendingUrl) {
      postUrlToPopup(STATE.pendingUrl);
    }
    // Cancel the auto-close timer and close immediately
    if (STATE.autoCloseId) clearTimeout(STATE.autoCloseId);
    window.close();
  });

  // ---- Probe mic permission on load ----
  probeMicPermission();

  // ============================================================
  // Screen management
  // ============================================================

  function showScreen(name) {
    setupScreen.hidden    = (name !== 'setup');
    recordingScreen.hidden = (name !== 'recording');
    uploadScreen.hidden   = (name !== 'upload');
  }

  // ============================================================
  // Mic permission probe
  // ============================================================

  function probeMicPermission() {
    if (!navigator.permissions) {
      micStatusText.textContent = 'unknown';
      return;
    }
    navigator.permissions.query({ name: 'microphone' }).then(function (result) {
      updateMicStatus(result.state);
      result.onchange = function () {
        updateMicStatus(result.state);
      };
    }).catch(function () {
      micStatusText.textContent = 'unknown';
    });
  }

  function updateMicStatus(state) {
    var labels = { granted: 'granted', denied: 'denied', prompt: 'asking…' };
    micStatusText.textContent = labels[state] || state;
    micStatusText.style.color =
      state === 'granted' ? '#16a34a' :
      state === 'denied'  ? '#dc2626' :
      '#64748b';
  }

  // ============================================================
  // Recording pipeline
  // ============================================================

  async function startRecording() {
    hideSetupError();
    startBtn.disabled = true;

    var micOnly     = optMicOnly.checked;
    var screenAudio = optScreenAudio.checked && !micOnly;

    var screenStream = null;
    var audioStream  = null;

    try {
      // 1. Acquire screen (unless mic-only mode)
      if (!micOnly) {
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width:     { ideal: 1280 },
              height:    { ideal: 720 },
              frameRate: { ideal: 24 },
            },
            audio: screenAudio,
          });
        } catch (err) {
          // User cancelled the picker or denied permission
          showSetupError('Screen sharing was cancelled or denied. ' + friendlyError(err));
          startBtn.disabled = false;
          return;
        }
      }

      // 2. Acquire microphone
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        updateMicStatus('granted');
      } catch (err) {
        updateMicStatus('denied');
        // Stop any screen stream we already acquired
        if (screenStream) {
          screenStream.getTracks().forEach(function (t) { t.stop(); });
        }
        showSetupError('Microphone access denied. ' + friendlyError(err));
        startBtn.disabled = false;
        return;
      }

      // 3. Build combined stream
      var tracks = [];
      if (screenStream) {
        screenStream.getVideoTracks().forEach(function (t) { tracks.push(t); });
        // If screen audio was captured, include it too
        screenStream.getAudioTracks().forEach(function (t) { tracks.push(t); });
      }
      audioStream.getAudioTracks().forEach(function (t) { tracks.push(t); });

      var combined = new MediaStream(tracks);
      STATE.stream = combined;

      // 4. Choose codec
      var preferredMimes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm',
      ];
      var mime = preferredMimes.find(function (m) {
        return MediaRecorder.isTypeSupported(m);
      }) || '';

      STATE.chunks   = [];
      STATE.recorder = new MediaRecorder(combined, mime ? { mimeType: mime } : undefined);

      STATE.recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) {
          STATE.chunks.push(e.data);
        }
      };

      STATE.recorder.onstop = handleStopped;

      STATE.recorder.onerror = function (e) {
        stopTimer();
        showScreen('upload');
        uploadTitle.textContent  = 'Recording error';
        uploadStatus.textContent = 'MediaRecorder error: ' + (e.error ? e.error.message : 'unknown');
        uploadSpinner.hidden     = true;
      };

      // 5. Hook "Stop sharing" pill so we auto-transition to upload
      if (screenStream) {
        var videoTracks = screenStream.getVideoTracks();
        if (videoTracks.length > 0) {
          videoTracks[0].onended = function () {
            // Only trigger if still recording
            if (STATE.recorder && STATE.recorder.state === 'recording') {
              stopRecording();
            }
          };
        }
      }

      // 6. Start!
      STATE.recorder.start(1000);  // chunk every 1 s
      STATE.startedAt = Date.now();
      startBtn.disabled = false;
      showScreen('recording');
      startTimer();

    } catch (err) {
      // Catch-all for any unexpected error
      if (screenStream) screenStream.getTracks().forEach(function (t) { t.stop(); });
      if (audioStream)  audioStream.getTracks().forEach(function (t) { t.stop(); });
      showSetupError('Unexpected error: ' + friendlyError(err));
      startBtn.disabled = false;
    }
  }

  function stopRecording() {
    if (!STATE.recorder || STATE.recorder.state === 'inactive') return;
    stopTimer();
    // Calling .stop() triggers ondataavailable (final chunk) then onstop
    STATE.recorder.stop();
  }

  function cancelRecording() {
    stopTimer();
    if (STATE.recorder && STATE.recorder.state !== 'inactive') {
      // Detach onstop before stopping so we don't upload
      STATE.recorder.onstop = null;
      STATE.recorder.stop();
    }
    releaseStream();
    window.close();
  }

  function handleStopped() {
    releaseStream();
    var mimeType = STATE.recorder ? STATE.recorder.mimeType : 'video/webm';
    var blob = new Blob(STATE.chunks, { type: mimeType || 'video/webm' });
    STATE.chunks = [];

    showScreen('upload');
    uploadSpinner.hidden = false;
    uploadCheck.hidden   = true;
    uploadTitle.textContent  = 'Uploading…';
    uploadStatus.textContent = 'Preparing…';
    resultSection.hidden     = true;

    uploadBlob(blob).catch(function (err) {
      uploadSpinner.hidden     = true;
      uploadTitle.textContent  = 'Upload failed';
      uploadStatus.textContent = err.message || 'Unknown error';
    });
  }

  // ============================================================
  // Upload
  // ============================================================

  async function uploadBlob(blob) {
    var formData = new FormData();
    formData.append('video', blob, 'loom-' + Date.now() + '.webm');

    // Read auth from chrome.storage.sync (same store that storage.js/api.js use)
    var stored = await new Promise(function (resolve) {
      chrome.storage.sync.get(['accessToken', 'backendUrl'], resolve);
    });

    var accessToken = stored.accessToken || '';
    var backendUrl  = (stored.backendUrl || BACKEND_URL_DEFAULT).replace(/\/$/, '');

    uploadStatus.textContent = 'Uploading…';

    var res;
    try {
      res = await fetch(backendUrl + '/api/v1/uploads/loom', {
        method:  'POST',
        headers: { Authorization: 'Bearer ' + accessToken },
        body:    formData,
      });
    } catch (networkErr) {
      throw new Error('Network error — is the backend running? (' + networkErr.message + ')');
    }

    if (!res.ok) {
      var body = '';
      try { body = await res.text(); } catch (_) { /* ignore */ }
      throw new Error('Server returned ' + res.status + (body ? ': ' + body : ''));
    }

    var data;
    try {
      data = await res.json();
    } catch (_) {
      throw new Error('Server returned invalid JSON');
    }

    if (!data.url) {
      throw new Error('Server response missing "url" field');
    }

    // Success
    STATE.pendingUrl = data.url;

    uploadSpinner.hidden     = true;
    uploadCheck.hidden       = false;
    uploadTitle.textContent  = 'URL ready! Returning to popup…';
    uploadStatus.textContent = 'Upload complete.';
    urlInput.value           = data.url;
    resultSection.hidden     = false;

    // Notify popup immediately
    postUrlToPopup(data.url);

    // Auto-close countdown
    var secsLeft = COUNTDOWN_SECS;
    countdownEl.textContent = secsLeft;

    STATE.autoCloseId = setInterval(function () {
      secsLeft -= 1;
      countdownEl.textContent = secsLeft;
      if (secsLeft <= 0) {
        clearInterval(STATE.autoCloseId);
        STATE.autoCloseId = null;
        window.close();
      }
    }, 1000);
  }

  // ============================================================
  // Timer
  // ============================================================

  function startTimer() {
    STATE.timerId = setInterval(function () {
      var elapsed = Date.now() - STATE.startedAt;
      elapsedEl.textContent  = formatTime(elapsed);
      var remaining = MAX_DURATION_MS - elapsed;
      remainingEl.textContent = remaining > 0
        ? formatTime(remaining) + ' left'
        : '0:00 left';

      if (elapsed >= MAX_DURATION_MS) {
        // Auto-stop at 5 minutes
        stopRecording();
      }
    }, 500); // 500 ms for snappier display
  }

  function stopTimer() {
    if (STATE.timerId) {
      clearInterval(STATE.timerId);
      STATE.timerId = null;
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  function releaseStream() {
    if (STATE.stream) {
      STATE.stream.getTracks().forEach(function (t) { t.stop(); });
      STATE.stream = null;
    }
  }

  /**
   * Format a duration in milliseconds as M:SS.
   * @param {number} ms
   * @returns {string}
   */
  function formatTime(ms) {
    if (ms < 0) ms = 0;
    var totalSeconds = Math.floor(ms / 1000);
    var minutes      = Math.floor(totalSeconds / 60);
    var seconds      = totalSeconds % 60;
    return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
  }

  function friendlyError(err) {
    if (!err) return '';
    if (err.name === 'NotAllowedError') return 'Permission was denied.';
    if (err.name === 'NotFoundError')   return 'No device found.';
    if (err.name === 'AbortError')      return 'Selection was cancelled.';
    if (err.name === 'NotReadableError') return 'Device is already in use.';
    return err.message || String(err);
  }

  function showSetupError(msg) {
    setupErrorText.textContent = msg;
    setupError.hidden          = false;
  }

  function hideSetupError() {
    setupError.hidden          = true;
    setupErrorText.textContent = '';
  }

  function postUrlToPopup(url) {
    try {
      chrome.runtime.sendMessage({ type: 'LOOM_RECORDED', url: url }, function () {
        // Ignore "no receiver" errors — popup may not be open
        void chrome.runtime.lastError;
      });
    } catch (_) {
      // sendMessage can throw if the extension context is invalidated
    }
  }

})();
