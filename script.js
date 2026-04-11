/* ========================================================
   NITE-RUN — Animations & Interactions
   GSAP + ScrollTrigger — purposeful, 60fps, sharp.
   ======================================================== */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    maybeBlockAppLaunch();

    gsap.registerPlugin(ScrollTrigger);

    gsap.set(['.hero__tag', '.hero__sub', '.hero__actions'], {
      opacity: 0,
      y: 20
    });

    setupNav();
    setupLogoContrast();
    heroEntrance();
    scrollReveals();
    drawScribbles();
    mobileMenu();
    buttonInteractions();
    backToTop();
  }

  /* ==========================
     APP LAUNCH GATE (site-config.js)
     ========================== */
  function maybeBlockAppLaunch() {
    if (!window.NITERUN_BLOCK_APP_LAUNCH) return;

    document.querySelectorAll('a[href="auth.html"]').forEach(function (a) {
      if (a.getAttribute('data-app-launch-gated') === '1') return;

      a.setAttribute('data-app-launch-gated', '1');
      a.setAttribute('data-app-launch-href', 'auth.html');
      a.setAttribute('href', '#');
      a.setAttribute('aria-disabled', 'true');
      a.setAttribute('tabindex', '-1');
      a.setAttribute('data-i18n-title', 'site.app_launch_blocked.title');
      a.setAttribute('data-i18n-aria-label', 'site.app_launch_blocked.aria');
      a.classList.add('app-launch--blocked');

      function blockNav(e) {
        e.preventDefault();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      }

      a.addEventListener('click', blockNav, true);
      a.addEventListener('auxclick', function (e) {
        if (e.button === 1) blockNav(e);
      }, true);
    });

    if (window.NiteRunI18n && typeof window.NiteRunI18n.apply === 'function') {
      window.NiteRunI18n.apply();
    }
  }

  /* ==========================
     NAV — single bar, logo always visible
     Menu items animate out/in individually on scroll.
     ========================== */
  function setupNav() {
    var topnav = document.getElementById('topnav');
    if (!topnav) return;

    /* Grab only the menu items (links + CTA), NOT the logo */
    var navItems = Array.from(topnav.querySelectorAll('.topnav__right > *'));
    if (!navItems.length) return;

    var prevScroll = 0;
    var threshold = 100;       /* px from top — always show nav near top */
    var deltaThreshold = 60;   /* px of scroll in one direction before triggering */
    var accumulated = 0;       /* tracks cumulative scroll in current direction */
    var lastDir = null;        /* last scroll direction */
    var state = 'visible';     /* 'visible' | 'hidden' */

    function hideItems() {
      if (state === 'hidden') return;
      state = 'hidden';

      /* Stagger each card upward & fade out */
      gsap.to(navItems, {
        y: -40,
        opacity: 0,
        duration: 0.32,
        stagger: 0.04,
        ease: 'power3.in',
        overwrite: true,
        onComplete: function () {
          navItems.forEach(function (item) {
            item.style.pointerEvents = 'none';
          });
        }
      });
    }

    function showItems() {
      if (state === 'visible') return;
      state = 'visible';

      /* Re-enable pointer events immediately */
      navItems.forEach(function (item) {
        item.style.pointerEvents = 'auto';
      });

      /* Stagger each card back down into place */
      gsap.fromTo(navItems,
        { y: -30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.4,
          stagger: 0.06,
          ease: 'power3.out',
          overwrite: true
        }
      );
    }

    window.addEventListener('scroll', function () {
      var scrollY = window.scrollY || window.pageYOffset;
      var delta = scrollY - prevScroll;
      var dir = delta > 0 ? 'down' : 'up';

      if (scrollY < threshold) {
        /* Near top — always show everything */
        accumulated = 0;
        showItems();
      } else {
        /* Reset accumulator when direction changes */
        if (dir !== lastDir) {
          accumulated = 0;
          lastDir = dir;
        }

        accumulated += Math.abs(delta);

        /* Only trigger after scrolling enough in one direction */
        if (accumulated >= deltaThreshold) {
          if (dir === 'down') {
            hideItems();
          } else {
            showItems();
          }
        }
      }

      prevScroll = scrollY;
    }, { passive: true });
  }

  /* ==========================
     LOGO CONTRAST — cream over blue sections
     Smoothly inverts logo when it overlaps dark bg.
     ========================== */
  function setupLogoContrast() {
    var logoImg = document.querySelector('.topnav__logo-img');
    if (!logoImg) return;

    /* Every section with a dark / blue background */
    var darkSections = gsap.utils.toArray('.problem, .cta');
    var activeCount = 0;

    darkSections.forEach(function (section) {
      ScrollTrigger.create({
        trigger: section,
        /* fire when section top/bottom cross the logo's vertical center (~55px) */
        start: 'top top+=55',
        end: 'bottom top+=55',
        onEnter: function ()     { activeCount++; logoImg.classList.add('topnav__logo-img--light'); },
        onLeave: function ()     { activeCount--; if (activeCount <= 0) { activeCount = 0; logoImg.classList.remove('topnav__logo-img--light'); } },
        onEnterBack: function () { activeCount++; logoImg.classList.add('topnav__logo-img--light'); },
        onLeaveBack: function () { activeCount--; if (activeCount <= 0) { activeCount = 0; logoImg.classList.remove('topnav__logo-img--light'); } }
      });
    });
  }

  /* ==========================
     HERO — staggered entrance
     ========================== */
  function heroEntrance() {
    var tl = gsap.timeline({ defaults: { ease: 'power4.out' } });

    tl
      .from('.hero__line-inner', {
        y: '110%',
        duration: 1.2,
        stagger: 0.18
      })
      .to('.hero__tag', {
        y: 0,
        opacity: 1,
        duration: 0.7
      }, 0.35)
      .to('.hero__sub', {
        y: 0,
        opacity: 1,
        duration: 0.8
      }, 0.6)
      .to('.hero__actions', {
        y: 0,
        opacity: 1,
        duration: 0.7
      }, 0.8)
      .fromTo('.topnav__logo',
        { y: -30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6 },
      0.55)
      .fromTo('.topnav__right > *',
        { y: -30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.45, stagger: 0.06, ease: 'power3.out' },
      0.65);
  }

  /* ==========================
     SCROLL REVEALS
     ========================== */
  function scrollReveals() {
    gsap.utils.toArray('[data-reveal]').forEach(function (el) {
      if (el.closest('.hero')) return;

      gsap.from(el, {
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          toggleActions: 'play none none none'
        },
        y: 50,
        opacity: 0,
        duration: 0.9,
        ease: 'power3.out'
      });
    });

    var steps = gsap.utils.toArray('.step');
    if (steps.length) {
      gsap.from(steps, {
        scrollTrigger: {
          trigger: '.how__grid',
          start: 'top 82%'
        },
        y: 60,
        opacity: 0,
        stagger: 0.12,
        duration: 0.8,
        ease: 'power3.out'
      });
    }

    var features = gsap.utils.toArray('.feature');
    if (features.length) {
      gsap.from(features, {
        scrollTrigger: {
          trigger: '.features__grid',
          start: 'top 82%'
        },
        y: 50,
        opacity: 0,
        stagger: 0.12,
        duration: 0.8,
        ease: 'power3.out'
      });
    }

    var ctaLines = gsap.utils.toArray('.cta__line');
    if (ctaLines.length) {
      gsap.from(ctaLines, {
        scrollTrigger: {
          trigger: '.cta',
          start: 'top 75%'
        },
        y: 80,
        opacity: 0,
        stagger: 0.18,
        duration: 1,
        ease: 'power4.out'
      });
    }
  }

  /* ==========================
     DRAW SVG SCRIBBLES
     ========================== */
  function drawScribbles() {
    /* Hero scribbles — on page load */
    document.querySelectorAll('.hero .scribble-underline path').forEach(function (path) {
      var length = path.getTotalLength();
      gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
      gsap.to(path, {
        strokeDashoffset: 0,
        duration: 0.8,
        delay: 1.2,
        ease: 'power2.inOut'
      });
    });

    /* Other scribbles — on scroll */
    document.querySelectorAll('.scribble-underline path').forEach(function (path) {
      if (path.closest('.hero')) return;
      var length = path.getTotalLength();
      gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });

      gsap.to(path, {
        scrollTrigger: {
          trigger: path.closest('.has-scribble') || path,
          start: 'top 85%',
          toggleActions: 'play none none none'
        },
        strokeDashoffset: 0,
        duration: 0.7,
        ease: 'power2.inOut'
      });
    });
  }

  /* ==========================
     MOBILE MENU
     ========================== */
  function mobileMenu() {
    var toggle = document.getElementById('navToggle');
    var offcanvas = document.getElementById('offcanvas');
    var topnav = document.getElementById('topnav');
    if (!toggle || !offcanvas) return;

    var links = offcanvas.querySelectorAll('.offcanvas__link');
    var cta = offcanvas.querySelector('.offcanvas__cta');
    var isOpen = false;

    toggle.addEventListener('click', function () {
      isOpen = !isOpen;

      if (isOpen) {
        offcanvas.classList.add('offcanvas--open');
        toggle.classList.add('topnav__burger--active');
        if (topnav) topnav.classList.add('topnav--menu-open');
        document.body.style.overflow = 'hidden';

        gsap.fromTo(links,
          { y: 30, opacity: 0 },
          { y: 0, opacity: 1, stagger: 0.08, duration: 0.5, ease: 'power3.out', delay: 0.15 }
        );

        if (cta) {
          gsap.fromTo(cta,
            { y: 30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', delay: 0.15 + (links.length * 0.08) }
          );
        }
      } else {
        closeMenu();
      }
    });

    offcanvas.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        isOpen = false;
        closeMenu();
      });
    });

    function closeMenu() {
      offcanvas.classList.remove('offcanvas--open');
      toggle.classList.remove('topnav__burger--active');
      if (topnav) topnav.classList.remove('topnav--menu-open');
      document.body.style.overflow = '';
    }
  }

  /* ==========================
     BACK TO TOP
     ========================== */
  function backToTop() {
    var btn = document.getElementById('backToTop');
    if (!btn) return;

    var isVisible = false;
    var showAfter = 600; /* px scrolled before button appears */

    window.addEventListener('scroll', function () {
      var scrollY = window.scrollY || window.pageYOffset;

      if (scrollY > showAfter && !isVisible) {
        isVisible = true;
        gsap.to(btn, {
          opacity: 1,
          y: 0,
          visibility: 'visible',
          duration: 0.4,
          ease: 'power3.out',
          overwrite: true
        });
      } else if (scrollY <= showAfter && isVisible) {
        isVisible = false;
        gsap.to(btn, {
          opacity: 0,
          y: 20,
          duration: 0.3,
          ease: 'power3.in',
          overwrite: true,
          onComplete: function () {
            btn.style.visibility = 'hidden';
          }
        });
      }
    }, { passive: true });

    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ==========================
     BUTTON INTERACTIONS
     ========================== */
  function buttonInteractions() {
    document.querySelectorAll('.btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        var href = btn.getAttribute('href');
        if (href === '#') {
          e.preventDefault();
        }
        gsap.fromTo(btn,
          { scale: 0.95 },
          { scale: 1, duration: 0.4, ease: 'elastic.out(1, 0.4)' }
        );
      });
    });
  }

})();
