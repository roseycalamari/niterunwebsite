/* ========================================================
   NITE-RUN — Auth Page Logic
   Login / Register with Firebase Auth.
   Animated tab switching. On register: writes user doc.
   ======================================================== */

(function () {
  'use strict';

  /* ---------- DOM REFS ---------- */
  var tabLogin = document.getElementById('tabLogin');
  var tabRegister = document.getElementById('tabRegister');
  var tabIndicator = document.getElementById('tabIndicator');
  var nameGroup = document.getElementById('nameGroup');
  var usernameGroup = document.getElementById('usernameGroup');
  var nameInput = document.getElementById('authName');
  var usernameInput = document.getElementById('authUsername');
  var usernameStatus = document.getElementById('usernameStatus');
  var emailInput = document.getElementById('authEmail');
  var passwordInput = document.getElementById('authPassword');
  var errorEl = document.getElementById('authError');
  var submitBtn = document.getElementById('authSubmit');
  var form = document.getElementById('authForm');
  var brandTitle = document.getElementById('brandTitle');
  var brandSub = document.getElementById('brandSub');

  var forgotBtn = document.getElementById('forgotPassword');

  var mode = 'login';
  var isRegistering = false;
  var usernameAvailable = false;
  var usernameCheckTimer = null;

  /* ---------- DARK MODE (respect saved preference) ---------- */
  try {
    if (localStorage.getItem('niterun_dark') === '1') {
      document.body.classList.add('dark');
    }
  } catch (e) {}

  /* ---------- IF ALREADY SIGNED IN, SKIP TO APP ---------- */
  /* Skip the redirect while a registration is in progress so
     the Firestore user-doc write has time to complete. */
  if (typeof auth !== 'undefined' && auth.onAuthStateChanged) {
    auth.onAuthStateChanged(function (user) {
      if (user && !isRegistering) {
        window.location.replace('app.html');
      }
    });
  }

  /* ---------- TAB SWITCHING (animated) ---------- */
  function setMode(next) {
    mode = next;
    errorEl.textContent = '';

    if (mode === 'login') {
      /* Tab indicator slides left */
      tabIndicator.classList.remove('auth-tab__indicator--right');
      tabLogin.classList.add('auth-tab--active');
      tabRegister.classList.remove('auth-tab--active');

      /* Hide name + username fields with animation */
      nameGroup.classList.remove('auth-field--visible');
      usernameGroup.classList.remove('auth-field--visible');

      /* Update button */
      submitBtn.innerHTML = 'Log In <span class="btn__arrow">\u2192</span>';
      passwordInput.autocomplete = 'current-password';
      if (forgotBtn) forgotBtn.style.display = '';

      /* Update branding text */
      if (brandTitle) brandTitle.textContent = 'Welcome Back';
      if (brandSub) brandSub.textContent = 'Sign in to draft smarter.';
    } else {
      /* Tab indicator slides right */
      tabIndicator.classList.add('auth-tab__indicator--right');
      tabRegister.classList.add('auth-tab--active');
      tabLogin.classList.remove('auth-tab--active');

      /* Show name + username fields with animation */
      nameGroup.classList.add('auth-field--visible');
      usernameGroup.classList.add('auth-field--visible');

      /* Update button */
      submitBtn.innerHTML = 'Create Account <span class="btn__arrow">\u2192</span>';
      passwordInput.autocomplete = 'new-password';
      if (forgotBtn) forgotBtn.style.display = 'none';

      /* Update branding text */
      if (brandTitle) brandTitle.textContent = 'Join Nite-Run';
      if (brandSub) brandSub.textContent = 'Create an account and start playing.';

      /* Focus name field after animation */
      setTimeout(function () { nameInput.focus(); }, 360);
    }
  }

  tabLogin.addEventListener('click', function () { setMode('login'); });
  tabRegister.addEventListener('click', function () { setMode('register'); });
  setMode('login');

  /* ---------- USERNAME VALIDATION ---------- */
  if (usernameInput) {
    usernameInput.addEventListener('input', function () {
      var raw = usernameInput.value;
      var clean = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (raw !== clean) usernameInput.value = clean;

      usernameAvailable = false;
      clearTimeout(usernameCheckTimer);

      if (clean.length < 3) {
        setUsernameStatus(clean.length > 0 ? 'At least 3 characters' : '', '');
        return;
      }

      setUsernameStatus('Checking...', 'checking');
      usernameCheckTimer = setTimeout(function () {
        checkUsernameAvailability(clean);
      }, 400);
    });
  }

  function checkUsernameAvailability(username) {
    if (typeof db === 'undefined' || !db) return;

    db.collection('users')
      .where('username', '==', username)
      .limit(1)
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          usernameAvailable = true;
          setUsernameStatus('@' + username + ' is available', 'available');
        } else {
          usernameAvailable = false;
          setUsernameStatus('@' + username + ' is taken', 'taken');
        }
      })
      .catch(function () {
        setUsernameStatus('Could not check', '');
      });
  }

  function setUsernameStatus(msg, state) {
    if (!usernameStatus) return;
    usernameStatus.textContent = msg;
    usernameStatus.className = 'auth-username-status';
    if (state === 'available') usernameStatus.classList.add('auth-username-status--available');
    if (state === 'taken') usernameStatus.classList.add('auth-username-status--taken');
    if (state === 'checking') usernameStatus.classList.add('auth-username-status--checking');
  }

  /* ---------- FORM SUBMIT ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.textContent = '';

    var email = emailInput.value.trim();
    var password = passwordInput.value;

    if (!email || !password) {
      errorEl.textContent = 'Please fill in all fields.';
      return;
    }

    submitBtn.disabled = true;

    if (mode === 'login') {
      handleLogin(email, password);
    } else {
      var name = nameInput.value.trim();
      var username = usernameInput ? usernameInput.value.trim() : '';

      if (!name) {
        errorEl.textContent = 'Please enter your name.';
        submitBtn.disabled = false;
        return;
      }
      if (username.length < 3) {
        errorEl.textContent = 'Username must be at least 3 characters.';
        submitBtn.disabled = false;
        return;
      }
      if (!usernameAvailable) {
        errorEl.textContent = 'That username is not available.';
        submitBtn.disabled = false;
        return;
      }
      handleRegister(email, password, name, username);
    }
  });

  /* ---------- LOGIN ---------- */
  function handleLogin(email, password) {
    auth.signInWithEmailAndPassword(email, password)
      .then(function () {
        window.location.href = 'app.html';
      })
      .catch(function (err) {
        showError(err);
        submitBtn.disabled = false;
      });
  }

  /* ---------- REGISTER ---------- */
  function handleRegister(email, password, name, username) {
    var newUser = null;
    isRegistering = true;

    auth.createUserWithEmailAndPassword(email, password)
      .then(function (cred) {
        newUser = cred.user;
        return newUser.updateProfile({ displayName: name });
      })
      .then(function () {
        return db.collection('users').doc(newUser.uid).set({
          displayName: name,
          displayNameLower: name.toLowerCase(),
          username: username,
          email: email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          mvpCount: 0
        });
      })
      .then(function () {
        isRegistering = false;
        window.location.href = 'app.html';
      })
      .catch(function (err) {
        isRegistering = false;
        showError(err);
        submitBtn.disabled = false;
      });
  }

  /* ---------- ERROR MESSAGES ---------- */
  function showError(err) {
    var msg = 'Something went wrong. Please try again.';

    if (err && err.code) {
      switch (err.code) {
        case 'auth/email-already-in-use':
          msg = 'That email is already registered. Try logging in.';
          break;
        case 'auth/weak-password':
          msg = 'Password must be at least 6 characters.';
          break;
        case 'auth/invalid-email':
          msg = 'Please enter a valid email address.';
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          msg = 'Incorrect email or password.';
          break;
        case 'auth/too-many-requests':
          msg = 'Too many attempts. Please wait a moment.';
          break;
      }
    }

    errorEl.textContent = msg;
  }

  /* ---------- FORGOT PASSWORD ---------- */
  if (forgotBtn) {
    forgotBtn.addEventListener('click', function () {
      var email = emailInput ? emailInput.value.trim() : '';
      if (!email) {
        errorEl.textContent = 'Enter your email above, then click Forgot password.';
        return;
      }
      if (typeof auth === 'undefined' || !auth) return;

      auth.sendPasswordResetEmail(email).then(function () {
        errorEl.style.color = '#22c55e';
        errorEl.textContent = 'Reset email sent to ' + email + '!';
        setTimeout(function () { errorEl.style.color = ''; }, 4000);
      }).catch(function (err) {
        if (err.code === 'auth/user-not-found') {
          errorEl.textContent = 'No account found with that email.';
        } else if (err.code === 'auth/invalid-email') {
          errorEl.textContent = 'Please enter a valid email address.';
        } else {
          errorEl.textContent = 'Could not send reset email. Try again.';
        }
      });
    });
  }

})();
