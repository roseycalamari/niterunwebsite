/* ========================================================
   NITE-RUN — Firebase Cloud Messaging Service Worker
   - Required filename: firebase-messaging-sw.js (FCM auto-discovers it)
   - Must live at site root (scope: /)
   - Handles BACKGROUND push notifications (when the app/tab is closed
     or in another tab). Foreground messages are handled in push.js.
   ======================================================== */

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAbeUAobnX5GYjFXkjFZFFn9AaEA_xxIc8",
  authDomain: "niterun.firebaseapp.com",
  projectId: "niterun",
  storageBucket: "niterun.appspot.com",
  messagingSenderId: "617509606268",
  appId: "1:617509606268:web:1048f9a1f1143d690f8af9"
});

const messaging = firebase.messaging();

/* Background message handler. Fired when the page is not focused. */
messaging.onBackgroundMessage(function (payload) {
  const data = (payload && payload.data) || {};
  const notif = (payload && payload.notification) || {};

  const title = notif.title || data.title || 'Nite-Run';
  const body  = notif.body  || data.body  || '';
  const url   = data.url || '/app.html';

  const options = {
    body: body,
    icon: '/assets/images/icons/icon-192.png',
    badge: '/assets/images/icons/icon-192.png',
    tag: data.tag || 'niterun-notif',
    renotify: true,
    data: { url: url, type: data.type || '' }
  };

  return self.registration.showNotification(title, options);
});

/* Click handler: focus an existing tab if any, otherwise open the app. */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/app.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var c = windowClients[i];
        if (c.url.indexOf(url) !== -1 && 'focus' in c) return c.focus();
      }
      // No matching tab — open a new one
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
