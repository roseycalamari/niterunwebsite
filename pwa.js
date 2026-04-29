/* ==========================================================================
   Nite-Run PWA helpers
   - Registers service worker + handles the "update ready" toast.
   - Detects platform (iOS Safari vs Android/desktop Chrome).
   - Captures `beforeinstallprompt` so we can show our own install button.
   - Builds the install card UI (lazy injected on first show).
   - Exposes `window.NiteRunPWA` for the rest of the app.
   ========================================================================== */
(function () {
  'use strict';

  var deferredInstallPrompt = null;
  var swRegistration = null;
  var updateToastShown = false;

  function t(key, vars) {
    if (window.NiteRunI18n && typeof window.NiteRunI18n.t === 'function') {
      return window.NiteRunI18n.t(key, vars);
    }
    return key;
  }

  function isIOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  }
  function isIOSSafari() {
    if (!isIOS()) return false;
    var ua = navigator.userAgent || '';
    if (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|Brave|DuckDuckGo|GSA|FBAV|FBAN|Instagram|Twitter|Snapchat|TikTok/i.test(ua)) return false;
    return /Safari/i.test(ua);
  }
  function isAndroid() {
    return /Android/i.test(navigator.userAgent || '');
  }
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           window.navigator.standalone === true;
  }
  function canNativePrompt() {
    return !!deferredInstallPrompt;
  }
  function alreadyInstalled() {
    return isStandalone() ||
           localStorage.getItem('niterun_pwa_installed') === '1';
  }

  /* -------- Service worker registration + update flow -------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;

    navigator.serviceWorker.register('/service-worker.js').then(function (reg) {
      swRegistration = reg;

      if (reg.waiting && navigator.serviceWorker.controller) {
        showUpdateToast(reg);
      }

      reg.addEventListener('updatefound', function () {
        var newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', function () {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast(reg);
          }
        });
      });
    }).catch(function (err) {
      console.warn('[PWA] SW registration failed:', err);
    });

    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  function showUpdateToast(reg) {
    if (updateToastShown) return;
    updateToastShown = true;

    var bar = document.createElement('div');
    bar.className = 'pwa-update-toast';
    bar.innerHTML =
      '<span class="pwa-update-toast__msg">' + t('pwa.update.ready') + '</span>' +
      '<button class="pwa-update-toast__btn" type="button">' + t('pwa.update.refresh') + '</button>';

    bar.querySelector('button').addEventListener('click', function () {
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    });

    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add('is-shown'); });
  }

  /* -------- Capture the native Android/desktop Chrome install prompt -------- */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
  });

  window.addEventListener('appinstalled', function () {
    try { localStorage.setItem('niterun_pwa_installed', '1'); } catch (e) {}
    deferredInstallPrompt = null;
    closeInstallCard();
  });

  /* -------- Install card UI (lazy DOM injection) -------- */
  var installCardEl = null;
  function buildInstallCard() {
    if (installCardEl) return installCardEl;

    var iosBlock =
      '<div class="install-card__platform install-card__platform--ios" data-platform="ios">' +
        '<div class="install-card__notice" data-ios-non-safari style="display:none;">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
          '<div>' +
            '<strong>' + t('pwa.install.ios.safari_only_title') + '</strong>' +
            '<span>' + t('pwa.install.ios.safari_only_body') + '</span>' +
          '</div>' +
        '</div>' +
        '<p class="install-card__lead">' + t('pwa.install.ios.lead') + '</p>' +
        '<ol class="install-card__steps">' +
          '<li class="install-card__step">' +
            '<span class="install-card__step-num">1</span>' +
            '<span class="install-card__step-text">' + t('pwa.install.ios.step1') + '</span>' +
            '<span class="install-card__step-icon" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>' +
              '</svg>' +
            '</span>' +
          '</li>' +
          '<li class="install-card__step">' +
            '<span class="install-card__step-num">2</span>' +
            '<span class="install-card__step-text">' + t('pwa.install.ios.step2') + '</span>' +
            '<span class="install-card__step-icon" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>' +
              '</svg>' +
            '</span>' +
          '</li>' +
          '<li class="install-card__step">' +
            '<span class="install-card__step-num">3</span>' +
            '<span class="install-card__step-text">' + t('pwa.install.ios.step3') + '</span>' +
          '</li>' +
        '</ol>' +
      '</div>';

    var androidBlock =
      '<div class="install-card__platform install-card__platform--android" data-platform="android">' +
        '<p class="install-card__lead">' + t('pwa.install.android.lead') + '</p>' +
        '<button type="button" class="btn btn--primary install-card__cta" data-action="native-install">' +
          '<span>' + t('pwa.install.android.btn') + '</span> <span class="btn__arrow">→</span>' +
        '</button>' +
        '<p class="install-card__or"><span>' + t('pwa.install.or_manually') + '</span></p>' +
        '<ol class="install-card__steps">' +
          '<li class="install-card__step">' +
            '<span class="install-card__step-num">1</span>' +
            '<span class="install-card__step-text">' + t('pwa.install.android.step1') + '</span>' +
            '<span class="install-card__step-icon" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
                '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>' +
              '</svg>' +
            '</span>' +
          '</li>' +
          '<li class="install-card__step">' +
            '<span class="install-card__step-num">2</span>' +
            '<span class="install-card__step-text">' + t('pwa.install.android.step2') + '</span>' +
            '<span class="install-card__step-icon" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<rect x="4" y="3" width="14" height="18" rx="2"/><line x1="11" y1="9" x2="11" y2="15"/><line x1="8" y1="12" x2="14" y2="12"/>' +
              '</svg>' +
            '</span>' +
          '</li>' +
          '<li class="install-card__step">' +
            '<span class="install-card__step-num">3</span>' +
            '<span class="install-card__step-text">' + t('pwa.install.android.step3') + '</span>' +
          '</li>' +
        '</ol>' +
      '</div>';

    var desktopBlock =
      '<div class="install-card__platform install-card__platform--desktop" data-platform="desktop">' +
        '<p class="install-card__lead">' + t('pwa.install.desktop.lead') + '</p>' +
        '<button type="button" class="btn btn--primary install-card__cta" data-action="native-install">' +
          '<span>' + t('pwa.install.desktop.btn') + '</span> <span class="btn__arrow">→</span>' +
        '</button>' +
      '</div>';

    var html =
      '<div class="install-card__backdrop" data-action="close"></div>' +
      '<div class="install-card__panel" role="dialog" aria-modal="true" aria-labelledby="installCardTitle">' +
        '<button type="button" class="install-card__close" data-action="close" aria-label="Close">×</button>' +
        '<div class="install-card__brand">' +
          '<img src="assets/images/icons/icon180.jpg" alt="" class="install-card__logo">' +
          '<div>' +
            '<h2 class="install-card__title" id="installCardTitle">' + t('pwa.install.title') + '</h2>' +
            '<p class="install-card__subtitle">' + t('pwa.install.subtitle') + '</p>' +
          '</div>' +
        '</div>' +
        iosBlock + androidBlock + desktopBlock +
        '<button type="button" class="btn btn--secondary install-card__later" data-action="close">' +
          '<span>' + t('pwa.install.later') + '</span>' +
        '</button>' +
      '</div>';

    var wrap = document.createElement('div');
    wrap.className = 'install-card';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = html;
    document.body.appendChild(wrap);

    wrap.addEventListener('click', function (e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;
      var action = target.getAttribute('data-action');
      if (action === 'close') closeInstallCard();
      else if (action === 'native-install') triggerNativeInstall();
    });

    installCardEl = wrap;
    return wrap;
  }

  function showInstallCard(opts) {
    if (alreadyInstalled() && !(opts && opts.force)) return false;
    var el = buildInstallCard();

    var platform = isIOS() ? 'ios' : (isAndroid() ? 'android' : 'desktop');
    el.querySelectorAll('[data-platform]').forEach(function (block) {
      block.style.display = (block.getAttribute('data-platform') === platform) ? '' : 'none';
    });

    var iosNonSafariNotice = el.querySelector('[data-ios-non-safari]');
    if (iosNonSafariNotice) {
      iosNonSafariNotice.style.display = (isIOS() && !isIOSSafari()) ? '' : 'none';
    }

    if (platform !== 'ios') {
      var ctas = el.querySelectorAll('[data-action="native-install"]');
      ctas.forEach(function (btn) {
        if (canNativePrompt()) {
          btn.disabled = false;
          btn.classList.remove('is-disabled');
        } else {
          btn.disabled = true;
          btn.classList.add('is-disabled');
        }
      });
    }

    document.body.classList.add('install-card-open');
    el.classList.add('is-shown');
    el.setAttribute('aria-hidden', 'false');
    return true;
  }

  function closeInstallCard() {
    if (!installCardEl) return;
    installCardEl.classList.remove('is-shown');
    installCardEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('install-card-open');
    try { document.dispatchEvent(new CustomEvent('niterun:install-card-closed')); } catch (e) {}
  }

  function triggerNativeInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(function (result) {
      if (result && result.outcome === 'accepted') {
        try { localStorage.setItem('niterun_pwa_installed', '1'); } catch (e) {}
      }
      deferredInstallPrompt = null;
      closeInstallCard();
    });
  }

  /* -------- Init -------- */
  document.addEventListener('DOMContentLoaded', function () {
    registerSW();
  });

  window.NiteRunPWA = {
    isIOS: isIOS,
    isAndroid: isAndroid,
    isStandalone: isStandalone,
    canPrompt: canNativePrompt,
    alreadyInstalled: alreadyInstalled,
    showInstallCard: showInstallCard,
    closeInstallCard: closeInstallCard
  };
})();
