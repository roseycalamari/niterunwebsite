/* ========================================================
   NITE-RUN — Firebase Configuration
   Replace the placeholder values with your Firebase config.
   ======================================================== */

var firebaseConfig = {
  apiKey: "AIzaSyAbeUAobnX5GYjFXkjFZFFn9AaEA_xxIc8",
  authDomain: "niterun.firebaseapp.com",
  projectId: "niterun",
  storageBucket: "niterun.firebasestorage.app",
  messagingSenderId: "617509606268",
  appId: "1:617509606268:web:1048f9a1f1143d690f8af9"
};

firebase.initializeApp(firebaseConfig);

var auth = firebase.auth();
var db = firebase.firestore();
var storage = typeof firebase.storage === 'function' ? firebase.storage() : null;
