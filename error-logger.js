/* ========================================================
   NITE-RUN — Lightweight error logger
   - Catches window.onerror + unhandledrejection
   - Writes recent errors to Firestore `errorLogs` collection
   - Rate-limited (5 per minute per session) to prevent flooding
   - Exposes window.NiteRunErrors.log(err, context) for manual logging
   ======================================================== */

(function () {
  'use strict';

  var MAX_PER_WINDOW = 5;
  var WINDOW_MS = 60 * 1000;
  var sentTimestamps = [];

  // Some noisy errors we don't care to record
  var IGNORE_PATTERNS = [
    /ResizeObserver loop limit exceeded/i,
    /Non-Error promise rejection captured/i,
    /Script error\.?$/i,
    /^Network request failed$/i,
    /Failed to fetch$/i,
    /Loading chunk \d+ failed/i,
    // Common during page navigation / unmount
    /AbortError/i
  ];

  function shouldIgnore(message) {
    if (!message) return true;
    return IGNORE_PATTERNS.some(function (rx) { return rx.test(String(message)); });
  }

  function rateLimitOk() {
    var now = Date.now();
    sentTimestamps = sentTimestamps.filter(function (t) { return now - t < WINDOW_MS; });
    if (sentTimestamps.length >= MAX_PER_WINDOW) return false;
    sentTimestamps.push(now);
    return true;
  }

  function getUid() {
    try {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        var u = firebase.auth().currentUser;
        return u ? u.uid : null;
      }
    } catch (e) {}
    return null;
  }

  function safeStr(v, max) {
    if (v == null) return '';
    var s = '';
    try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { s = String(v); }
    if (max && s.length > max) s = s.slice(0, max);
    return s;
  }

  function writeLog(payload) {
    if (!rateLimitOk()) return;
    try {
      if (typeof firebase === 'undefined' || !firebase.firestore) return;
      var db = firebase.firestore();
      var doc = {
        message: safeStr(payload.message, 1000),
        stack: safeStr(payload.stack, 4000),
        url: safeStr(window.location && window.location.href, 500),
        userAgent: safeStr(navigator && navigator.userAgent, 500),
        uid: payload.uid || getUid() || null,
        type: safeStr(payload.type || 'error', 50),
        context: safeStr(payload.context, 1000),
        appVersion: window.NITERUN_VERSION || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      db.collection('errorLogs').add(doc).catch(function () {
        // Silent — never let logging itself surface a new error
      });
    } catch (e) {
      // Swallow
    }
  }

  function manualLog(err, context) {
    if (!err) return;
    var message = err && err.message ? err.message : String(err);
    if (shouldIgnore(message)) return;
    writeLog({
      message: message,
      stack: err && err.stack ? err.stack : '',
      type: 'manual',
      context: context || ''
    });
  }

  window.addEventListener('error', function (event) {
    var msg = (event && event.message) || (event && event.error && event.error.message) || '';
    if (shouldIgnore(msg)) return;
    writeLog({
      message: msg || 'Unknown error',
      stack: event && event.error && event.error.stack ? event.error.stack : '',
      type: 'window.error',
      context: (event.filename || '') + ':' + (event.lineno || '') + ':' + (event.colno || '')
    });
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    var msg = '';
    var stack = '';
    if (reason && typeof reason === 'object') {
      msg = reason.message || reason.code || 'Unhandled rejection';
      stack = reason.stack || '';
    } else {
      msg = String(reason || 'Unhandled rejection');
    }
    if (shouldIgnore(msg)) return;
    writeLog({
      message: msg,
      stack: stack,
      type: 'unhandledrejection',
      context: ''
    });
  });

  window.NiteRunErrors = {
    log: manualLog
  };
})();
