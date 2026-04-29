/* ========================================================
   NITE-RUN — Push Notifications (FCM)
   - Detects platform support
   - Subscribes the user via Web Push when they opt in
   - Saves the FCM token to users/{uid}/fcmTokens/{token}
   - Handles foreground push messages (in-app toast)

   Background messages are handled by firebase-messaging-sw.js.
   ======================================================== */

(function () {
  'use strict';

  function t(key, fallback) {
    if (typeof window.t === 'function') return window.t(key) || fallback || key;
    return fallback || key;
  }

  function isSupported() {
    if (typeof messaging === 'undefined' || !messaging) return false;
    if (typeof Notification === 'undefined') return false;
    if (!('serviceWorker' in navigator)) return false;
    if (!('PushManager' in window)) return false;
    return true;
  }

  function permission() {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  }

  function vapidConfigured() {
    return typeof FCM_VAPID_KEY === 'string' && FCM_VAPID_KEY.length > 30;
  }

  // Register the FCM service worker explicitly so we can pass it to messaging.
  // Without this, FCM tries to use the default '/firebase-messaging-sw.js' scope,
  // which mostly works but can race against our app service worker registration.
  function getMessagingSwReg() {
    if (!('serviceWorker' in navigator)) return Promise.reject(new Error('No SW'));
    return navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/firebase-cloud-messaging-push-scope' });
  }

  function saveTokenToFirestore(token) {
    try {
      if (!token) return Promise.resolve();
      var user = firebase.auth().currentUser;
      if (!user) return Promise.resolve();
      var ref = db.collection('users').doc(user.uid).collection('fcmTokens').doc(token);
      return ref.set({
        token: token,
        platform: navigator.platform || '',
        userAgent: (navigator.userAgent || '').slice(0, 300),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastSeenAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      return Promise.resolve();
    }
  }

  function removeTokenFromFirestore(token) {
    try {
      if (!token) return Promise.resolve();
      var user = firebase.auth().currentUser;
      if (!user) return Promise.resolve();
      return db.collection('users').doc(user.uid).collection('fcmTokens').doc(token).delete();
    } catch (e) {
      return Promise.resolve();
    }
  }

  // Try to subscribe (assumes permission is already granted or `default`).
  function subscribe() {
    if (!isSupported() || !vapidConfigured()) return Promise.resolve(null);

    return Promise.resolve()
      .then(function () { return getMessagingSwReg(); })
      .then(function (swReg) {
        return messaging.getToken({
          vapidKey: FCM_VAPID_KEY,
          serviceWorkerRegistration: swReg
        });
      })
      .then(function (token) {
        if (!token) return null;
        return saveTokenToFirestore(token).then(function () { return token; });
      })
      .catch(function (err) {
        console.warn('FCM getToken failed:', err);
        try { window.NiteRunErrors && window.NiteRunErrors.log(err, 'fcm.getToken'); } catch (e2) {}
        return null;
      });
  }

  // Ask the browser for notification permission, then subscribe.
  function requestAndSubscribe() {
    if (!isSupported()) return Promise.resolve({ ok: false, reason: 'unsupported' });
    if (!vapidConfigured()) return Promise.resolve({ ok: false, reason: 'not-configured' });

    var p = permission();
    if (p === 'denied') return Promise.resolve({ ok: false, reason: 'denied' });

    var ask = (p === 'granted')
      ? Promise.resolve('granted')
      : Notification.requestPermission();

    return ask.then(function (result) {
      if (result !== 'granted') return { ok: false, reason: result };
      return subscribe().then(function (token) {
        return token ? { ok: true, token: token } : { ok: false, reason: 'no-token' };
      });
    });
  }

  // Disable on this device: remove token from Firestore + delete locally.
  function unsubscribe() {
    if (!isSupported() || !messaging) return Promise.resolve();
    return Promise.resolve()
      .then(function () { return getMessagingSwReg(); })
      .then(function () { return messaging.getToken({ vapidKey: FCM_VAPID_KEY }); })
      .then(function (token) {
        if (!token) return;
        return removeTokenFromFirestore(token).then(function () {
          return messaging.deleteToken();
        });
      })
      .catch(function (err) {
        console.warn('FCM unsubscribe failed:', err);
      });
  }

  // Foreground messages: show an in-app toast (since the OS won't show a banner
  // when the page is focused).
  function wireForegroundHandler() {
    if (!isSupported()) return;
    try {
      messaging.onMessage(function (payload) {
        var data = (payload && payload.data) || {};
        var notif = (payload && payload.notification) || {};
        var msg = notif.body || data.body || notif.title || 'Nite-Run';
        if (typeof window.showToast === 'function') {
          window.showToast(msg, 'info');
        }
      });
    } catch (e) {}
  }

  // Heartbeat: refresh the token's lastSeenAt so server cleanup can prune
  // truly stale tokens (e.g. user uninstalled the PWA months ago).
  function refreshHeartbeat() {
    if (!isSupported() || !vapidConfigured()) return;
    if (permission() !== 'granted') return;
    subscribe().catch(function () {});
  }

  // On sign-in, if permission was previously granted, re-subscribe quietly.
  // This handles new browsers, revoked tokens, and the user signing back in.
  function autoResubscribe(user) {
    if (!user || !isSupported() || !vapidConfigured()) return;
    if (permission() !== 'granted') return;
    subscribe().catch(function () {});
  }

  // Public API
  window.NiteRunPush = {
    isSupported: isSupported,
    permission: permission,
    vapidConfigured: vapidConfigured,
    requestAndSubscribe: requestAndSubscribe,
    unsubscribe: unsubscribe,
    autoResubscribe: autoResubscribe,
    refreshHeartbeat: refreshHeartbeat
  };

  // Set up the foreground listener once Firebase is available.
  // Wait a tick so firebase-config.js has run.
  setTimeout(wireForegroundHandler, 0);
})();
