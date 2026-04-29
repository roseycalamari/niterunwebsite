/* ==========================================================================
   Nite-Run First-time Walkthrough
   - Instagram-stories style overlay (progress bars, tap zones, auto-advance)
   - Auto-shown once per user (via localStorage flag), or on demand from Settings
   - Step 0 = "Install on your phone, or keep using browser?" (uses NiteRunPWA)
   - Steps 1..N = feature tour
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'niterun_walkthrough_v1';
  var SLIDE_MS = 6500;

  function t(key, vars) {
    if (window.NiteRunI18n && typeof window.NiteRunI18n.t === 'function') {
      return window.NiteRunI18n.t(key, vars);
    }
    return key;
  }

  var SLIDES = [
    {
      key: 'welcome',
      icon: '<img src="assets/images/logoniterunnotext.png" alt="Nite-Run" class="wt__icon-logo">',
      iconVariant: 'logo',
      titleKey: 'pwa.tour.s1.title',
      bodyKey: 'pwa.tour.s1.body'
    },
    {
      key: 'quick',
      icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
      titleKey: 'pwa.tour.s_quick.title',
      bodyKey: 'pwa.tour.s_quick.body'
    },
    {
      key: 'groups',
      icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      titleKey: 'pwa.tour.s2.title',
      bodyKey: 'pwa.tour.s2.body'
    },
    {
      key: 'admins',
      icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>',
      titleKey: 'pwa.tour.s_admins.title',
      bodyKey: 'pwa.tour.s_admins.body'
    },
    {
      key: 'friends',
      icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
      titleKey: 'pwa.tour.s_friends.title',
      bodyKey: 'pwa.tour.s_friends.body'
    },
    {
      key: 'sessions',
      icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      titleKey: 'pwa.tour.s3.title',
      bodyKey: 'pwa.tour.s3.body'
    },
    {
      key: 'mvps',
      icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8L6 20H18L20 8L16 11L12 5L8 11L4 8Z"/></svg>',
      titleKey: 'pwa.tour.s4.title',
      bodyKey: 'pwa.tour.s4.body'
    },
    {
      key: 'go',
      icon: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>',
      titleKey: 'pwa.tour.s5.title',
      bodyKey: 'pwa.tour.s5.body',
      cta: true
    }
  ];

  var rootEl = null;
  var currentIndex = 0;
  var paused = false;
  var rafId = null;
  var slideStart = 0;
  var slideElapsed = 0;
  var holdTimerId = null;

  function isShown() { return rootEl && rootEl.classList.contains('is-shown'); }

  function build() {
    if (rootEl) return rootEl;

    var bars = '';
    for (var i = 0; i < SLIDES.length; i++) {
      bars += '<div class="wt__bar"><span class="wt__bar-fill"></span></div>';
    }

    var html =
      '<div class="wt__inner" role="dialog" aria-modal="true" aria-label="Tour">' +
        '<div class="wt__bars">' + bars + '</div>' +
        '<div class="wt__top">' +
          '<div class="wt__brand">' +
            '<img src="assets/images/icons/icon180.jpg" alt="" class="wt__brand-logo">' +
            '<span class="wt__brand-name">Nite-Run</span>' +
          '</div>' +
          '<button type="button" class="wt__skip" data-wt-action="close">' +
            '<span>' + t('pwa.tour.skip') + '</span>' +
          '</button>' +
        '</div>' +

        '<div class="wt__slide" data-wt-slide>' +
          '<div class="wt__icon" data-wt-icon></div>' +
          '<h2 class="wt__title" data-wt-title></h2>' +
          '<p class="wt__body" data-wt-body></p>' +
          '<button type="button" class="btn btn--primary wt__cta" data-wt-action="finish" style="display:none;">' +
            '<span data-wt-cta-label>' + t('pwa.tour.cta_finish') + '</span> <span class="btn__arrow">→</span>' +
          '</button>' +
        '</div>' +

        '<button type="button" class="wt__zone wt__zone--prev" data-wt-action="prev" aria-label="Previous"></button>' +
        '<button type="button" class="wt__zone wt__zone--next" data-wt-action="next" aria-label="Next"></button>' +
      '</div>';

    var wrap = document.createElement('div');
    wrap.className = 'walkthrough';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = html;
    document.body.appendChild(wrap);

    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-wt-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-wt-action');
      if (action === 'close') close();
      else if (action === 'finish') close();
      else if (action === 'next') next();
      else if (action === 'prev') prev();
    });

    var holdStartFn = function () {
      if (holdTimerId) clearTimeout(holdTimerId);
      holdTimerId = setTimeout(function () { paused = true; }, 180);
    };
    var holdEndFn = function () {
      if (holdTimerId) clearTimeout(holdTimerId);
      holdTimerId = null;
      paused = false;
    };
    wrap.addEventListener('pointerdown', holdStartFn);
    wrap.addEventListener('pointerup', holdEndFn);
    wrap.addEventListener('pointerleave', holdEndFn);

    document.addEventListener('keydown', function (e) {
      if (!isShown()) return;
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') close();
    });

    rootEl = wrap;
    return wrap;
  }

  function renderSlide() {
    var s = SLIDES[currentIndex];
    if (!s) return;
    var iconEl = rootEl.querySelector('[data-wt-icon]');
    iconEl.innerHTML = s.icon;
    iconEl.classList.toggle('wt__icon--logo', s.iconVariant === 'logo');
    rootEl.querySelector('[data-wt-title]').textContent = t(s.titleKey);
    rootEl.querySelector('[data-wt-body]').textContent = t(s.bodyKey);

    var ctaBtn = rootEl.querySelector('[data-wt-action="finish"]');
    if (ctaBtn) ctaBtn.style.display = s.cta ? '' : 'none';

    var bars = rootEl.querySelectorAll('.wt__bar-fill');
    for (var i = 0; i < bars.length; i++) {
      var fill = bars[i];
      fill.style.transition = 'none';
      if (i < currentIndex) fill.style.width = '100%';
      else if (i > currentIndex) fill.style.width = '0%';
      else fill.style.width = '0%';
    }
    void rootEl.offsetWidth;
  }

  function tick() {
    if (!isShown()) return;
    var now = performance.now();
    if (!paused) slideElapsed += now - slideStart;
    slideStart = now;

    var pct = Math.min(100, (slideElapsed / SLIDE_MS) * 100);
    var bar = rootEl.querySelectorAll('.wt__bar-fill')[currentIndex];
    if (bar) bar.style.width = pct + '%';

    if (slideElapsed >= SLIDE_MS) {
      next();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function startTimer() {
    if (rafId) cancelAnimationFrame(rafId);
    slideStart = performance.now();
    slideElapsed = 0;
    rafId = requestAnimationFrame(tick);
  }
  function stopTimer() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function next() {
    if (currentIndex < SLIDES.length - 1) {
      currentIndex++;
      renderSlide();
      startTimer();
    } else {
      close();
    }
  }
  function prev() {
    if (currentIndex > 0) {
      currentIndex--;
      renderSlide();
      startTimer();
    }
  }

  function open(opts) {
    build();
    currentIndex = (opts && typeof opts.from === 'number') ? opts.from : 0;
    rootEl.classList.add('is-shown');
    rootEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('walkthrough-open');
    renderSlide();
    startTimer();
  }

  function close() {
    if (!rootEl) return;
    stopTimer();
    rootEl.classList.remove('is-shown');
    rootEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('walkthrough-open');
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
  }

  function maybeAutoShow() {
    var seen = false;
    try { seen = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) {}
    if (seen) return;

    var pwa = window.NiteRunPWA;
    var canShowInstall = pwa && !pwa.alreadyInstalled();

    function startTour() {
      setTimeout(function () { open(); }, 350);
    }

    if (canShowInstall) {
      pwa.showInstallCard();
      var onClosed = function () {
        document.removeEventListener('niterun:install-card-closed', onClosed);
        startTour();
      };
      document.addEventListener('niterun:install-card-closed', onClosed);
    } else {
      startTour();
    }
  }

  window.NiteRunWalkthrough = {
    show: open,
    close: close,
    maybeAutoShow: maybeAutoShow,
    reset: function () { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} }
  };
})();
