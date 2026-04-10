/* ========================================================
   NITE-RUN — Auth Page Logic
   Login / Register with Firebase Auth.
   Animated tab switching. On register: writes user doc.
   ======================================================== */

(function () {
  'use strict';

  function t(key, vars) {
    try {
      if (window.NiteRunI18n && typeof window.NiteRunI18n.t === 'function') return window.NiteRunI18n.t(key, vars);
    } catch (e) {}
    return key;
  }

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
  var pwToggle = document.getElementById('pwToggle');
  var pwReqs = document.getElementById('pwReqs');
  var pwReqLength = document.getElementById('pwReqLength');
  var pwReqUpper = document.getElementById('pwReqUpper');
  var pwReqNumber = document.getElementById('pwReqNumber');

  var mode = 'login';
  var isRegistering = false;
  var usernameAvailable = false;
  var usernameCheckTimer = null;
  var passwordValid = false;

  /* ---------- PASSWORD VISIBILITY TOGGLE ---------- */
  if (pwToggle && passwordInput) {
    pwToggle.addEventListener('click', function () {
      var wrap = passwordInput.closest('.auth-pw-wrap');
      var isVisible = passwordInput.type === 'text';
      passwordInput.type = isVisible ? 'password' : 'text';
      if (wrap) wrap.classList.toggle('auth-pw-wrap--visible', !isVisible);
      passwordInput.focus();
    });
  }

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
      if (user && !isRegistering && user.emailVerified) {
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
      submitBtn.innerHTML = t('auth.submit.login') + ' <span class="btn__arrow">\u2192</span>';
      passwordInput.autocomplete = 'current-password';
      passwordInput.placeholder = t('auth.placeholder.password_login');
      if (forgotBtn) forgotBtn.style.display = '';
      if (pwReqs) pwReqs.classList.remove('auth-pw-reqs--visible');

      /* Update branding text */
      if (brandTitle) brandTitle.textContent = t('auth.brand.title_login');
      if (brandSub) brandSub.textContent = t('auth.brand.sub_login');
    } else {
      /* Tab indicator slides right */
      tabIndicator.classList.add('auth-tab__indicator--right');
      tabRegister.classList.add('auth-tab--active');
      tabLogin.classList.remove('auth-tab--active');

      /* Show name + username fields with animation */
      nameGroup.classList.add('auth-field--visible');
      usernameGroup.classList.add('auth-field--visible');

      /* Update button */
      submitBtn.innerHTML = t('auth.submit.register') + ' <span class="btn__arrow">\u2192</span>';
      passwordInput.autocomplete = 'new-password';
      passwordInput.placeholder = t('auth.placeholder.password_register');
      if (forgotBtn) forgotBtn.style.display = 'none';
      if (pwReqs) pwReqs.classList.add('auth-pw-reqs--visible');
      validatePassword(passwordInput.value);

      /* Update branding text */
      if (brandTitle) brandTitle.textContent = t('auth.brand.title_register');
      if (brandSub) brandSub.textContent = t('auth.brand.sub_register');

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
        setUsernameStatus(clean.length > 0 ? t('auth.username.min_chars') : '', '');
        return;
      }

      setUsernameStatus(t('auth.username.checking'), 'checking');
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
          setUsernameStatus(t('auth.username.available', { username: username }), 'available');
        } else {
          usernameAvailable = false;
          setUsernameStatus(t('auth.username.taken', { username: username }), 'taken');
        }
      })
      .catch(function () {
        setUsernameStatus(t('auth.username.could_not_check'), '');
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

  /* ---------- PASSWORD VALIDATION ---------- */
  if (passwordInput) {
    passwordInput.addEventListener('input', function () {
      validatePassword(passwordInput.value);
    });
  }

  function validatePassword(pw) {
    if (mode !== 'register') return;
    if (!pwReqs) return;

    var hasLength = pw.length >= 8;
    var hasUpper = /[A-Z]/.test(pw);
    var hasNumber = /[0-9]/.test(pw);

    pwReqLength.classList.toggle('auth-pw-req--pass', hasLength);
    pwReqUpper.classList.toggle('auth-pw-req--pass', hasUpper);
    pwReqNumber.classList.toggle('auth-pw-req--pass', hasNumber);

    passwordValid = hasLength && hasUpper && hasNumber;
  }

  /* ---------- FORM SUBMIT ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.textContent = '';

    var email = emailInput.value.trim();
    var password = passwordInput.value;

    if (!email || !password) {
      errorEl.textContent = t('auth.error.fill_all');
      return;
    }

    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email)) {
      errorEl.textContent = t('auth.error.valid_email');
      return;
    }

    submitBtn.disabled = true;

    if (mode === 'login') {
      handleLogin(email, password);
    } else {
      var name = nameInput.value.trim();
      var username = usernameInput ? usernameInput.value.trim() : '';

      if (!name) {
        errorEl.textContent = t('auth.error.name_required');
        submitBtn.disabled = false;
        return;
      }
      if (username.length < 3) {
        errorEl.textContent = t('auth.error.username_len');
        submitBtn.disabled = false;
        return;
      }
      if (!usernameAvailable) {
        errorEl.textContent = t('auth.error.username_unavailable');
        submitBtn.disabled = false;
        return;
      }
      if (!passwordValid) {
        errorEl.textContent = t('auth.error.password_rules');
        submitBtn.disabled = false;
        return;
      }
      handleRegister(email, password, name, username);
    }
  });

  /* ---------- LOGIN ---------- */
  function handleLogin(email, password) {
    auth.signInWithEmailAndPassword(email, password)
      .then(function (cred) {
        if (!cred.user.emailVerified) {
          showVerifyScreen(email);
          submitBtn.disabled = false;
          return;
        }
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
        var sendVerification = functions.httpsCallable('sendVerification');
        return sendVerification();
      })
      .then(function () {
        isRegistering = false;
        showVerifyScreen(email);
      })
      .catch(function (err) {
        isRegistering = false;
        showError(err);
        submitBtn.disabled = false;
      });
  }

  /* ---------- ERROR MESSAGES ---------- */
  function showError(err) {
    var msg = t('auth.error.generic');

    if (err && err.code) {
      switch (err.code) {
        case 'auth/email-already-in-use':
          msg = t('auth.error.email_in_use');
          break;
        case 'auth/weak-password':
          msg = t('auth.error.weak_password');
          break;
        case 'auth/invalid-email':
          msg = t('auth.error.valid_email');
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          msg = t('auth.error.bad_credentials');
          break;
        case 'auth/too-many-requests':
          msg = t('auth.error.too_many');
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
        errorEl.textContent = t('auth.reset.prompt_enter_email');
        return;
      }
      if (typeof auth === 'undefined' || !auth) return;

      auth.sendPasswordResetEmail(email).then(function () {
        errorEl.style.color = '#22c55e';
        errorEl.textContent = t('auth.reset.sent', { email: email });
        setTimeout(function () { errorEl.style.color = ''; }, 4000);
      }).catch(function (err) {
        if (err.code === 'auth/user-not-found') {
          errorEl.textContent = t('auth.error.no_account');
        } else if (err.code === 'auth/invalid-email') {
          errorEl.textContent = t('auth.error.valid_email');
        } else {
          errorEl.textContent = t('auth.reset.failed');
        }
      });
    });
  }

  /* ---------- EMAIL VERIFICATION SCREEN ---------- */
  var verifyPanel = document.getElementById('verifyPanel');
  var verifyEmailEl = document.getElementById('verifyEmail');
  var verifyResendBtn = document.getElementById('verifyResend');
  var verifyBackBtn = document.getElementById('verifyBack');
  var verifyStatus = document.getElementById('verifyStatus');

  function showVerifyScreen(email) {
    var card = document.querySelector('.auth-card');
    var formPanel = document.querySelector('.auth-form-panel:not(.auth-verify)');
    if (formPanel) formPanel.style.display = 'none';
    if (verifyPanel) verifyPanel.style.display = 'flex';
    if (verifyEmailEl) verifyEmailEl.textContent = email;
    if (brandTitle) brandTitle.textContent = t('auth.brand.title_verify');
    if (brandSub) brandSub.textContent = t('auth.brand.sub_verify');
  }

  function hideVerifyScreen() {
    var formPanel = document.querySelector('.auth-form-panel:not(.auth-verify)');
    if (formPanel) formPanel.style.display = '';
    if (verifyPanel) verifyPanel.style.display = 'none';
    if (verifyStatus) { verifyStatus.textContent = ''; verifyStatus.className = 'auth-verify__status'; }
    setMode('login');
  }

  if (verifyResendBtn) {
    verifyResendBtn.addEventListener('click', function () {
      var user = auth.currentUser;
      if (!user) {
        setVerifyStatus(t('auth.verify.error_login_first'), 'error');
        return;
      }
      verifyResendBtn.disabled = true;
      var sendVerification = functions.httpsCallable('sendVerification');
      sendVerification().then(function (result) {
        if (result.data && result.data.already) {
          setVerifyStatus(t('auth.verify.already_verified'), 'success');
        } else {
          setVerifyStatus(t('auth.verify.sent'), 'success');
        }
        setTimeout(function () { verifyResendBtn.disabled = false; }, 10000);
      }).catch(function () {
        setVerifyStatus(t('auth.verify.resend_failed'), 'error');
        verifyResendBtn.disabled = false;
      });
    });
  }

  if (verifyBackBtn) {
    verifyBackBtn.addEventListener('click', function () {
      if (auth.currentUser) {
        auth.signOut().then(function () { hideVerifyScreen(); });
      } else {
        hideVerifyScreen();
      }
    });
  }

  function setVerifyStatus(msg, type) {
    if (!verifyStatus) return;
    verifyStatus.textContent = msg;
    verifyStatus.className = 'auth-verify__status';
    if (type === 'success') verifyStatus.classList.add('auth-verify__status--success');
    if (type === 'error') verifyStatus.classList.add('auth-verify__status--error');
  }

})();
