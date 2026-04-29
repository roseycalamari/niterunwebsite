/* ========================================================
   NITE-RUN — Firebase Configuration
   Replace the placeholder values with your Firebase config.
   ======================================================== */

var firebaseConfig = {
  apiKey: "AIzaSyAbeUAobnX5GYjFXkjFZFFn9AaEA_xxIc8",
  authDomain: "niterun.firebaseapp.com",
  projectId: "niterun",
  // Firebase Storage bucket name (not the web domain)
  storageBucket: "niterun.appspot.com",
  messagingSenderId: "617509606268",
  appId: "1:617509606268:web:1048f9a1f1143d690f8af9"
};

/* VAPID public key for Web Push. Generate one in:
   Firebase Console → Project Settings → Cloud Messaging → Web Push certificates.
   Leave as empty string until configured; push.js will detect this and skip silently. */
var FCM_VAPID_KEY = "";

firebase.initializeApp(firebaseConfig);

var auth = firebase.auth();
var db = firebase.firestore();
var storage = typeof firebase.storage === 'function' ? firebase.storage() : null;
var functions = typeof firebase.functions === 'function' ? firebase.functions() : null;
var messaging = (typeof firebase.messaging === 'function' && firebase.messaging.isSupported && firebase.messaging.isSupported())
  ? firebase.messaging()
  : null;
