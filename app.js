/* ========================================================
   NITE-RUN — Dashboard App Logic
   Hub navigation · Sub-views · Session Wizard · Team Balancer
   Search · Groups
   ======================================================== */

(function () {
  'use strict';

  function t(key, vars) {
    try {
      if (window.NiteRunI18n && typeof window.NiteRunI18n.t === 'function') return window.NiteRunI18n.t(key, vars);
    } catch (e) {}
    return key;
  }

  /* ---------- STATE ---------- */
  var players = [];
  var groups = [];
  var gamesGenerated = 0;
  var editingId = null;
  var previousView = null;
  var selectedPosition = 'HYB';
  var selectedPlayerUid = null;
  var selectedPlayerPhoto = null;
  var currentWizardStep = 1;
  var modalCallback = null;
  var pendingSession = null;

  var STORAGE_KEY = 'niterun_players';
  var GAMES_KEY = 'niterun_games';
  var GROUPS_KEY = 'niterun_groups';
  var DARK_KEY = 'niterun_dark';

  /* ---------- CURRENT USER ---------- */
  var currentUser = null;

  /* ---------- OFFICIAL GROUPS (Firestore) ---------- */
  var officialGroups = []; // { id, name, joinCode, isVerified, memberCount, verifiedMemberCount, myRole }
  var selectedGroupId = '';
  var selectedGroup = null;
  var groupMemberMentionCache = {}; // groupId -> { ts, list }
  var forceQuickFlow = false;

  function isQuickSessionMode() {
    if (forceQuickFlow) return true;
    var sm = document.getElementById('sessionMode');
    if (!sm) return true;
    return sm.value !== 'official';
  }

  /* Milestones: one visible next step per track; next tier appears after you complete the current one */
  var milestoneStatsCache = { sessions: 0, mvps: 0 };
  var SESSION_MILESTONES = [10, 50, 125, 275, 500];
  var MVP_MILESTONES = [10, 100, 300, 750];
  var MILESTONE_TOTAL_COUNT = SESSION_MILESTONES.length + MVP_MILESTONES.length;

  function countMilestonesCompleted(cur, targets) {
    var n = 0;
    for (var i = 0; i < targets.length; i++) {
      if (cur >= targets[i]) n++;
    }
    return n;
  }

  function nextMilestoneTarget(cur, targets) {
    for (var i = 0; i < targets.length; i++) {
      if (cur < targets[i]) return targets[i];
    }
    return null;
  }

  function milestoneRowHtml(stat, target, cur) {
    var done = cur >= target;
    var pct = target > 0 ? Math.min(100, Math.round((cur / target) * 100)) : 0;
    var title = t('app.milestone.tpl.' + stat, { target: target });
    var nums = t('app.milestone.progress', { current: cur, target: target });
    var html = '<div class="milestone-row' + (done ? ' milestone-row--done' : '') + '">';
    html += '<div class="milestone-row__head">';
    html += '<span class="milestone-row__title">' + escapeHtml(title) + '</span>';
    if (done) html += '<span class="milestone-row__check" aria-hidden="true">✓</span>';
    html += '</div>';
    html += '<div class="milestone-row__track"><div class="milestone-row__fill" style="width:' + pct + '%"></div></div>';
    html += '<div class="milestone-row__meta">' + escapeHtml(nums);
    if (done) html += ' · <span class="milestone-row__done-label">' + escapeHtml(t('app.milestone.complete')) + '</span>';
    html += '</div></div>';
    return html;
  }

  function milestoneTrackHtml(stat, targets, cur) {
    var html = '<div class="milestone-track">';
    html += '<h3 class="milestone-track__title">' + escapeHtml(t('app.milestone.track.' + stat)) + '</h3>';
    var next = nextMilestoneTarget(cur, targets);
    if (next === null) {
      html += '<p class="milestone-track__all-done">' + escapeHtml(t('app.milestone.all_done.' + stat)) + '</p>';
    } else {
      html += milestoneRowHtml(stat, next, cur);
    }
    html += '</div>';
    return html;
  }

  function renderMilestonesUI() {
    var listEl = document.getElementById('milestoneList');
    var hubTeaser = document.getElementById('milestoneHubTeaser');
    var pageSum = document.getElementById('milestonePageSummary');
    var s = Math.max(0, milestoneStatsCache.sessions);
    var m = Math.max(0, milestoneStatsCache.mvps);
    var unlocked = countMilestonesCompleted(s, SESSION_MILESTONES) + countMilestonesCompleted(m, MVP_MILESTONES);

    var html = milestoneTrackHtml('sessions', SESSION_MILESTONES, s);
    html += milestoneTrackHtml('mvp', MVP_MILESTONES, m);

    html += '<div class="milestone-row milestone-row--future">';
    html += '<div class="milestone-row__head"><span class="milestone-row__title">' + escapeHtml(t('app.milestone.goals_title')) + '</span>';
    html += '<span class="milestone-row__soon">' + escapeHtml(t('app.milestone.soon_badge')) + '</span></div>';
    html += '<p class="milestone-row__future-desc">' + escapeHtml(t('app.milestone.goals_body')) + '</p></div>';

    if (listEl) listEl.innerHTML = html;

    var summary = t('app.milestone.summary', { unlocked: unlocked, total: MILESTONE_TOTAL_COUNT });
    if (hubTeaser) hubTeaser.textContent = summary;
    if (pageSum) pageSum.textContent = summary;
  }

  function updateMilestoneStatsFromUserDoc(data) {
    milestoneStatsCache.sessions = data.sessionsPlayed || 0;
    milestoneStatsCache.mvps = data.mvpCount || 0;
    renderMilestonesUI();
  }

  /* ---------- DOM REFS ---------- */
  var els = {};

  /* ---------- AUTH GATE ---------- */
  /* Wait for Firebase Auth to resolve, then boot the app.
     If no user is signed in, redirect to the auth page.
     A fallback ensures the app still works if Firebase
     scripts failed to load (e.g. offline / local dev). */
  function bootApp(user) {
    currentUser = user;
    cacheElements();
    loadData();
    setupDarkMode();
    setupNavigation();
    setupHubPanels();
    setupOnboarding();
    setupEmptyStates();
    setupBackButtons();
    setupSearch();
    setupWizard();
    setupForm();
    setupGenerate();
    setupGroups();
    setupClearData();
    setupModal();
    setupDeleteAccount();
    renderRoster();
    updateStats();

    document.addEventListener('niterun:lang', function () {
      renderMilestonesUI();
      updatePlayerNameFieldCopy();
      persistUserLang();
    });
    // Also persist on first load so server-side push uses the right language.
    persistUserLang();

    if (user) {
      populateUserInfo(user);
      setupSessionMode();
      setupOfficialGroups(user);
      setupHowToUse();
      setupUserMenu();
      setupAvatarUpload(user);
      setupNotifications(user);
      setupFriendsCard();
      setupAccountSettings();
      setupPwaSettings();
      maybeOfferWalkthrough();
      // Re-subscribe to push (refreshes the FCM token if it rotated; saves it to Firestore).
      try { window.NiteRunPush && window.NiteRunPush.autoResubscribe(user); } catch (e) {}
    }
  }

  /* ---------- PWA / Walkthrough wiring ---------- */
  function setupPwaSettings() {
    var installBtn = document.getElementById('settingsInstallBtn');
    var tourBtn = document.getElementById('settingsTourBtn');
    var installRow = document.getElementById('settingsInstallRow');

    if (installRow && window.NiteRunPWA && window.NiteRunPWA.alreadyInstalled()) {
      installRow.style.display = 'none';
    }

    if (installBtn) {
      installBtn.addEventListener('click', function () {
        if (window.NiteRunPWA) window.NiteRunPWA.showInstallCard({ force: true });
      });
    }
    if (tourBtn) {
      tourBtn.addEventListener('click', function () {
        if (window.NiteRunWalkthrough) {
          window.NiteRunWalkthrough.reset();
          window.NiteRunWalkthrough.show();
        }
      });
    }
  }

  function maybeOfferWalkthrough() {
    if (!window.NiteRunWalkthrough) return;
    setTimeout(function () {
      try { window.NiteRunWalkthrough.maybeAutoShow(); } catch (e) {}
    }, 600);
  }

  // Save the user's currently-selected language to their Firestore doc so the
  // Cloud Function that sends push notifications knows which language to use.
  function persistUserLang() {
    try {
      if (!currentUser || typeof db === 'undefined' || !db) return;
      var raw = '';
      try { raw = (localStorage.getItem('niterun_lang') || '').toLowerCase(); } catch (e) {}
      var lang = raw.indexOf('pt') === 0 ? 'pt' : 'en';
      db.collection('users').doc(currentUser.uid).update({ lang: lang }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- PUSH NOTIFICATIONS TOGGLE ---------- */
  function setupPushNotificationsToggle() {
    var toggle = document.getElementById('togglePushNotifs');
    var desc = document.getElementById('pushNotifsDesc');
    var row = document.getElementById('rowPushNotifs');
    if (!toggle || !row) return;

    var Push = window.NiteRunPush;

    function setDesc(key) {
      if (!desc) return;
      desc.textContent = t(key) || desc.textContent;
      desc.setAttribute('data-i18n', key);
    }

    // Detect support / configuration
    if (!Push || !Push.isSupported()) {
      toggle.disabled = true;
      toggle.checked = false;
      setDesc('app.settings.push_notifications_unsupported');
      return;
    }

    if (!Push.vapidConfigured()) {
      // Push code is in place but VAPID key isn't set yet — hide the row to avoid confusion.
      row.style.display = 'none';
      return;
    }

    // iOS PWA push only works when the user has installed to home screen (iOS 16.4+).
    // If we're on iOS Safari without standalone, show a hint.
    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    var isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    if (isIOS && !isStandalone) {
      toggle.disabled = true;
      toggle.checked = false;
      setDesc('app.settings.push_notifications_install_first');
      return;
    }

    // Initial state from browser permission + Firestore preference
    function refreshState() {
      var perm = Push.permission();
      if (perm === 'denied') {
        toggle.checked = false;
        toggle.disabled = false;
        setDesc('app.settings.push_notifications_blocked');
        return;
      }
      if (currentUser && db) {
        db.collection('users').doc(currentUser.uid).get().then(function (doc) {
          var pref = doc.exists ? doc.data().pushNotifications : false;
          toggle.checked = !!pref && perm === 'granted';
          setDesc('app.settings.push_notifications_desc');
        }).catch(function () {
          toggle.checked = perm === 'granted';
          setDesc('app.settings.push_notifications_desc');
        });
      } else {
        toggle.checked = perm === 'granted';
        setDesc('app.settings.push_notifications_desc');
      }
    }

    refreshState();

    toggle.addEventListener('change', function () {
      var wantOn = toggle.checked;

      if (wantOn) {
        Push.requestAndSubscribe().then(function (res) {
          if (res && res.ok) {
            if (currentUser && db) {
              db.collection('users').doc(currentUser.uid).update({ pushNotifications: true }).catch(function () {});
            }
            showToast(t('toast.push_notifications_on'), 'success');
            setDesc('app.settings.push_notifications_desc');
          } else {
            toggle.checked = false;
            if (res && res.reason === 'denied') {
              showToast(t('toast.push_notifications_blocked'), 'info');
              setDesc('app.settings.push_notifications_blocked');
            } else {
              showToast(t('toast.something_went_wrong') || 'Something went wrong.', 'info');
            }
          }
        });
      } else {
        Push.unsubscribe().finally(function () {
          if (currentUser && db) {
            db.collection('users').doc(currentUser.uid).update({ pushNotifications: false }).catch(function () {});
          }
          showToast(t('toast.push_notifications_off'), 'info');
        });
      }
    });
  }

  /* ---------- EMPTY STATES (simple next-step buttons) ---------- */
  function setupEmptyStates() {
    var notifGroups = document.getElementById('notifEmptyGroups');
    if (notifGroups) {
      notifGroups.addEventListener('click', function () {
        var dd = document.getElementById('notifDropdown');
        if (dd) dd.classList.remove('notif-dropdown--open');
        switchView('groups');
      });
    }

  }

  /* ---------- ONBOARDING (first-time helper) ---------- */
  function setupOnboarding() {
    var card = document.getElementById('onboardCard');
    if (!card) return;

    var key = 'niterun_onboard_dismissed_v1';
    var dismissed = false;
    try { dismissed = localStorage.getItem(key) === '1'; } catch (e) {}
    if (dismissed) return;

    card.style.display = '';

    var dismissBtn = document.getElementById('onboardDismiss');
    var ctaCreate = document.getElementById('onboardCtaCreate');
    var ctaHowto = document.getElementById('onboardCtaHowto');

    function dismiss() {
      card.style.display = 'none';
      try { localStorage.setItem(key, '1'); } catch (e) {}
    }

    if (dismissBtn) dismissBtn.addEventListener('click', dismiss);
    if (ctaCreate) ctaCreate.addEventListener('click', function () {
      dismiss();
      switchView('groups');
      setTimeout(function () {
        if (els.createOfficialGroupBtn) els.createOfficialGroupBtn.click();
      }, 120);
    });
    if (ctaHowto) ctaHowto.addEventListener('click', function () {
      dismiss();
      switchView('howto');
    });
  }

  function setupUserMenu() {
    var btn = document.getElementById('topbarUserBtn');
    var menu = document.getElementById('userMenu');
    var wrap = document.getElementById('topbarUserWrap');
    if (!btn || !menu) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !menu.classList.contains('user-menu--open');
      if (willOpen) {
        var notifDd = document.getElementById('notifDropdown');
        if (notifDd) notifDd.classList.remove('notif-dropdown--open');
      }
      menu.classList.toggle('user-menu--open');
    });

    document.addEventListener('click', function (e) {
      if (!menu.classList.contains('user-menu--open')) return;
      if (wrap && wrap.contains(e.target)) return;
      menu.classList.remove('user-menu--open');
    });

    menu.querySelectorAll('[data-user-menu]').forEach(function (item) {
      item.addEventListener('click', function () {
        var action = item.getAttribute('data-user-menu');
        menu.classList.remove('user-menu--open');
        if (action === 'profile') switchView('profile');
        if (action === 'settings') switchView('settings');
        if (action === 'logout') {
          if (typeof auth !== 'undefined' && auth.signOut) {
            auth.signOut().then(function () {
              window.location.href = 'auth.html';
            });
          }
        }
      });
    });
  }

  function setupHowToUse() {
    if (els.howtoQuickBtn) {
      els.howtoQuickBtn.addEventListener('click', function () {
        forceQuickFlow = true;
        switchView('session');
        if (els.sessionMode) {
          els.sessionMode.value = 'quick';
          try { els.sessionMode.dispatchEvent(new Event('change')); } catch (e) {}
        }
        beginQuickSessionRoster();
      });
    }

    if (els.howtoGroupBtn) {
      els.howtoGroupBtn.addEventListener('click', function () {
        switchView('groups');
        setTimeout(function () {
          if (els.createOfficialGroupBtn) els.createOfficialGroupBtn.click();
        }, 120);
      });
    }
  }

  /* ---------- LIVE SESSIONS (GROUP DETAIL) ---------- */
  var groupLiveUnsub = null;
  var groupLiveForGid = '';

  function stopGroupLiveSessions() {
    if (groupLiveUnsub) groupLiveUnsub();
    groupLiveUnsub = null;
    groupLiveForGid = '';
  }

  function listenGroupLiveSessions(user, gid) {
    if (typeof db === 'undefined' || !db || !user) return;

    var grid = document.getElementById('groupDetailLiveGrid');
    var wrap = document.getElementById('groupDetailLiveSessions');
    if (!grid || !wrap) return;

    if (!gid) {
      stopGroupLiveSessions();
      wrap.style.display = 'none';
      grid.innerHTML = '';
      return;
    }

    if (groupLiveForGid === gid && groupLiveUnsub) return;
    stopGroupLiveSessions();
    groupLiveForGid = gid;

    wrap.style.display = '';

    groupLiveUnsub = db.collection('sessions')
      .where('groupId', '==', gid)
      .where('status', '==', 'live')
      .orderBy('createdAt', 'desc')
      .onSnapshot(function (snapshot) {
        var sessions = [];
        snapshot.forEach(function (doc) {
          var d = doc.data();
          sessions.push({ id: doc.id, data: d, isCreator: d.creatorId === user.uid });
        });

        if (sessions.length === 0) {
          wrap.style.display = 'none';
          grid.innerHTML = '';
          return;
        }

        wrap.style.display = '';
        grid.innerHTML = sessions.map(function (s) {
          return buildLiveSessionCard(s.id, s.data, s.isCreator);
        }).join('');

        grid.querySelectorAll('.live-card__close-btn').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var sid = btn.getAttribute('data-session-id');
            closeSession(sid);
          });
        });

        grid.querySelectorAll('.live-card').forEach(function (card) {
          card.addEventListener('click', function () {
            var sid = card.getAttribute('data-session-id');
            var session = sessions.find(function (s) { return s.id === sid; });
            if (session) showSessionDetail(session.id, session.data, session.isCreator);
          });
        });
      }, function (err) {
        console.error('Group live sessions listener error:', err);
      });
  }

  function buildLiveSessionCard(id, data, isCreator) {
    var metaParts = [];
    if (data.venue) metaParts.push(data.venue);
    if (data.date) metaParts.push(data.date);
    if (data.time) metaParts.push(data.time);
    var meta = metaParts.join(' &middot; ');

    var playerCount = Array.isArray(data.players) ? data.players.length : 0;
    var teamCount = data.numTeams || 0;

    return '<div class="live-card" data-session-id="' + id + '">' +
      '<div class="live-card__header">' +
        '<span class="live-card__pulse"></span>' +
        '<span class="live-card__label">' + escapeHtml(t('app.live')) + '</span>' +
        (isCreator
          ? '<button class="live-card__close-btn" data-session-id="' + id + '" title="' + escapeHtml(t('app.session.end')) + '">' + escapeHtml(t('app.actions.end')) + '</button>'
          : '') +
      '</div>' +
      '<h3 class="live-card__venue">' + escapeHtml(data.venue || t('app.session.session')) + '</h3>' +
      '<p class="live-card__meta">' + meta + '</p>' +
      '<p class="live-card__info">' + escapeHtml(t('app.session.teams_players', { teams: teamCount, players: playerCount })) + '</p>' +
      '<p class="live-card__creator">' + escapeHtml(t('app.session.by', { name: (data.creatorName || t('app.unknown')) })) + '</p>' +
    '</div>';
  }

  /* ---------- SESSION DETAIL OVERLAY ---------- */
  function showSessionDetail(id, data, isCreator) {
    var overlay = document.getElementById('sessionDetailOverlay');
    var titleEl = document.getElementById('sessionDetailTitle');
    var bodyEl = document.getElementById('sessionDetailBody');
    var closeX = document.getElementById('sessionDetailClose');
    if (!overlay || !bodyEl) return;

    if (titleEl) titleEl.textContent = data.venue || t('app.session.session');

    var teamNames = ['Team A', 'Team B', 'Team C', 'Team D', 'Team E', 'Team F', 'Team G', 'Team H'];

    var html = '';
    var metaParts = [];
    if (data.date) metaParts.push(data.date);
    if (data.time) metaParts.push(data.time);
    html += '<p class="session-detail__meta">' + metaParts.join(' &middot; ') + '</p>';
    html += '<p class="session-detail__creator">' + escapeHtml(t('app.session.created_by', { name: (data.creatorName || t('app.unknown')) })) + '</p>';

    if (Array.isArray(data.teams)) {
      html += '<div class="session-detail__teams">';
      data.teams.forEach(function (team, idx) {
        html += '<div class="session-detail__team">';
            html += '<h4 class="session-detail__team-name">' + escapeHtml(team.name || teamNames[idx] || t('app.team')) + '</h4>';
        html += '<ul class="session-detail__roster">';
        if (Array.isArray(team.players)) {
          team.players.forEach(function (p) {
            var isLinked = p.uid && !p.isGuest;
            var nameClass = isLinked ? 'session-detail__player-name session-detail__player-name--linked' : 'session-detail__player-name';
            var initial = p.name.charAt(0).toUpperCase();
            var avatarInner = (isLinked && p.photoURL)
              ? '<img src="' + p.photoURL + '" alt="" class="avatar-img">'
              : initial;
            var avatarHtml = isLinked
              ? '<span class="session-detail__player-avatar session-detail__player-avatar--linked' + (p.photoURL ? ' has-photo' : '') + '">' + avatarInner + '</span>'
              : '<span class="session-detail__player-avatar">' + avatarInner + '</span>';
            var ratingHtml = isCreator
              ? '<span class="session-detail__rating">' + p.rating + '</span>'
              : '';
            html += '<li class="session-detail__player">' +
              avatarHtml +
              '<span class="' + nameClass + '">' + escapeHtml(p.name) + '</span>' +
              '<span class="session-detail__player-pos">' + escapeHtml(t('app.player.pos.' + ((p.position || 'HYB') === 'HYB' ? 'hybrid' : ((p.position || 'HYB') === 'ATK' ? 'attacker' : ((p.position || 'HYB') === 'DEF' ? 'defender' : ((p.position || 'HYB') === 'GK' ? 'goalkeeper' : 'hybrid')))))) + '</span>' +
              ratingHtml +
            '</li>';
          });
        }
        html += '</ul></div>';
      });
      html += '</div>';
    }

    if (isCreator) {
      html += '<button class="btn btn--danger btn--sm session-detail__end-btn" data-session-id="' + id + '">Close Session</button>';
    }

    bodyEl.innerHTML = html;
    overlay.classList.add('modal-overlay--active');

    var endBtn = bodyEl.querySelector('.session-detail__end-btn');
    if (endBtn) {
      endBtn.addEventListener('click', function () {
        closeSession(id);
        overlay.classList.remove('modal-overlay--active');
      });
    }

    if (closeX) {
      closeX.onclick = function () {
        overlay.classList.remove('modal-overlay--active');
      };
    }

    overlay.addEventListener('click', function handler(e) {
      if (e.target === overlay) {
        overlay.classList.remove('modal-overlay--active');
        overlay.removeEventListener('click', handler);
      }
    });
  }

  /* ---------- CLOSE SESSION → MVP PICKER ---------- */
  function closeSession(sessionId) {
    var session = null;

    db.collection('sessions').doc(sessionId).get()
      .then(function (doc) {
        if (!doc.exists) return;
        session = doc.data();
        showMvpPicker(sessionId, session);
      }).catch(function (err) {
        console.error('Failed to load session:', err);
      });
  }

  /* ---------- MVP PICKER OVERLAY ---------- */
  function showMvpPicker(sessionId, data) {
    var overlay = document.getElementById('sessionDetailOverlay');
    var titleEl = document.getElementById('sessionDetailTitle');
    var bodyEl = document.getElementById('sessionDetailBody');
    var closeX = document.getElementById('sessionDetailClose');
    if (!overlay || !bodyEl) return;

    if (titleEl) titleEl.textContent = t('app.mvp.title');

    var allPlayers = [];
    if (Array.isArray(data.players)) {
      data.players.forEach(function (p) {
        allPlayers.push({ name: p.name, uid: p.uid || null });
      });
    }

    var html = '';
    html += '<p class="mvp-picker__prompt">' + escapeHtml(t('app.mvp.prompt')) + '</p>';
    html += '<div class="mvp-picker__list">';
    allPlayers.forEach(function (p) {
      html += '<button class="mvp-picker__option" data-player="' + escapeHtml(p.name) + '" data-uid="' + (p.uid || '') + '">' +
        '<span class="mvp-picker__option-name">' + escapeHtml(p.name) + '</span>' +
        '<span class="mvp-picker__option-arrow">&rarr;</span>' +
      '</button>';
    });
    html += '</div>';

    bodyEl.innerHTML = html;
    overlay.classList.add('modal-overlay--active');

    bodyEl.querySelectorAll('.mvp-picker__option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var playerName = btn.getAttribute('data-player');
        var playerUid = btn.getAttribute('data-uid');
        awardMvp(sessionId, playerName, playerUid);
        overlay.classList.remove('modal-overlay--active');
      });
    });

    if (closeX) {
      closeX.onclick = function () {
        overlay.classList.remove('modal-overlay--active');
      };
    }

    overlay.addEventListener('click', function handler(e) {
      if (e.target === overlay) {
        overlay.classList.remove('modal-overlay--active');
        overlay.removeEventListener('click', handler);
      }
    });
  }

  /* ---------- AWARD MVP & CLOSE SESSION ---------- */
  function awardMvp(sessionId, playerName, playerUid) {
    if (typeof db === 'undefined' || !db) return;

    var sessionDoc = null;

    db.collection('sessions').doc(sessionId).get().then(function (doc) {
      if (doc.exists) sessionDoc = doc.data();

      return db.collection('sessions').doc(sessionId).update({
        status: 'closed',
        mvp: playerName,
        mvpUid: playerUid || null,
        closedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).then(function () {
      showToast(t('toast.mvp', { name: playerName }), 'success');

      if (playerUid) {
        db.collection('users').doc(playerUid).update({
          mvpCount: firebase.firestore.FieldValue.increment(1)
        }).catch(function () {});

        notifyMvpAward(playerUid, sessionDoc ? sessionDoc.venue : '');
      }

      if (sessionDoc) {
        notifySessionClosed(sessionDoc, playerName);
      }
    }).catch(function (err) {
      console.error('Failed to close session:', err);
      showToast(t('toast.close_session_error'), 'info');
    });
  }

  function handleHashNavigation() {
    var hash = window.location.hash.replace('#', '');
    if (hash && viewTitles[hash]) {
      switchView(hash);
      history.replaceState(null, '', window.location.pathname);
    }
  }

  if (typeof auth !== 'undefined' && auth && auth.onAuthStateChanged) {
    auth.onAuthStateChanged(function (user) {
      if (!user) {
        window.location.replace('auth.html');
        return;
      }
      if (!user.emailVerified) {
        window.location.replace('auth.html');
        return;
      }
      bootApp(user);
      handleHashNavigation();
    });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      bootApp(null);
      handleHashNavigation();
    });
  }

  /* ---------- CACHE DOM ELEMENTS ---------- */
  function cacheElements() {
    els.pageTitle = document.getElementById('pageTitle');
    els.addForm = document.getElementById('addPlayerForm');
    els.playerName = document.getElementById('playerName');
    els.playerNameHint = document.getElementById('playerNameHint');
    els.playerRating = document.getElementById('playerRating');
    els.ratingVal = document.getElementById('ratingVal');
    els.roster = document.getElementById('roster');
    els.rosterEmpty = document.getElementById('rosterEmpty');
    els.playerCount = document.getElementById('playerCount');
    els.playerProgress = document.getElementById('playerProgress');
    els.generateBtn = document.getElementById('generateBtn');
    els.resultsGrid = document.getElementById('resultsGrid');
    els.resultsMeta = document.getElementById('resultsMeta');
    els.numTeams = document.getElementById('numTeams');
    els.playersPerTeam = document.getElementById('playersPerTeam');
    els.teamSummary = document.getElementById('teamSummary');
    els.sessionVenue = document.getElementById('sessionVenue');
    els.sessionDate = document.getElementById('sessionDate');
    els.sessionTime = document.getElementById('sessionTime');
    els.statPlayers = document.getElementById('statPlayers');
    els.statGames = document.getElementById('statGames');
    els.statGroups = document.getElementById('statGroups');
    els.statSessions = document.getElementById('statSessions');
    els.clearDataBtn = document.getElementById('clearDataBtn');
    els.searchToggle = document.getElementById('searchToggle');
    els.searchInput = document.getElementById('searchInput');
    els.searchClose = document.getElementById('searchClose');
    els.searchResults = document.getElementById('searchResults');
    els.groupsList = document.getElementById('groupsList');
    els.groupsEmpty = document.getElementById('groupsEmpty');
    // Official groups (Firestore)
    els.createOfficialGroupBtn = document.getElementById('createOfficialGroupBtn');
    els.joinGroupBtn = document.getElementById('joinGroupBtn');

    // Session mode / official group selection
    els.sessionMode = document.getElementById('sessionMode');
    els.officialGroupWrap = document.getElementById('officialGroupWrap');
    els.officialGroupSelect = document.getElementById('officialGroupSelect');
    els.officialGroupHint = document.getElementById('officialGroupHint');
    els.manageGroupsBtn = document.getElementById('manageGroupsBtn');
    els.resultsConfirmHint = document.getElementById('resultsConfirmHint');
    els.sessionModeCard = document.getElementById('sessionModeCard');

    // How to use buttons
    els.howtoQuickBtn = document.getElementById('howtoQuickBtn');
    els.howtoGroupBtn = document.getElementById('howtoGroupBtn');

    els.generateLoading = document.getElementById('generateLoading');
    els.toggleDark = document.getElementById('toggleDark');
  }

  /* ---------- LOCAL STORAGE ---------- */
  function loadData() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored) players = JSON.parse(stored);
      var games = localStorage.getItem(GAMES_KEY);
      if (games) gamesGenerated = parseInt(games, 10) || 0;
      var storedGroups = localStorage.getItem(GROUPS_KEY);
      if (storedGroups) groups = JSON.parse(storedGroups);
    } catch (e) {
      players = [];
      gamesGenerated = 0;
      groups = [];
    }
  }

  function saveData() {
    try {
      if (!isQuickSessionMode()) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      localStorage.setItem(GAMES_KEY, String(gamesGenerated));
      localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
    } catch (e) { /* silently fail */ }
  }

  function stripUidsFromQuickRoster() {
    if (!isQuickSessionMode()) return;
    var changed = false;
    players.forEach(function (p) {
      if (p.uid || p.photoURL) {
        p.uid = null;
        p.photoURL = null;
        changed = true;
      }
    });
    if (changed) {
      saveData();
      renderRoster();
    }
  }

  function updatePlayerNameFieldCopy() {
    if (!els.playerName) return;
    var hintEl = els.playerNameHint || document.getElementById('playerNameHint');
    if (isQuickSessionMode()) {
      if (hintEl) hintEl.textContent = t('app.player.name_hint_quick');
      els.playerName.placeholder = t('app.player.name_ph_quick');
    } else {
      if (hintEl) {
        hintEl.textContent = selectedGroupId
          ? t('app.player.name_hint_official')
          : t('app.player.name_hint_official_need_group');
      }
      els.playerName.placeholder = selectedGroupId
        ? t('app.player.name_ph_official')
        : t('app.player.name_ph');
    }
  }

  function invalidateGroupMemberMentionCache() {
    groupMemberMentionCache = {};
  }

  function fetchGroupMembersForMentions(groupId) {
    if (!groupId || typeof db === 'undefined' || !db || !currentUser) return Promise.resolve([]);
    var cached = groupMemberMentionCache[groupId];
    var now = Date.now();
    if (cached && (now - cached.ts < 90000)) return Promise.resolve(cached.list);
    return db.collection('groups').doc(groupId).collection('members').get().then(function (snap) {
      var list = [];
      snap.forEach(function (d) {
        var data = d.data() || {};
        list.push({
          uid: d.id,
          displayName: data.displayName || '',
          username: String(data.username || '').toLowerCase(),
          photoURL: data.photoURL || null
        });
      });
      groupMemberMentionCache[groupId] = { ts: Date.now(), list: list };
      return list;
    }).catch(function (err) {
      console.error('Group members load error:', err);
      return [];
    });
  }

  function filterMembersByMentionQuery(list, query) {
    var q = String(query || '').toLowerCase().trim();
    if (!q) return [];
    var scored = [];
    list.forEach(function (m) {
      if (!currentUser || m.uid === currentUser.uid) return;
      var un = m.username || '';
      var dn = (m.displayName || '').toLowerCase();
      var rank = -1;
      if (un.indexOf(q) === 0) rank = 0;
      else if (un.indexOf(q) >= 0) rank = 1;
      else if (dn.indexOf(q) === 0) rank = 2;
      else if (dn.indexOf(q) >= 0) rank = 3;
      if (rank < 0) return;
      scored.push({ m: m, rank: rank });
    });
    scored.sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return (a.m.displayName || '').localeCompare(b.m.displayName || '');
    });
    return scored.map(function (x) { return x.m; }).slice(0, 8);
  }

  function beginQuickSessionRoster() {
    players = [];
    editingId = null;
    pendingSession = null;
    selectedPlayerUid = null;
    selectedPlayerPhoto = null;
    var md = document.getElementById('mentionDropdown');
    if (md) md.innerHTML = '';
    if (els.addForm) els.addForm.reset();
    if (els.ratingVal) els.ratingVal.textContent = '5';
    if (els.playerName) els.playerName.classList.remove('add-form__input--linked');
    renderRoster();
    saveData();
    updatePlayerNameFieldCopy();
  }

  /* ---------- DARK MODE ---------- */
  function setupDarkMode() {
    var isDark = false;
    try { isDark = localStorage.getItem(DARK_KEY) === '1'; } catch (e) {}

    if (isDark) {
      document.body.classList.add('dark');
      if (els.toggleDark) els.toggleDark.checked = true;
    }

    if (els.toggleDark) {
      els.toggleDark.addEventListener('change', function () {
        var on = els.toggleDark.checked;
        document.body.classList.toggle('dark', on);
        try { localStorage.setItem(DARK_KEY, on ? '1' : '0'); } catch (e) {}
      });
    }
  }

  /* =========================================================
     OFFICIAL GROUPS + SESSION MODE
     ========================================================= */

  function setupSessionMode() {
    if (!els.sessionMode) return;

    function applyModeUI() {
      if (forceQuickFlow) {
        els.sessionMode.value = 'quick';
        if (els.sessionModeCard) els.sessionModeCard.style.display = 'none';
      } else {
        if (els.sessionModeCard) els.sessionModeCard.style.display = '';
      }

      var mode = els.sessionMode.value || 'quick';
      if (els.officialGroupWrap) els.officialGroupWrap.style.display = mode === 'official' ? '' : 'none';

      if (mode !== 'official') {
        selectedGroupId = '';
        selectedGroup = null;
        if (els.officialGroupSelect) els.officialGroupSelect.value = '';
      }

      // Match Details card: hide for quick games (no venue/date/time needed),
      // show for groups so admins can pick the venue, date and time.
      var matchCard = document.getElementById('matchDetailsCard');
      var venueInput = document.getElementById('sessionVenue');
      var dateInput  = document.getElementById('sessionDate');
      var timeInput  = document.getElementById('sessionTime');
      if (matchCard) {
        if (mode === 'official') {
          matchCard.style.display = '';
          if (venueInput) { venueInput.disabled = false; venueInput.required = true; }
          if (dateInput)  { dateInput.disabled  = false; }
          if (timeInput)  { timeInput.disabled  = false; }
        } else {
          // Quick game: hide card entirely + clear fields so they don't block submission
          matchCard.style.display = 'none';
          if (venueInput) { venueInput.value = ''; venueInput.required = false; venueInput.disabled = true; }
          if (dateInput)  { dateInput.value  = ''; dateInput.disabled = true; }
          if (timeInput)  { timeInput.value  = ''; timeInput.disabled = true; }
        }
      }

      stripUidsFromQuickRoster();
      updatePlayerNameFieldCopy();
      updateOfficialGroupHint();
      updateConfirmButtonState();
    }

    els.sessionMode.addEventListener('change', applyModeUI);

    if (els.officialGroupSelect) {
      els.officialGroupSelect.addEventListener('change', function () {
        selectedGroupId = els.officialGroupSelect.value || '';
        selectedGroup = officialGroups.find(function (g) { return g.id === selectedGroupId; }) || null;
        invalidateGroupMemberMentionCache();
        var md = document.getElementById('mentionDropdown');
        if (md) md.innerHTML = '';
        selectedPlayerUid = null;
        selectedPlayerPhoto = null;
        if (els.playerName) els.playerName.classList.remove('add-form__input--linked');
        updatePlayerNameFieldCopy();
        updateOfficialGroupHint();
        updateConfirmButtonState();
      });
    }

    if (els.manageGroupsBtn) {
      els.manageGroupsBtn.addEventListener('click', function () {
        switchView('groups');
      });
    }

    applyModeUI();
    updatePlayerNameFieldCopy();
  }

  function isOfficialModeReady() {
    if (!els.sessionMode || els.sessionMode.value !== 'official') return false;
    if (!selectedGroup) return false;
    return !!selectedGroup.isVerified && selectedGroup.myRole === 'admin';
  }

  function updateOfficialGroupHint() {
    if (!els.officialGroupHint) return;
    if (!els.sessionMode || els.sessionMode.value !== 'official') {
      els.officialGroupHint.textContent = '';
      return;
    }

    if (!selectedGroup) {
      els.officialGroupHint.textContent = t('app.official_group_hint.select_group');
      return;
    }

    var verified = !!selectedGroup.isVerified;
    var v = selectedGroup.verifiedMemberCount || 0;
    var role = selectedGroup.myRole || 'member';

    if (!verified) {
      els.officialGroupHint.textContent = t('app.official_group_hint.verification', { count: v });
      return;
    }
    if (role !== 'admin') {
      els.officialGroupHint.textContent = t('app.official_group_hint.not_admin');
      return;
    }

    els.officialGroupHint.textContent = t('app.official_group_hint.verified');
  }

  function updateConfirmButtonState() {
    var btn = document.getElementById('resultsConfirm');
    if (!btn) return;

    if (!els.sessionMode || els.sessionMode.value !== 'official') {
      btn.style.display = 'none';
      if (els.resultsConfirmHint) els.resultsConfirmHint.textContent = t('app.results.quick_hint');
      return;
    }

    btn.style.display = '';
    btn.disabled = !isOfficialModeReady();
    if (els.resultsConfirmHint) {
      els.resultsConfirmHint.textContent = isOfficialModeReady()
        ? ''
        : t('app.results.official_hint');
    }
  }

  function setupOfficialGroups(user) {
    if (!user || typeof db === 'undefined' || !db) return;

    if (els.createOfficialGroupBtn) {
      els.createOfficialGroupBtn.addEventListener('click', function () {
        showModal({
          title: t('modal.new_group.title'),
          message: t('modal.new_group.body'),
          inputMode: true,
          placeholder: t('modal.new_group.placeholder'),
          confirmText: t('modal.action.create'),
          onConfirm: function (val) {
            var name = (val || '').trim();
            if (!name) return;
            createOfficialGroup(name);
          }
        });
      });
    }

    if (els.joinGroupBtn) {
      els.joinGroupBtn.addEventListener('click', function () {
        showModal({
          title: t('modal.join_group.title'),
          message: t('modal.join_group.body'),
          inputMode: true,
          placeholder: t('modal.join_group.placeholder'),
          confirmText: t('modal.action.join'),
          onConfirm: function (val) {
            var code = (val || '').trim().toUpperCase();
            if (!code) return;
            joinGroupByCode(code);
          }
        });
      });
    }

    // Load groups list from the user's `groupIds` array (populated on join/create).
    // Cache the previous serialized groupIds so we only re-fetch when membership actually changes
    // (avoiding wasted Firestore reads when other user fields change like avatar, mvpCount, etc.).
    var lastGroupIdsKey = null;
    db.collection('users').doc(user.uid).onSnapshot(function (doc) {
      var groupIds = [];
      if (doc.exists) {
        var d = doc.data() || {};
        if (Array.isArray(d.groupIds)) groupIds = d.groupIds.slice();
      }
      var key = groupIds.slice().sort().join('|');
      if (key === lastGroupIdsKey) return;
      lastGroupIdsKey = key;
      loadOfficialGroups(groupIds);
    });
  }

  function loadOfficialGroups(groupIds) {
    if (!currentUser || !db) return;

    officialGroups = [];

    if (!groupIds || groupIds.length === 0) {
      renderOfficialGroups();
      renderOfficialGroupSelect();
      updateOfficialGroupHint();
      updateConfirmButtonState();
      return;
    }

    // Show skeleton placeholders while we fetch the groups in parallel
    showGroupsSkeleton(Math.min(groupIds.length, 4));

    var pending = groupIds.length;
    var results = [];

    groupIds.forEach(function (gid) {
      db.collection('groups').doc(gid).get().then(function (gdoc) {
        if (!gdoc.exists) return;
        var g = gdoc.data() || {};
        return db.collection('groups').doc(gid).collection('members').doc(currentUser.uid).get().then(function (mdoc) {
          var role = 'member';
          if (mdoc.exists) role = (mdoc.data().role || 'member');
          results.push({
            id: gid,
            name: g.name || 'Group',
            joinCode: g.joinCode || '',
            isVerified: !!g.isVerified,
            memberCount: g.memberCount || 0,
            verifiedMemberCount: g.verifiedMemberCount || 0,
            createdAt: g.createdAt || null,
            bannerURL: g.bannerURL || null,
            myRole: role
          });
        });
      }).catch(function () {}).finally(function () {
        pending--;
        if (pending === 0) finalize();
      });
    });

    function finalize() {
      officialGroups = results.sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });

      renderOfficialGroups();
      renderOfficialGroupSelect();

      if (selectedGroupId) {
        selectedGroup = officialGroups.find(function (g) { return g.id === selectedGroupId; }) || null;
      }

      updateOfficialGroupHint();
      updateConfirmButtonState();
    }
  }

  function renderOfficialGroupSelect() {
    if (!els.officialGroupSelect) return;
    var html = '<option value="">' + escapeHtml(t('app.groups.select_placeholder')) + '</option>';
    officialGroups.forEach(function (g) {
      html += '<option value="' + g.id + '">' + escapeHtml(g.name) + '</option>';
    });
    els.officialGroupSelect.innerHTML = html;
    if (selectedGroupId) els.officialGroupSelect.value = selectedGroupId;
  }

  // Skeleton placeholder for groups list while data is fetched.
  function showGroupsSkeleton(count) {
    if (!els.groupsList) return;
    if (els.groupsEmpty) els.groupsEmpty.style.display = 'none';
    // Remove any prior real items or skeletons
    var prior = els.groupsList.querySelectorAll('.group-item, .skel-row');
    prior.forEach(function (n) { n.remove(); });
    var n = Math.max(1, Math.min(6, count || 3));
    for (var i = 0; i < n; i++) {
      var row = document.createElement('div');
      row.className = 'skel-row';
      row.innerHTML =
        '<div class="skel skel-avatar"></div>' +
        '<div class="skel-lines">' +
          '<div class="skel skel-line skel-line--med"></div>' +
          '<div class="skel skel-line skel-line--short"></div>' +
        '</div>' +
        '<div class="skel skel-pill"></div>';
      els.groupsList.appendChild(row);
    }
  }

  function clearGroupsSkeleton() {
    if (!els.groupsList) return;
    var sk = els.groupsList.querySelectorAll('.skel-row');
    sk.forEach(function (n) { n.remove(); });
  }

  function renderOfficialGroups() {
    if (!els.groupsList) return;

    clearGroupsSkeleton();
    var items = els.groupsList.querySelectorAll('.group-item');
    items.forEach(function (item) { item.remove(); });

    if (!officialGroups || officialGroups.length === 0) {
      if (els.groupsEmpty) els.groupsEmpty.style.display = '';
      return;
    }
    if (els.groupsEmpty) els.groupsEmpty.style.display = 'none';

    officialGroups.forEach(function (g) {
      var item = document.createElement('div');
      item.className = 'group-item';
      var initial = (g.name || 'G').charAt(0).toUpperCase();
      var verified = !!g.isVerified;
      var v = g.verifiedMemberCount || 0;
      var status = verified
        ? t('app.groups.status_verified')
        : t('app.groups.status_progress', { count: v });
      var roleTag = g.myRole === 'admin' ? t('app.groups.role_admin') : t('app.groups.role_member');

      item.innerHTML =
        '<div class="group-item__info">' +
          '<div class="group-item__badge">' + initial + '</div>' +
          '<div>' +
            '<span class="group-item__name">' + escapeHtml(g.name) + '</span><br>' +
            '<span class="group-item__count">' + escapeHtml(status) + ' · ' + roleTag + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="roster__actions">' +
          (verified && g.myRole === 'admin'
            ? '<button class="roster__btn roster__btn--edit" data-create-session="' + g.id + '" data-i18n-title="app.groups.action_create_session" title="' + escapeHtml(t('app.groups.action_create_session')) + '">+</button>'
            : '') +
          '<span class="group-item__arrow" aria-hidden="true">\u2192</span>' +
        '</div>';

      item.addEventListener('click', function () {
        if (!currentUser) return;
        selectedGroupId = g.id;
        selectedGroup = g;
        openGroupDetail(g.id);
      });

      els.groupsList.appendChild(item);
    });

    els.groupsList.querySelectorAll('[data-create-session]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var gid = btn.getAttribute('data-create-session') || '';
        var g = officialGroups.find(function (x) { return x.id === gid; }) || null;
        if (!g) return;
        selectedGroupId = gid;
        selectedGroup = g;
        forceQuickFlow = false;
        switchView('session');
        if (els.sessionMode) {
          els.sessionMode.value = 'official';
          try { els.sessionMode.dispatchEvent(new Event('change')); } catch (e2) {}
        }
        if (els.officialGroupSelect) {
          els.officialGroupSelect.value = gid;
          try { els.officialGroupSelect.dispatchEvent(new Event('change')); } catch (e3) {}
        }
        listenGroupLiveSessions(currentUser, gid);
      });
    });

  }

  function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        return;
      }
    } catch (e) {}
    try {
      var el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'absolute';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    } catch (e) {}
  }

  /* ---------- GROUP DETAIL ---------- */
  var groupMembersUnsub = null;
  var groupMembersForGid = '';
  var groupSessionsUnsub = null;
  var groupSessionsForGid = '';
  var groupDocUnsub = null;
  var groupDocForGid = '';

  function stopGroupMembersListener() {
    if (groupMembersUnsub) groupMembersUnsub();
    groupMembersUnsub = null;
    groupMembersForGid = '';
  }

  function stopGroupSessionsCount() {
    // sessions-count is now a one-shot .get() (no live listener), so we just clear the gid guard
    // to allow a fresh fetch on the next visit.
    if (groupSessionsUnsub) { try { groupSessionsUnsub(); } catch (e) {} }
    groupSessionsUnsub = null;
    groupSessionsForGid = '';
  }

  function stopGroupDocListener() {
    if (groupDocUnsub) groupDocUnsub();
    groupDocUnsub = null;
    groupDocForGid = '';
  }

  // Live listener on the group document: keeps bannerURL, name, counts, etc. in sync.
  // Without this, the cached `officialGroups` array can go stale (e.g. after a banner upload)
  // and the group detail page would show no banner on revisit.
  function listenGroupDoc(gid) {
    if (!db || !gid) return;
    if (groupDocForGid === gid && groupDocUnsub) return;
    stopGroupDocListener();
    groupDocForGid = gid;
    groupDocUnsub = db.collection('groups').doc(gid).onSnapshot(function (doc) {
      if (!doc.exists) return;
      var g = doc.data() || {};

      // Update the cache entry in-place so other views (groups list) also stay fresh.
      var idx = -1;
      for (var i = 0; i < officialGroups.length; i++) {
        if (officialGroups[i] && officialGroups[i].id === gid) { idx = i; break; }
      }
      if (idx >= 0) {
        var prev = officialGroups[idx] || {};
        officialGroups[idx] = {
          id: gid,
          name: g.name || prev.name || 'Group',
          joinCode: g.joinCode || prev.joinCode || '',
          isVerified: !!g.isVerified,
          memberCount: g.memberCount || 0,
          verifiedMemberCount: g.verifiedMemberCount || 0,
          createdAt: g.createdAt || prev.createdAt || null,
          bannerURL: g.bannerURL || null,
          myRole: prev.myRole || 'member'
        };
      }

      if (selectedGroup && selectedGroup.id === gid) {
        selectedGroup.name = g.name || selectedGroup.name;
        selectedGroup.bannerURL = g.bannerURL || null;
        selectedGroup.memberCount = g.memberCount || 0;
        selectedGroup.verifiedMemberCount = g.verifiedMemberCount || 0;
        selectedGroup.isVerified = !!g.isVerified;
        selectedGroup.createdAt = g.createdAt || selectedGroup.createdAt;
      }

      // Refresh visible UI if we're still on the group view
      if (selectedGroupId === gid) renderGroupDetailHeader();
    }, function (err) {
      console.error('Group doc listener error:', err);
    });
  }

  function openGroupDetail(gid) {
    if (!currentUser || !db || !gid) return;
    selectedGroupId = gid;
    selectedGroup = officialGroups.find(function (x) { return x.id === gid; }) || selectedGroup || null;
    switchView('group');
    renderGroupDetailHeader();
    listenGroupDoc(gid);
    listenGroupLiveSessions(currentUser, gid);
    listenGroupMembers(gid);
    listenGroupSessionsCount(gid);
    loadGroupSessionHistory(gid);
  }

  function loadGroupSessionHistory(gid) {
    if (typeof db === 'undefined' || !db || !gid) return;
    var container = document.getElementById('groupSessionHistory');
    if (!container) return;

    container.innerHTML = renderSessionHistorySkeleton(3);

    db.collection('sessions')
      .where('groupId', '==', gid)
      .where('status', '==', 'closed')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get()
      .then(function (snap) {
        if (snap.empty) {
          container.innerHTML =
            '<div class="empty-state">' +
              '<svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
              '<span class="empty-state__text" data-i18n="app.group.sessions_empty_title">No sessions yet</span>' +
              '<span class="empty-state__sub" data-i18n="app.group.sessions_empty_sub">Saved official sessions will show up here</span>' +
            '</div>';
          if (typeof window.applyTranslations === 'function') window.applyTranslations(container);
          return;
        }

        var html = '<div class="shist">';
        snap.forEach(function (doc) {
          var s = doc.data();
          var dateStr = '';
          if (s.date) {
            var parts = s.date.split('-');
            if (parts.length === 3) dateStr = parts[2] + '/' + parts[1] + '/' + parts[0];
          }
          if (s.time) dateStr += (dateStr ? ' · ' : '') + s.time;
          var venue = s.venue || '';

          var teamsSummary = '';
          if (s.teams && s.teams.length > 0) {
            teamsSummary = s.teams.map(function (t) {
              return t.name + ' (' + (t.players ? t.players.length : 0) + ')';
            }).join(' vs ');
          }

          var mvpHtml = s.mvp ? '<span class="shist__mvp">MVP: ' + escapeHtml(s.mvp) + '</span>' : '';

          html +=
            '<div class="shist__item">' +
              '<div class="shist__head">' +
                '<span class="shist__date">' + escapeHtml(dateStr || '—') + '</span>' +
                (venue ? '<span class="shist__venue">' + escapeHtml(venue) + '</span>' : '') +
              '</div>' +
              (teamsSummary ? '<div class="shist__teams">' + escapeHtml(teamsSummary) + '</div>' : '') +
              mvpHtml +
            '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
      })
      .catch(function (err) {
        console.warn('[group history] failed', err);
        container.innerHTML =
          '<div class="empty-state">' +
            '<span class="empty-state__text">Could not load sessions.</span>' +
          '</div>';
      });
  }

  function renderGroupDetailHeader() {
    var nameEl = document.getElementById('groupDetailName');
    var metaEl = document.getElementById('groupDetailMeta');
    var createdEl = document.getElementById('groupCreatedOn');
    var copyBtn = document.getElementById('groupDetailCopyCode');
    var bannerEl = document.getElementById('groupBanner');
    var bannerEditBtn = document.getElementById('groupBannerEdit');
    var bannerInput = document.getElementById('groupBannerInput');
    var statMembersEl = document.getElementById('groupStatMembers');
    var statVerifiedEl = document.getElementById('groupStatVerified');
    var statSessionsEl = document.getElementById('groupStatSessions');
    if (!nameEl) return;

    var g = officialGroups.find(function (x) { return x.id === selectedGroupId; }) || selectedGroup || null;
    var gname = (g && g.name) ? g.name : 'Group';
    nameEl.textContent = gname;
    var initial = (gname || 'G').charAt(0).toUpperCase();

    if (bannerEl) {
      var bUrl = g && g.bannerURL ? String(g.bannerURL) : '';
      bannerEl.style.backgroundImage = bUrl ? ('url("' + bUrl.replace(/"/g, '\\"') + '")') : 'none';
    }

    if (metaEl) {
      if (!g) {
        metaEl.textContent = '';
      } else {
        var verified = !!g.isVerified;
        var v = g.verifiedMemberCount || 0;
        var status = verified ? t('app.groups.status_verified') : t('app.groups.status_progress', { count: v });
        var roleTag = g.myRole === 'admin' ? t('app.groups.role_admin') : t('app.groups.role_member');
        metaEl.textContent = status + ' · ' + roleTag;
      }
    }

    if (statMembersEl) statMembersEl.textContent = (g && typeof g.memberCount === 'number') ? String(g.memberCount) : '0';
    if (statVerifiedEl) statVerifiedEl.textContent = (g && typeof g.verifiedMemberCount === 'number') ? String(g.verifiedMemberCount) : '0';
    if (statSessionsEl && (!g || typeof statSessionsEl.textContent !== 'string' || !statSessionsEl.textContent)) statSessionsEl.textContent = '0';

    if (createdEl) {
      var createdAt = g && g.createdAt ? g.createdAt : null;
      try {
        var d = createdAt && typeof createdAt.toDate === 'function' ? createdAt.toDate() : null;
        createdEl.textContent = d ? t('app.group.created_on', { date: d.toLocaleDateString() }) : '';
      } catch (e) {
        createdEl.textContent = '';
      }
    }

    // Only admins can change the group banner
    if (bannerEditBtn && bannerInput) {
      var canEditBanner = !!(g && g.myRole === 'admin');
      bannerEditBtn.style.display = canEditBanner ? '' : 'none';

      if (canEditBanner) {
        bannerEditBtn.onclick = function () { bannerInput.click(); };
        bannerInput.onchange = function () {
          var file = bannerInput.files && bannerInput.files[0];
          if (!file) return;

          if (!file.type || !file.type.startsWith('image/')) {
            showToast(t('toast.avatar_select_image'), 'info');
            return;
          }

          if (file.size > 5 * 1024 * 1024) {
            showToast(t('toast.avatar_size_limit'), 'info');
            return;
          }

          showToast(t('toast.uploading'), 'info');
          compressAndUploadGroupBanner(file, selectedGroupId);
          bannerInput.value = '';
        };
      } else {
        bannerEditBtn.onclick = null;
        bannerInput.onchange = null;
      }
    }

    if (copyBtn) {
      copyBtn.onclick = function () {
        var gg = officialGroups.find(function (x) { return x.id === selectedGroupId; }) || g || null;
        var code = gg && gg.joinCode ? gg.joinCode : '';
        if (!code) return;
        copyToClipboard(code);
        showToast(t('toast.invite_code_copied'), 'success');
      };
    }

    var startBtn = document.getElementById('groupDetailStartSession');
    if (startBtn) {
      var canStart = !!(g && g.myRole === 'admin' && g.isVerified);
      // Show only for admins of verified groups; admins of unverified groups still
      // see the button but get a hint when tapping. Members don't see it at all.
      var visibleForRole = !!(g && g.myRole === 'admin');
      startBtn.style.display = visibleForRole ? '' : 'none';
      startBtn.disabled = !canStart;
      startBtn.classList.toggle('btn--disabled', !canStart);
      startBtn.onclick = function () {
        if (!g) return;
        if (g.myRole !== 'admin') {
          showToast(t('app.group.start_session_admin_only'), 'info');
          return;
        }
        if (!g.isVerified) {
          showToast(t('app.group.start_session_unverified'), 'info');
          return;
        }
        selectedGroupId = g.id;
        selectedGroup = g;
        forceQuickFlow = false;
        switchView('session');
        if (els.sessionMode) {
          els.sessionMode.value = 'official';
          try { els.sessionMode.dispatchEvent(new Event('change')); } catch (e2) {}
        }
        if (els.officialGroupSelect) {
          els.officialGroupSelect.value = g.id;
          try { els.officialGroupSelect.dispatchEvent(new Event('change')); } catch (e3) {}
        }
        // Pre-fill venue with the group's saved venue if available
        var venueInput = document.getElementById('sessionVenue');
        if (venueInput && g.venue) venueInput.value = g.venue;
        listenGroupLiveSessions(currentUser, g.id);
      };
    }
  }

  function compressAndUploadGroupBanner(file, gid) {
    if (!gid) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        var maxSize = 1400; // banner can be wider
        var w = img.width;
        var h = img.height;

        if (w > maxSize) { h = h * (maxSize / w); w = maxSize; }

        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(function (blob) {
          if (!blob) { showToast(t('toast.avatar_process_failed'), 'info'); return; }
          uploadGroupBanner(blob, gid);
        }, 'image/jpeg', 0.82);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function uploadGroupBanner(blob, gid) {
    if (typeof storage === 'undefined' || !storage) {
      showToast(t('toast.storage_unavailable'), 'info');
      return;
    }
    if (!db) return;
    if (!currentUser || !currentUser.uid) return;

    var path = 'group-banners/' + gid + '/banner.jpg';
    var ref = storage.ref().child(path);

    // Optimistic UI: show banner immediately from the blob
    try {
      var bannerEl = document.getElementById('groupBanner');
      if (bannerEl) {
        var tmpUrl = URL.createObjectURL(blob);
        bannerEl.style.backgroundImage = 'url("' + tmpUrl.replace(/"/g, '\\"') + '")';
        setTimeout(function () {
          try { URL.revokeObjectURL(tmpUrl); } catch (e2) {}
        }, 60000);
      }
    } catch (e) {}

    // Extra guard: confirm this user is admin of this group.
    db.collection('groups').doc(gid).collection('members').doc(currentUser.uid).get().then(function (doc) {
      var role = doc.exists ? String((doc.data() || {}).role || '') : '';
      if (role !== 'admin') {
        var err = new Error('Not admin');
        err.code = 'niterun/not-admin';
        throw err;
      }

      try {
        console.log('[Group banner upload] bucket=', ref.bucket, 'path=', path, 'uid=', currentUser.uid, 'gid=', gid);
      } catch (e) {}

      return ref.put(blob, { contentType: 'image/jpeg' });
    })
      .then(function (snapshot) {
        return snapshot.ref.getDownloadURL();
      })
      .then(function (url) {
        // Persist the URL on the group doc so the banner survives navigation/reload.
        return db.collection('groups').doc(gid).update({ bannerURL: url })
          .then(function () { return url; })
          .catch(function (err) {
            err = err || new Error('Failed to save banner');
            err.code = err.code || 'niterun/banner-save-failed';
            throw err;
          });
      })
      .then(function (url) {
        // Update local cache so UI refreshes without reload
        try {
          var found = false;
          officialGroups.forEach(function (og) {
            if (og && og.id === gid) { og.bannerURL = url; found = true; }
          });
          if (!found) {
            // Cache didn't have this group yet — push a stub so renders are immediate.
            officialGroups.push({ id: gid, bannerURL: url });
          }
          if (selectedGroup && selectedGroup.id === gid) selectedGroup.bannerURL = url;
          renderGroupDetailHeader();
        } catch (e2) {}
        showToast(t('toast.group_banner_updated'), 'success');
      })
      .catch(function (err) {
        console.error('Group banner upload error:', err);
        var c = err && err.code ? String(err.code) : '';
        if (c === 'niterun/not-admin') {
          showToast(t('toast.error.permission') || 'Not allowed.', 'info');
          return;
        }
        if (c === 'niterun/banner-save-failed' || c === 'permission-denied') {
          showToast(t('toast.error.permission') || 'Could not save banner. Please try again.', 'info');
          return;
        }
        if (c === 'storage/unauthorized' || c === 'storage/unauthenticated') {
          showToast(t('toast.error.permission') || 'Not allowed.', 'info');
        } else if (c === 'storage/canceled') {
          // no toast needed
        } else if (c === 'storage/retry-limit-exceeded') {
          showToast(t('toast.error.offline') || 'Connection issue.', 'info');
        } else {
          showToast(t('toast.upload_failed'), 'info');
        }
      });
  }

  function listenGroupSessionsCount(gid) {
    if (!currentUser || !db) return;
    var el = document.getElementById('groupStatSessions');
    if (!el) return;

    if (!gid) {
      stopGroupSessionsCount();
      el.textContent = '0';
      return;
    }

    if (groupSessionsForGid === gid) return;
    stopGroupSessionsCount();
    groupSessionsForGid = gid;

    // One-time fetch instead of snapshot listener: total session count rarely needs to be realtime,
    // and an open listener over `sessions where groupId==gid` reads every doc on every change.
    // We refresh on each visit to the group detail page (via openGroupDetail).
    db.collection('sessions')
      .where('groupId', '==', gid)
      .orderBy('createdAt', 'desc')
      .get()
      .then(function (snap) {
        if (groupSessionsForGid !== gid) return; // user navigated away
        el.textContent = String(snap.size || 0);
      })
      .catch(function (err) {
        console.error('Group sessions count error:', err);
        el.textContent = '0';
      });
  }

  function listenGroupMembers(gid) {
    if (!currentUser || !db) return;
    var wrap = document.getElementById('groupDetailMembers');
    if (!wrap) return;

    if (!gid) {
      stopGroupMembersListener();
      wrap.innerHTML = '';
      return;
    }

    if (groupMembersForGid === gid && groupMembersUnsub) return;
    stopGroupMembersListener();
    groupMembersForGid = gid;

    // Skeleton placeholders for members
    var skelHtml = '<div class="skel-list">';
    for (var i = 0; i < 3; i++) {
      skelHtml += '<div class="skel-row">' +
        '<div class="skel skel-avatar"></div>' +
        '<div class="skel-lines">' +
          '<div class="skel skel-line skel-line--med"></div>' +
          '<div class="skel skel-line skel-line--short"></div>' +
        '</div>' +
        '<div class="skel skel-pill"></div>' +
        '</div>';
    }
    skelHtml += '</div>';
    wrap.innerHTML = skelHtml;

    groupMembersUnsub = db.collection('groups').doc(gid).collection('members')
      .orderBy('joinedAt', 'desc')
      .onSnapshot(function (snapshot) {
        var g = officialGroups.find(function (x) { return x.id === gid; }) || selectedGroup || null;
        var iAmAdmin = !!(g && g.myRole === 'admin');

        var rows = [];
        snapshot.forEach(function (doc) {
          var memberId = doc.id;
          var d = doc.data() || {};
          var nm = d.displayName || 'Player';
          var role = d.role === 'admin' ? t('app.groups.role_admin') : t('app.groups.role_member');
          var initial = (nm || 'P').charAt(0).toUpperCase();
          var photo = d.photoURL || '';
          var avatarHtml = photo
            ? ('<img class="member-row__avatar-img" src="' + escapeHtml(photo) + '" alt="">')
            : escapeHtml(initial);
          var isAdmin = d.role === 'admin';

          var canPromote = iAmAdmin && !isAdmin && memberId !== currentUser.uid;
          var actionsHtml = canPromote
            ? '<button type="button" class="member-row__promote" data-promote-uid="' + escapeHtml(memberId) + '">' +
                escapeHtml(t('app.group.member.make_admin')) +
              '</button>'
            : '';

          rows.push(
            '<div class="member-row' + (isAdmin ? ' member-row--admin' : '') + '">' +
              '<div class="member-row__left">' +
                '<div class="member-row__avatar">' + avatarHtml + '</div>' +
                '<div class="member-row__info">' +
                  '<div class="member-row__name">' + escapeHtml(nm) + '</div>' +
                  '<div class="member-row__role">' + (isAdmin ? ('<span class="member-row__admin-badge">★ ' + escapeHtml(role) + '</span>') : escapeHtml(role)) + '</div>' +
                '</div>' +
              '</div>' +
              (actionsHtml ? '<div class="member-row__actions">' + actionsHtml + '</div>' : '') +
            '</div>'
          );
        });

        if (rows.length === 0) {
          wrap.innerHTML =
            '<div class="empty-state">' +
              '<span class="empty-state__text">' + escapeHtml(t('app.group.members_empty')) + '</span>' +
            '</div>';
          return;
        }

        wrap.innerHTML = rows.join('');

        wrap.querySelectorAll('[data-promote-uid]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var uid = btn.getAttribute('data-promote-uid');
            if (!uid) return;
            promoteMemberToAdmin(gid, uid, btn);
          });
        });
      }, function (err) {
        console.error('Members listener error:', err);
      });
  }

  function promoteMemberToAdmin(gid, uid, btn) {
    if (!currentUser || !db || !gid || !uid) return;

    var memberName = '';
    try {
      var nameEl = btn.closest('.member-row').querySelector('.member-row__name');
      if (nameEl) memberName = nameEl.textContent || '';
    } catch (e) { memberName = ''; }

    var prompt = t('app.group.member.confirm_make_admin', { name: memberName || t('app.unknown') });
    if (!window.confirm(prompt)) return;

    btn.disabled = true;
    var originalLabel = btn.textContent;
    btn.textContent = t('app.group.member.promoting');

    db.collection('groups').doc(gid).collection('members').doc(uid)
      .update({ role: 'admin' })
      .then(function () {
        showToast(t('toast.member_promoted', { name: memberName || t('app.unknown') }), 'success');
      })
      .catch(function (err) {
        console.error('Promote member failed:', err);
        btn.disabled = false;
        btn.textContent = originalLabel;
        var msg = (err && err.code === 'permission-denied')
          ? t('toast.member_promote_no_permission')
          : t('toast.member_promote_failed');
        showToast(msg, 'error');
      });
  }

  function makeJoinCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  }

  function createOfficialGroup(name) {
    if (!currentUser || !db) return;

    var joinCode = makeJoinCode();
    var attempts = 0;

    function tryCreate() {
      attempts++;
      db.collection('groups').where('joinCode', '==', joinCode).limit(1).get().then(function (snap) {
        if (!snap.empty && attempts < 5) {
          joinCode = makeJoinCode();
          return tryCreate();
        }

        return db.collection('groups').add({
          name: name,
          ownerUid: currentUser.uid,
          joinCode: joinCode,
          memberCount: 1,
          verifiedMemberCount: 1,
          isVerified: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function (ref) {
          var gid = ref.id;
          var batch = db.batch();
          var memberRef = db.collection('groups').doc(gid).collection('members').doc(currentUser.uid);
          batch.set(memberRef, {
            role: 'admin',
            joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
            emailVerified: true,
            displayName: currentUser.displayName || '',
            username: '',
            photoURL: null
          });
          var userRef = db.collection('users').doc(currentUser.uid);
          batch.update(userRef, {
            groupIds: firebase.firestore.FieldValue.arrayUnion(gid),
            groupCount: firebase.firestore.FieldValue.increment(1)
          });
          return batch.commit().then(function () {
            showToast(t('toast.group_created'), 'success');
            // Switch to official mode and preselect this group
            selectedGroupId = gid;
            selectedGroup = null;
            if (els.sessionMode) els.sessionMode.value = 'official';
            if (els.officialGroupWrap) els.officialGroupWrap.style.display = '';
          });
        });
      }).catch(function (err) {
        console.error('Create group error:', err);
        try { window.NiteRunErrors && window.NiteRunErrors.log(err, 'createGroup'); } catch (e2) {}
        var msg = t('toast.group_create_failed');
        var c = err && err.code ? String(err.code) : '';
        if (c === 'permission-denied') msg = t('toast.error.permission');
        else if (c === 'unavailable') msg = t('toast.error.offline');
        showToast(msg, 'info');
      });
    }

    tryCreate();
  }

  function joinGroupByCode(code) {
    if (!currentUser || !db) return;

    db.collection('groups').where('joinCode', '==', code).limit(1).get().then(function (snap) {
      if (snap.empty) {
        showToast(t('toast.group_not_found'), 'info');
        return;
      }
      var gdoc = snap.docs[0];
      var gid = gdoc.id;

      var groupRef = db.collection('groups').doc(gid);
      var memberRef = groupRef.collection('members').doc(currentUser.uid);
      var userRef = db.collection('users').doc(currentUser.uid);

      return db.runTransaction(function (tx) {
        return tx.get(memberRef).then(function (m) {
          if (m.exists) return { already: true, gid: gid };
          return tx.get(groupRef).then(function (g) {
            if (!g.exists) throw new Error('Group missing');

            tx.set(memberRef, {
              role: 'member',
              joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
              emailVerified: true,
              displayName: currentUser.displayName || '',
              username: '',
              photoURL: null
            });

            var data = g.data() || {};
            var nextMemberCount = (data.memberCount || 0) + 1;
            var nextVerifiedCount = (data.verifiedMemberCount || 0) + 1;
            var isVerified = nextVerifiedCount >= 10;

            tx.update(groupRef, {
              memberCount: nextMemberCount,
              verifiedMemberCount: nextVerifiedCount,
              isVerified: isVerified
            });

            tx.update(userRef, {
              groupIds: firebase.firestore.FieldValue.arrayUnion(gid),
              groupCount: firebase.firestore.FieldValue.increment(1)
            });

            return { already: false, gid: gid, verified: isVerified, count: nextVerifiedCount };
          });
        });
      }).then(function (res) {
        if (res && res.already) {
          showToast(t('toast.group_already_in'), 'info');
        } else {
          showToast(res.verified ? t('toast.group_joined_verified') : t('toast.group_joined_progress', { count: res.count }), 'success');
        }

        selectedGroupId = gid;
        if (els.sessionMode) els.sessionMode.value = 'official';
        if (els.officialGroupWrap) els.officialGroupWrap.style.display = '';
        switchView('session');
      });
    }).catch(function (err) {
      console.error('Join group error:', err);
      try { window.NiteRunErrors && window.NiteRunErrors.log(err, 'joinGroup'); } catch (e2) {}
      var msg = t('toast.group_join_failed');
      var c = err && err.code ? String(err.code) : '';
      if (c === 'permission-denied') msg = t('toast.error.permission');
      else if (c === 'unavailable') msg = t('toast.error.offline');
      showToast(msg, 'info');
    });
  }

  /* ---------- POPULATE USER INFO ---------- */
  function populateUserInfo(user) {
    var displayName = user.displayName || 'Player';
    var initial = displayName.charAt(0).toUpperCase();

    /* Topbar */
    var topbarName = document.querySelector('.topbar__name');
    var topbarAvatar = document.querySelector('.topbar__avatar');
    var topbarUsername = document.getElementById('topbarUsername');
    if (topbarName) topbarName.textContent = displayName;
    if (topbarAvatar) topbarAvatar.textContent = initial;

    /* Profile view — hero card */
    var profileAvatars = document.querySelectorAll('.profile__avatar');
    var profileNames = document.querySelectorAll('.profile__name');
    var profileMetas = document.querySelectorAll('.profile__meta');
    var profileUsername = document.getElementById('profileUsername');

    profileAvatars.forEach(function (el) { el.textContent = initial; });
    profileNames.forEach(function (el) { el.textContent = displayName; });

    /* Member since year */
    var joinYear = '2026';
    if (user.metadata && user.metadata.creationTime) {
      joinYear = new Date(user.metadata.creationTime).getFullYear();
    }
    profileMetas.forEach(function (el) { el.textContent = t('app.member_since', { year: joinYear }); });

    /* Fetch Firestore user doc for username, mvpCount, sessionsPlayed */
    if (typeof db !== 'undefined' && db) {
      db.collection('users').doc(user.uid).onSnapshot(function (doc) {
        if (!doc.exists) return;
        var data = doc.data();

        if (data.username) {
          if (topbarUsername) topbarUsername.textContent = '@' + data.username;
          if (profileUsername) profileUsername.textContent = '@' + data.username;
        }

        var mvps = data.mvpCount || 0;
        var sessions = data.sessionsPlayed || 0;
        var friendCount = data.friendCount || 0;
        var groupsCount = data.groupCount || (Array.isArray(data.groupIds) ? data.groupIds.length : 0);

        var statMvps = document.getElementById('statMvps');
        var statSessions2 = document.getElementById('statSessions2');
        var statFriends = document.getElementById('statFriends');

        if (statMvps) statMvps.textContent = mvps;
        if (statSessions2) statSessions2.textContent = sessions;
        if (statFriends) statFriends.textContent = friendCount;

        // My Stats view (global totals)
        var statSessionsEl = document.getElementById('statSessions');
        var statMvpsStats = document.getElementById('statMvpsStats');
        var statGroupsStats = document.getElementById('statGroupsStats');
        var statFriendsStats = document.getElementById('statFriendsStats');
        if (statSessionsEl) statSessionsEl.textContent = sessions;
        if (statMvpsStats) statMvpsStats.textContent = mvps;
        if (statGroupsStats) statGroupsStats.textContent = groupsCount;
        if (statFriendsStats) statFriendsStats.textContent = friendCount;

        updateMilestoneStatsFromUserDoc(data);

        /* Update avatars everywhere if photoURL exists */
        if (data.photoURL) {
          applyAvatarPhoto(data.photoURL, initial);
        }
      });
    }
  }

  /* ---------- SESSION HISTORY ---------- */
  function renderSessionHistorySkeleton(count) {
    var n = Math.max(1, Math.min(6, count || 3));
    var html = '<div class="skel-list">';
    for (var i = 0; i < n; i++) {
      html += '<div class="skel-row">' +
        '<div class="skel-lines">' +
          '<div class="skel skel-line skel-line--med"></div>' +
          '<div class="skel skel-line skel-line--long"></div>' +
        '</div>' +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  function loadSessionHistory(uid, containerId) {
    if (typeof db === 'undefined' || !db) return;

    var container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = renderSessionHistorySkeleton(3);

    var creatorQuery = db.collection('sessions')
      .where('creatorId', '==', uid)
      .where('status', '==', 'closed')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    var invitedQuery = db.collection('sessions')
      .where('invitedUids', 'array-contains', uid)
      .where('status', '==', 'closed')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    Promise.all([creatorQuery, invitedQuery]).then(function (results) {
      var sessionsMap = {};
      results.forEach(function (snapshot) {
        snapshot.forEach(function (doc) {
          sessionsMap[doc.id] = doc.data();
        });
      });

      var sessions = Object.keys(sessionsMap).map(function (id) {
        var s = sessionsMap[id];
        s._id = id;
        return s;
      });

      sessions.sort(function (a, b) {
        var aTime = a.createdAt ? a.createdAt.toMillis() : 0;
        var bTime = b.createdAt ? b.createdAt.toMillis() : 0;
        return bTime - aTime;
      });

      if (sessions.length === 0) {
        container.innerHTML =
          '<div class="empty-state">' +
            '<svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
            '<span class="empty-state__text">No sessions yet</span>' +
            '<span class="empty-state__sub">Closed sessions will show up here</span>' +
          '</div>';
        return;
      }

      var html = '<div class="shist">';
      sessions.forEach(function (s) {
        var dateStr = '';
        if (s.date) {
          var parts = s.date.split('-');
          if (parts.length === 3) dateStr = parts[2] + '/' + parts[1] + '/' + parts[0];
        }
        if (s.time) dateStr += (dateStr ? ' · ' : '') + s.time;

        var venue = s.venue || 'Unknown venue';
        var wasCreator = s.creatorId === uid;
        var roleTag = wasCreator ? 'Hosted' : 'Played';

        var teamsSummary = '';
        if (s.teams && s.teams.length > 0) {
          teamsSummary = s.teams.map(function (t) {
            return t.name + ' (' + t.players.length + ')';
          }).join(' vs ');
        }

        var mvpHtml = '';
        if (s.mvp) {
          mvpHtml = '<span class="shist__mvp">MVP: ' + escapeHtml(s.mvp) + '</span>';
        }

        html += '<div class="shist__item">';
        html += '<div class="shist__header">';
        html += '<span class="shist__venue">' + escapeHtml(venue) + '</span>';
        html += '<span class="shist__role shist__role--' + (wasCreator ? 'host' : 'player') + '">' + roleTag + '</span>';
        html += '</div>';
        if (dateStr) html += '<span class="shist__date">' + escapeHtml(dateStr) + '</span>';
        if (teamsSummary) html += '<span class="shist__teams">' + escapeHtml(teamsSummary) + '</span>';
        if (mvpHtml) html += mvpHtml;
        html += '</div>';
      });
      html += '</div>';

      container.innerHTML = html;
    }).catch(function (err) {
      console.error('Failed to load session history:', err);
    });
  }

  /* ---------- APPLY AVATAR PHOTO EVERYWHERE ---------- */
  function applyAvatarPhoto(url, fallbackInitial) {
    var topbarAvatar = document.querySelector('.topbar__avatar');
    var profileAvatarLg = document.getElementById('profileAvatarLg');

    var targets = [topbarAvatar, profileAvatarLg];
    targets.forEach(function (el) {
      if (!el) return;
      if (url) {
        el.innerHTML = '<img src="' + url + '" alt="Avatar" class="avatar-img">';
        el.classList.add('has-photo');
      } else {
        el.textContent = fallbackInitial || 'P';
        el.classList.remove('has-photo');
      }
    });
  }

  /* ---------- AVATAR UPLOAD ---------- */
  function setupAvatarUpload(user) {
    var wrap = document.getElementById('avatarUploadWrap');
    var input = document.getElementById('avatarInput');
    if (!wrap || !input || !user) return;

    wrap.addEventListener('click', function () {
      input.click();
    });

    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) { input.value = ''; return; }

      if (!file.type.startsWith('image/')) {
        showToast(t('toast.avatar_select_image'), 'info');
        input.value = '';
        return;
      }

      // 15 MB hard cap on raw pick — modern phone photos are easily 8–12 MB.
      // The cropper downsizes to a small JPEG before upload, so the hard cap
      // is generous on purpose. Storage rule still enforces 2 MB on the upload itself.
      if (file.size > 15 * 1024 * 1024) {
        showToast(t('toast.avatar_size_limit'), 'info');
        input.value = '';
        return;
      }

      openAvatarCropper(file, function (blob) {
        showToast(t('toast.uploading'), 'info');
        uploadAvatar(blob, user);
      });
      input.value = '';
    });
  }

  /* ---------- AVATAR CROPPER ----------
     Lightweight square/circle cropper. Loads the user-picked file into an
     <img>, lets them pan + pinch/slider zoom inside a square stage, then
     renders a 256×256 JPEG at quality 0.85 (~50–120 KB) for upload.
     ----------------------------------- */
  var cropperState = null;

  function openAvatarCropper(file, onConfirm) {
    var overlay = document.getElementById('cropperOverlay');
    var stage = document.getElementById('cropperStage');
    var canvas = document.getElementById('cropperCanvas');
    var zoom = document.getElementById('cropperZoom');
    var btnCancel = document.getElementById('cropperCancel');
    var btnConfirm = document.getElementById('cropperConfirm');
    if (!overlay || !stage || !canvas || !zoom || !btnCancel || !btnConfirm) {
      // Fallback: no cropper UI in DOM, do plain compress + upload
      compressFileToAvatarBlob(file, 256).then(function (blob) { onConfirm(blob); }).catch(function () {
        showToast(t('toast.avatar_process_failed'), 'info');
      });
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        startCropper({
          overlay: overlay,
          stage: stage,
          canvas: canvas,
          zoomEl: zoom,
          btnCancel: btnCancel,
          btnConfirm: btnConfirm,
          image: img,
          onConfirm: onConfirm
        });
      };
      img.onerror = function () {
        showToast(t('toast.avatar_process_failed'), 'info');
      };
      img.src = e.target.result;
    };
    reader.onerror = function () {
      showToast(t('toast.avatar_process_failed'), 'info');
    };
    reader.readAsDataURL(file);
  }

  function startCropper(opts) {
    closeCropper(); // ensure clean state

    var overlay = opts.overlay;
    var stage = opts.stage;
    var canvas = opts.canvas;
    var zoomEl = opts.zoomEl;
    var btnCancel = opts.btnCancel;
    var btnConfirm = opts.btnConfirm;
    var img = opts.image;

    var stageRect = stage.getBoundingClientRect();
    var size = Math.round(stageRect.width); // square stage
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');

    // Compute the minimum scale so the image fully covers the square stage
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    var coverScale = Math.max(size / iw, size / ih);

    var state = {
      img: img,
      iw: iw,
      ih: ih,
      ctx: ctx,
      size: size,
      minScale: coverScale,
      maxScale: coverScale * 4,
      scale: coverScale,
      // Translation in stage-space (where (0,0) = stage top-left).
      // We'll center the image initially.
      tx: 0,
      ty: 0,
      // Drag tracking
      dragging: false,
      lastX: 0,
      lastY: 0,
      // Pinch tracking
      pinchStartDist: 0,
      pinchStartScale: 0
    };

    function center() {
      state.tx = (state.size - state.iw * state.scale) / 2;
      state.ty = (state.size - state.ih * state.scale) / 2;
    }
    center();

    function clampTranslate() {
      // Image must always cover the stage (no gaps).
      var w = state.iw * state.scale;
      var h = state.ih * state.scale;
      var minTx = state.size - w;
      var minTy = state.size - h;
      if (state.tx > 0) state.tx = 0;
      if (state.ty > 0) state.ty = 0;
      if (state.tx < minTx) state.tx = minTx;
      if (state.ty < minTy) state.ty = minTy;
    }

    function draw() {
      clampTranslate();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, state.size, state.size);
      ctx.drawImage(
        state.img,
        state.tx, state.ty,
        state.iw * state.scale, state.ih * state.scale
      );
    }

    function setScale(newScale, anchorX, anchorY) {
      var s2 = Math.max(state.minScale, Math.min(state.maxScale, newScale));
      if (s2 === state.scale) return;
      // Keep the point under the anchor stationary.
      var ratio = s2 / state.scale;
      state.tx = anchorX - (anchorX - state.tx) * ratio;
      state.ty = anchorY - (anchorY - state.ty) * ratio;
      state.scale = s2;
      // Sync slider value if not driven by it
      var sliderVal = ((s2 - state.minScale) / (state.maxScale - state.minScale)) * 2 + 1;
      zoomEl.value = String(sliderVal.toFixed(3));
      draw();
    }

    // Pointer / touch handlers
    function onPointerDown(e) {
      if (e.touches && e.touches.length === 2) {
        state.dragging = false;
        var dx = e.touches[0].clientX - e.touches[1].clientX;
        var dy = e.touches[0].clientY - e.touches[1].clientY;
        state.pinchStartDist = Math.sqrt(dx * dx + dy * dy);
        state.pinchStartScale = state.scale;
        return;
      }
      var p = pointFromEvent(e);
      state.dragging = true;
      state.lastX = p.x;
      state.lastY = p.y;
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (e.touches && e.touches.length === 2 && state.pinchStartDist > 0) {
        var dx = e.touches[0].clientX - e.touches[1].clientX;
        var dy = e.touches[0].clientY - e.touches[1].clientY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - stageRect.left;
        var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - stageRect.top;
        var newScale = state.pinchStartScale * (dist / state.pinchStartDist);
        setScale(newScale, midX, midY);
        e.preventDefault();
        return;
      }
      if (!state.dragging) return;
      var p = pointFromEvent(e);
      state.tx += (p.x - state.lastX);
      state.ty += (p.y - state.lastY);
      state.lastX = p.x;
      state.lastY = p.y;
      draw();
      e.preventDefault();
    }

    function onPointerUp() {
      state.dragging = false;
      state.pinchStartDist = 0;
    }

    function pointFromEvent(e) {
      if (e.touches && e.touches.length) {
        return { x: e.touches[0].clientX - stageRect.left, y: e.touches[0].clientY - stageRect.top };
      }
      return { x: e.clientX - stageRect.left, y: e.clientY - stageRect.top };
    }

    function onWheel(e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? 0.92 : 1.08;
      var rect = stage.getBoundingClientRect();
      var ax = e.clientX - rect.left;
      var ay = e.clientY - rect.top;
      setScale(state.scale * delta, ax, ay);
    }

    function onZoomSlider() {
      var v = parseFloat(zoomEl.value);
      var newScale = state.minScale + ((v - 1) / 2) * (state.maxScale - state.minScale);
      setScale(newScale, state.size / 2, state.size / 2);
    }

    function onConfirm() {
      // Render output at 256×256 from the canvas
      var out = document.createElement('canvas');
      var OUT = 256;
      out.width = OUT;
      out.height = OUT;
      var octx = out.getContext('2d');
      octx.drawImage(canvas, 0, 0, state.size, state.size, 0, 0, OUT, OUT);

      out.toBlob(function (blob) {
        if (!blob) {
          showToast(t('toast.avatar_process_failed'), 'info');
          return;
        }
        closeCropper();
        if (typeof opts.onConfirm === 'function') opts.onConfirm(blob);
      }, 'image/jpeg', 0.85);
    }

    function onCancel() { closeCropper(); }

    // Wire up
    zoomEl.value = '1';
    stage.addEventListener('mousedown', onPointerDown);
    stage.addEventListener('touchstart', onPointerDown, { passive: false });
    document.addEventListener('mousemove', onPointerMove);
    stage.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('mouseup', onPointerUp);
    stage.addEventListener('touchend', onPointerUp);
    stage.addEventListener('touchcancel', onPointerUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    zoomEl.addEventListener('input', onZoomSlider);
    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);

    cropperState = {
      cleanup: function () {
        stage.removeEventListener('mousedown', onPointerDown);
        stage.removeEventListener('touchstart', onPointerDown);
        document.removeEventListener('mousemove', onPointerMove);
        stage.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('mouseup', onPointerUp);
        stage.removeEventListener('touchend', onPointerUp);
        stage.removeEventListener('touchcancel', onPointerUp);
        stage.removeEventListener('wheel', onWheel);
        zoomEl.removeEventListener('input', onZoomSlider);
        btnConfirm.removeEventListener('click', onConfirm);
        btnCancel.removeEventListener('click', onCancel);
      }
    };

    overlay.classList.add('cropper-overlay--active');
    overlay.setAttribute('aria-hidden', 'false');
    draw();
  }

  function closeCropper() {
    var overlay = document.getElementById('cropperOverlay');
    if (overlay) {
      overlay.classList.remove('cropper-overlay--active');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (cropperState && typeof cropperState.cleanup === 'function') cropperState.cleanup();
    cropperState = null;
  }

  // Used as a fallback if the cropper UI isn't available.
  function compressFileToAvatarBlob(file, maxSize) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var w = img.width, h = img.height;
          if (w > h) {
            if (w > maxSize) { h = h * (maxSize / w); w = maxSize; }
          } else {
            if (h > maxSize) { w = w * (maxSize / h); h = maxSize; }
          }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(); }, 'image/jpeg', 0.85);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function uploadAvatar(blob, user) {
    if (typeof storage === 'undefined' || !storage) {
      showToast(t('toast.storage_unavailable'), 'info');
      return;
    }
    if (!blob) {
      showToast(t('toast.avatar_process_failed'), 'info');
      return;
    }

    // Defensive: blob should never exceed 2 MB after crop, but check just in case.
    if (blob.size > 2 * 1024 * 1024) {
      showToast(t('toast.avatar_size_limit'), 'info');
      return;
    }

    var path = 'avatars/' + user.uid + '.jpg';
    var ref = storage.ref().child(path);

    ref.put(blob, { contentType: 'image/jpeg' })
      .then(function (snapshot) { return snapshot.ref.getDownloadURL(); })
      .then(function (url) {
        return db.collection('users').doc(user.uid).update({ photoURL: url })
          .then(function () { return url; });
      })
      .then(function (url) {
        // Update Auth profile too so future tokens have the correct photoURL
        return user.updateProfile({ photoURL: url }).catch(function () {});
      })
      .then(function () {
        showToast(t('toast.avatar_updated'), 'success');
      })
      .catch(function (err) {
        console.error('Avatar upload error:', err);
        try { window.NiteRunErrors && window.NiteRunErrors.log(err, 'uploadAvatar'); } catch (e2) {}
        var c = err && err.code ? String(err.code) : '';
        if (c === 'storage/unauthorized' || c === 'storage/unauthenticated' || c === 'permission-denied') {
          showToast(t('toast.error.permission') || 'Not allowed.', 'info');
        } else if (c === 'storage/canceled') {
          // user-canceled, no toast
        } else if (c === 'storage/retry-limit-exceeded' || c === 'unavailable') {
          showToast(t('toast.error.offline') || 'Connection issue.', 'info');
        } else {
          showToast(t('toast.upload_failed'), 'info');
        }
      });
  }

  /* ---------- NOTIFICATIONS ---------- */
  var notifUnsub = null;

  function setupNotifications(user) {
    var toggle = document.getElementById('notifToggle');
    var dropdown = document.getElementById('notifDropdown');
    var clearBtn = document.getElementById('notifClearAll');
    if (!toggle || !dropdown) return;

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !dropdown.classList.contains('notif-dropdown--open');
      if (willOpen) {
        var userMenu = document.getElementById('userMenu');
        if (userMenu) userMenu.classList.remove('user-menu--open');
      }
      dropdown.classList.toggle('notif-dropdown--open');
    });

    document.addEventListener('click', function (e) {
      if (!dropdown.contains(e.target) && e.target !== toggle) {
        dropdown.classList.remove('notif-dropdown--open');
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        clearAllNotifications(user.uid);
      });
    }

    listenNotifications(user.uid);
  }

  function listenNotifications(uid) {
    if (typeof db === 'undefined' || !db) return;

    if (notifUnsub) notifUnsub();

    showNotifSkeleton();

    notifUnsub = db.collection('users').doc(uid).collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .onSnapshot(function (snapshot) {
        var notifs = [];
        snapshot.forEach(function (doc) {
          notifs.push({ id: doc.id, data: doc.data() });
        });
        renderNotifications(notifs);
      }, function (err) {
        console.error('Notifications listener error:', err);
        var list = document.getElementById('notifList');
        if (list) list.innerHTML = '<p class="notif-dropdown__empty">' + escapeHtml(t('app.notifications.empty')) + '</p>';
      });
  }

  function showNotifSkeleton() {
    var list = document.getElementById('notifList');
    if (!list) return;
    var html = '<div class="skel-list" style="padding:8px 12px;">';
    for (var i = 0; i < 3; i++) {
      html += '<div class="skel-row" style="padding:10px;">' +
        '<div class="skel skel-avatar"></div>' +
        '<div class="skel-lines">' +
          '<div class="skel skel-line skel-line--med"></div>' +
          '<div class="skel skel-line skel-line--short"></div>' +
        '</div>' +
        '</div>';
    }
    html += '</div>';
    list.innerHTML = html;
  }

  // Build a localized notification message from the stored type + structured fields.
  // Falls back to the legacy stored `message` (older notifs) or a generic key.
  function localizeNotif(d) {
    if (!d) return '';
    var type = d.type || '';
    var name = d.fromName || t('app.someone');
    var venue = d.venue || '';
    var mvp = d.mvpName || t('app.notifications.na') || 'N/A';

    if (type === 'friend_request') {
      return t('notif.friend_request', { name: name });
    }
    if (type === 'friend_accepted') {
      return t('notif.friend_accepted', { name: name });
    }
    if (type === 'mvp_award') {
      return venue
        ? t('notif.mvp_award.with_venue', { venue: venue })
        : t('notif.mvp_award.no_venue');
    }
    if (type === 'session_closed') {
      return venue
        ? t('notif.session_closed.with_venue', { venue: venue, mvp: mvp })
        : t('notif.session_closed.no_venue', { mvp: mvp });
    }
    if (type === 'session_invite') {
      return venue
        ? t('notif.session_invite.with_venue', { name: name, venue: venue })
        : t('notif.session_invite.no_venue', { name: name });
    }
    // Legacy notifications (or unknown future types) — show whatever was stored
    return d.message || t('notif.fallback.unknown') || '';
  }

  function renderNotifications(notifs) {
    var list = document.getElementById('notifList');
    var badge = document.getElementById('notifBadge');
    if (!list) return;

    var unread = notifs.filter(function (n) { return !n.data.read; }).length;

    if (badge) {
      badge.textContent = unread > 0 ? unread : '';
      badge.style.display = unread > 0 ? '' : 'none';
    }

    if (notifs.length === 0) {
      list.innerHTML = '<p class="notif-dropdown__empty">' + escapeHtml(t('app.notifications.empty')) + '</p>';
      return;
    }

    var html = '';
    notifs.forEach(function (n) {
      var d = n.data;
      var readClass = d.read ? '' : ' notif-item--unread';
      var initial = (d.fromName || '?').charAt(0).toUpperCase();
      var avatarHtml = d.fromPhoto
        ? '<img src="' + d.fromPhoto + '" alt="" class="avatar-img">'
        : initial;

      html += '<div class="notif-item' + readClass + '" data-notif-id="' + n.id + '">';
      html += '<div class="notif-item__avatar">' + avatarHtml + '</div>';
      html += '<div class="notif-item__body">';
      html += '<p class="notif-item__msg">' + escapeHtml(localizeNotif(d)) + '</p>';

      if (d.type === 'friend_request' && !d.acted) {
        html += '<div class="notif-item__actions">' +
          '<button class="notif-item__btn notif-item__btn--accept" data-notif-id="' + n.id + '" data-from-uid="' + d.fromUid + '">' + escapeHtml(t('app.notifications.accept')) + '</button>' +
          '<button class="notif-item__btn notif-item__btn--decline" data-notif-id="' + n.id + '">' + escapeHtml(t('app.notifications.decline')) + '</button>' +
        '</div>';
      }

      if (d.acted) {
        var actedKey = d.actedResult === 'Accepted'
          ? 'app.notifications.accepted'
          : (d.actedResult === 'Declined' ? 'app.notifications.declined' : '');
        html += '<p class="notif-item__status">' + escapeHtml(actedKey ? t(actedKey) : (d.actedResult || '')) + '</p>';
      }

      html += '</div></div>';
    });

    list.innerHTML = html;

    list.querySelectorAll('.notif-item').forEach(function (item) {
      var nid = item.getAttribute('data-notif-id');
      item.addEventListener('click', function () {
        markNotifRead(nid);
      });
    });

    list.querySelectorAll('.notif-item__btn--accept').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var nid = btn.getAttribute('data-notif-id');
        var fromUid = btn.getAttribute('data-from-uid');
        acceptFriendRequest(nid, fromUid);
      });
    });

    list.querySelectorAll('.notif-item__btn--decline').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var nid = btn.getAttribute('data-notif-id');
        declineFriendRequest(nid);
      });
    });
  }

  function markNotifRead(notifId) {
    if (!currentUser) return;
    db.collection('users').doc(currentUser.uid).collection('notifications').doc(notifId).update({
      read: true
    }).catch(function () {});
  }

  function clearAllNotifications(uid) {
    if (typeof db === 'undefined' || !db) return;
    db.collection('users').doc(uid).collection('notifications').get()
      .then(function (snapshot) {
        var batch = db.batch();
        snapshot.forEach(function (doc) { batch.delete(doc.ref); });
        return batch.commit();
      }).catch(function () {});
  }

  /* ---------- FRIEND REQUESTS ---------- */
  function sendFriendRequest(toUid, toName) {
    if (!currentUser || !db) return;

    db.collection('users').doc(currentUser.uid).get().then(function (doc) {
      var myData = doc.data() || {};

      return db.collection('users').doc(toUid).collection('notifications').add({
        type: 'friend_request',
        fromUid: currentUser.uid,
        fromName: myData.displayName || currentUser.displayName || 'Player',
        fromUsername: myData.username || '',
        fromPhoto: myData.photoURL || null,
        message: t('notif.friend_request', { name: (myData.displayName || currentUser.displayName || t('app.someone')) }),
        read: false,
        acted: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).then(function () {
      showToast(t('toast.friend_request_sent', { name: toName }), 'success');
    }).catch(function (err) {
      console.error('Friend request error:', err);
      showToast(t('toast.friend_request_failed'), 'info');
    });
  }

  function acceptFriendRequest(notifId, fromUid) {
    if (!currentUser || !db) return;

    var batch = db.batch();
    var myRef = db.collection('users').doc(currentUser.uid);
    var theirRef = db.collection('users').doc(fromUid);
    var notifRef = myRef.collection('notifications').doc(notifId);

    batch.update(myRef, {
      friends: firebase.firestore.FieldValue.arrayUnion(fromUid),
      friendCount: firebase.firestore.FieldValue.increment(1)
    });
    batch.update(theirRef, {
      friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
      friendCount: firebase.firestore.FieldValue.increment(1)
    });
    batch.update(notifRef, {
      acted: true,
      actedResult: 'Accepted',
      read: true
    });

    batch.commit().then(function () {
      showToast(t('toast.friend_added'), 'success');

      return db.collection('users').doc(currentUser.uid).get();
    }).then(function (doc) {
      var myData = doc.data() || {};
      return theirRef.collection('notifications').add({
        type: 'friend_accepted',
        fromUid: currentUser.uid,
        fromName: myData.displayName || 'Player',
        fromUsername: myData.username || '',
        fromPhoto: myData.photoURL || null,
        message: t('notif.friend_accepted', { name: (myData.displayName || t('app.someone')) }),
        read: false,
        acted: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).catch(function (err) {
      console.error('Accept friend error:', err);
    });
  }

  function declineFriendRequest(notifId) {
    if (!currentUser || !db) return;
    db.collection('users').doc(currentUser.uid).collection('notifications').doc(notifId).update({
      acted: true,
      actedResult: 'Declined',
      read: true
    }).catch(function () {});
  }

  function removeFriend(friendUid, callback) {
    if (!currentUser || !db) return;

    var batch = db.batch();
    var myRef = db.collection('users').doc(currentUser.uid);
    var theirRef = db.collection('users').doc(friendUid);

    batch.update(myRef, {
      friends: firebase.firestore.FieldValue.arrayRemove(friendUid),
      friendCount: firebase.firestore.FieldValue.increment(-1)
    });
    batch.update(theirRef, {
      friends: firebase.firestore.FieldValue.arrayRemove(currentUser.uid),
      friendCount: firebase.firestore.FieldValue.increment(-1)
    });

    batch.commit().then(function () {
      showToast(t('toast.friend_removed'), 'success');
      if (callback) callback();
    }).catch(function (err) {
      console.error('Unfriend error:', err);
      showToast(t('toast.friend_remove_failed'), 'info');
    });
  }

  /* ---------- USER PROFILE (full-page view) ---------- */
  var userProfileHistory = [];

  function openUserProfile(uid) {
    if (typeof db === 'undefined' || !db) return;

    var contentEl = document.getElementById('uviewContent');
    var backBtn = document.getElementById('uviewBack');
    if (!contentEl) return;

    contentEl.innerHTML = '<p class="uview__loading">' + escapeHtml(t('app.loading')) + '</p>';

    switchView('user');

    var contentArea = document.querySelector('.content');
    if (contentArea) contentArea.scrollTop = 0;

    backBtn.onclick = function () {
      if (userProfileHistory.length > 0) {
        var prevUid = userProfileHistory.pop();
        openUserProfile(prevUid);
      } else {
        switchView(previousView || 'dashboard');
      }
    };

    db.collection('users').doc(uid).get().then(function (doc) {
      if (!doc.exists) {
        contentEl.innerHTML = '<p class="uview__loading">' + escapeHtml(t('app.user_not_found')) + '</p>';
        return;
      }

      var u = doc.data();
      var isMe = currentUser && uid === currentUser.uid;

      if (currentUser) {
        return db.collection('users').doc(currentUser.uid).get().then(function (myDoc) {
          var myFriends = myDoc.exists ? (myDoc.data().friends || []) : [];
          renderUserProfile(uid, u, isMe, myFriends, contentEl);
        });
      } else {
        renderUserProfile(uid, u, isMe, [], contentEl);
      }
    }).catch(function (err) {
      console.error('Failed to load user profile:', err);
      contentEl.innerHTML = '<p class="uview__loading">' + escapeHtml(t('app.profile_load_error')) + '</p>';
    });
  }

  function renderUserProfile(uid, data, isMe, myFriends, container) {
    var displayName = data.displayName || t('app.user.player');
    var username = data.username || '';
    var initial = displayName.charAt(0).toUpperCase();
    var photoHTML = data.photoURL
      ? '<img src="' + data.photoURL + '" alt="" class="avatar-img">'
      : initial;

    var isFriend = myFriends.indexOf(uid) !== -1;
    var sessions = data.sessionsPlayed || 0;
    var mvps = data.mvpCount || 0;
    var friendCount = data.friendCount || 0;
    var friends = data.friends || [];

    var html = '';

    html += '<div class="card card--profile card--profile-hero uview__hero-card">';
    html += '<div class="uview__hero">';
    html += '<div class="uview__avatar' + (data.photoURL ? ' has-photo' : '') + '">' + photoHTML + '</div>';
    html += '<h2 class="uview__name">' + escapeHtml(displayName) + '</h2>';
    if (username) html += '<p class="uview__username">@' + escapeHtml(username) + '</p>';
    if (!isMe) {
      if (isFriend) {
        html += '<button class="uview__follow-btn uview__follow-btn--following" data-uid="' + uid + '" data-name="' + escapeHtml(displayName) + '">' + escapeHtml(t('app.friends.friends')) + '</button>';
      } else {
        html += '<button class="uview__follow-btn" data-uid="' + uid + '" data-name="' + escapeHtml(displayName) + '">' + escapeHtml(t('app.friends.add')) + '</button>';
      }
    }
    html += '</div>';
    html += '</div>';

    html += '<div class="profile__grid profile__grid--three uview__stats-grid">';
    html += '<div class="card card--stat"><svg class="card--stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg><span class="card--stat__val">' + sessions + '</span><span class="card--stat__label">' + escapeHtml(t('app.stats.sessions')) + '</span></div>';
    html += '<div class="card card--stat uview__friends-stat" data-uid="' + uid + '" data-name="' + escapeHtml(displayName) + '"><svg class="card--stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span class="card--stat__val">' + friendCount + '</span><span class="card--stat__label">' + escapeHtml(t('app.stats.friends')) + '</span></div>';
    html += '<div class="card card--stat"><svg class="card--stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8L6 20H18L20 8M4 8L5.71624 9.37299C6.83218 10.2657 7.39014 10.7121 7.95256 10.7814C8.4453 10.8421 8.94299 10.7173 9.34885 10.4314C9.81211 10.1051 10.0936 9.4483 10.6565 8.13476L12 5M4 8C4.55228 8 5 7.55228 5 7C5 6.44772 4.55228 6 4 6C3.44772 6 3 6.44772 3 7C3 7.55228 3.44772 8 4 8ZM20 8L18.2838 9.373C17.1678 10.2657 16.6099 10.7121 16.0474 10.7814C15.5547 10.8421 15.057 10.7173 14.6511 10.4314C14.1879 10.1051 13.9064 9.4483 13.3435 8.13476L12 5M20 8C20.5523 8 21 7.55228 21 7C21 6.44772 20.5523 6 20 6C19.4477 6 19 6.44772 19 7C19 7.55228 19.4477 8 20 8ZM12 5C12.5523 5 13 4.55228 13 4C13 3.44772 12.5523 3 12 3C11.4477 3 11 3.44772 11 4C11 4.55228 11.4477 5 12 5ZM12 4H12.01M20 7H20.01M4 7H4.01"/></svg><span class="card--stat__val">' + mvps + '</span><span class="card--stat__label">' + escapeHtml(t('app.stats.mvps')) + '</span></div>';
    html += '</div>';

    html += '<div class="card"><h2 class="card__title">' + escapeHtml(t('app.session_history.title')) + '</h2><div id="uviewSessionHistory"><p class="uview__loading">' + escapeHtml(t('app.loading')) + '</p></div></div>';

    container.innerHTML = html;

    var followBtn = container.querySelector('.uview__follow-btn');
    if (followBtn) {
      followBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var targetUid = followBtn.getAttribute('data-uid');
        var targetName = followBtn.getAttribute('data-name');
        var isFollowing = followBtn.classList.contains('uview__follow-btn--following');

        if (isFollowing) {
          if (confirm(t('app.friends.confirm_remove', { name: targetName }))) {
            removeFriend(targetUid, function () {
              followBtn.classList.remove('uview__follow-btn--following');
              followBtn.textContent = t('app.friends.add');
            });
          }
        } else if (followBtn.classList.contains('uview__follow-btn--sent')) {
          return;
        } else {
          sendFriendRequest(targetUid, targetName);
          followBtn.textContent = t('app.friends.requested');
          followBtn.classList.add('uview__follow-btn--sent');
        }
      });
    }

    var friendsStat = container.querySelector('.uview__friends-stat');
    if (friendsStat) {
      friendsStat.style.cursor = 'pointer';
      friendsStat.addEventListener('click', function () {
        openFriendsList(uid, displayName, friends);
      });
    }

    loadSessionHistory(uid, 'uviewSessionHistory');
  }

  /* ---------- FRIENDS LIST PAGE (Instagram-style) ---------- */

  function openFriendsList(uid, ownerName, friendUids) {
    var contentEl = document.getElementById('uviewContent');
    var backBtn = document.getElementById('uviewBack');
    if (!contentEl) return;

    var isOwnList = currentUser && uid === currentUser.uid;

    switchView('user');

    var contentArea = document.querySelector('.content');
    if (contentArea) contentArea.scrollTop = 0;

    var html = '<div class="flist">';
    html += '<h2 class="flist__title">' + escapeHtml(t('app.friends_list.title', { name: ownerName })) + '</h2>';

    if (!friendUids || friendUids.length === 0) {
      html += '<div class="flist__empty">' + escapeHtml(t('app.friends_list.empty')) + '</div>';
      html += '</div>';
      contentEl.innerHTML = html;
      backBtn.onclick = function () { openUserProfile(uid); };
      return;
    }

    html += '<div class="flist__list" id="flistItems"></div>';
    html += '</div>';
    contentEl.innerHTML = html;

    backBtn.onclick = function () { openUserProfile(uid); };

    var listEl = document.getElementById('flistItems');
    var loaded = 0;
    var rows = [];

    friendUids.forEach(function (fUid) {
      db.collection('users').doc(fUid).get().then(function (doc) {
        loaded++;
        if (doc.exists) {
          var f = doc.data();
          var initial = (f.displayName || '?').charAt(0).toUpperCase();
          var photoHtml = f.photoURL
            ? '<img src="' + f.photoURL + '" alt="" class="avatar-img">'
            : initial;

          var removeHtml = isOwnList
            ? '<span class="flist__remove" data-uid="' + doc.id + '" data-name="' + escapeHtml(f.displayName || t('app.unknown')) + '">' + escapeHtml(t('app.actions.remove')) + '</span>'
            : '';

          rows.push(
            '<div class="flist__row" data-uid="' + doc.id + '">' +
              '<div class="flist__row-left">' +
                '<span class="flist__avatar' + (f.photoURL ? ' has-photo' : '') + '">' + photoHtml + '</span>' +
                '<span class="flist__info">' +
                  '<span class="flist__name">' + escapeHtml(f.displayName || t('app.unknown')) + '</span>' +
                  '<span class="flist__uname">@' + escapeHtml(f.username || '') + '</span>' +
                '</span>' +
              '</div>' +
              removeHtml +
            '</div>'
          );
        }

        if (loaded === friendUids.length) {
          listEl.innerHTML = rows.join('') || '<div class="flist__empty">' + escapeHtml(t('app.friends_list.empty')) + '</div>';

          listEl.querySelectorAll('.flist__row-left').forEach(function (left) {
            left.style.cursor = 'pointer';
            left.addEventListener('click', function () {
              var row = left.closest('.flist__row');
              var targetUid = row ? row.getAttribute('data-uid') : null;
              if (targetUid) {
                userProfileHistory.push(uid);
                openUserProfile(targetUid);
              }
            });
          });

          listEl.querySelectorAll('.flist__remove').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              var targetUid = btn.getAttribute('data-uid');
              var targetName = btn.getAttribute('data-name');
              if (confirm(t('app.friends.confirm_remove', { name: targetName }))) {
                removeFriend(targetUid, function () {
                  var remaining = friendUids.filter(function (u) { return u !== targetUid; });
                  openFriendsList(uid, ownerName, remaining);
                });
              }
            });
          });
        }
      }).catch(function () { loaded++; });
    });
  }

  function setupFriendsCard() {
    var friendsCards = document.querySelectorAll('#statFriends');
    friendsCards.forEach(function (card) {
      var parent = card.closest('.card--stat');
      if (parent) {
        parent.style.cursor = 'pointer';
        parent.addEventListener('click', function () {
          if (!currentUser || !db) return;
          db.collection('users').doc(currentUser.uid).get().then(function (doc) {
            if (!doc.exists) return;
            var d = doc.data();
            userProfileHistory = [];
            openFriendsList(currentUser.uid, d.displayName || 'You', d.friends || []);
          });
        });
      }
    });
  }

  /* ---------- SESSION NOTIFICATIONS ---------- */

  function notifySessionInvites(uids, venue) {
    if (!currentUser || !db || !uids || uids.length === 0) return;

    db.collection('users').doc(currentUser.uid).get().then(function (doc) {
      var myData = doc.exists ? doc.data() : {};
      var creatorName = myData.displayName || currentUser.displayName || 'Someone';

      uids.forEach(function (uid) {
        if (uid === currentUser.uid) return;

        db.collection('users').doc(uid).collection('notifications').add({
          type: 'session_invite',
          fromUid: currentUser.uid,
          fromName: creatorName,
          fromUsername: myData.username || '',
          fromPhoto: myData.photoURL || null,
          venue: venue || '',
          message: creatorName + ' added you to a session' + (venue ? ' at ' + venue : ''),
          read: false,
          acted: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function () {});
      });
    }).catch(function () {});
  }

  function notifyMvpAward(playerUid, venue) {
    if (!currentUser || !db || !playerUid || playerUid === currentUser.uid) return;

    db.collection('users').doc(currentUser.uid).get().then(function (doc) {
      var myData = doc.exists ? doc.data() : {};
      var creatorName = myData.displayName || currentUser.displayName || 'Someone';

      db.collection('users').doc(playerUid).collection('notifications').add({
        type: 'mvp_award',
        fromUid: currentUser.uid,
        fromName: creatorName,
        fromUsername: myData.username || '',
        fromPhoto: myData.photoURL || null,
        venue: venue || '',
        message: 'You were voted MVP' + (venue ? ' at ' + venue : '') + '!',
        read: false,
        acted: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function () {});
    }).catch(function () {});
  }

  function notifySessionClosed(sessionData, mvpName) {
    if (!currentUser || !db) return;

    var allUids = (sessionData.invitedUids || []).slice();
    if (allUids.indexOf(sessionData.creatorId) === -1) allUids.push(sessionData.creatorId);

    db.collection('users').doc(currentUser.uid).get().then(function (doc) {
      var myData = doc.exists ? doc.data() : {};
      var creatorName = myData.displayName || currentUser.displayName || 'Someone';
      var venue = sessionData.venue || '';

      allUids.forEach(function (uid) {
        if (uid === currentUser.uid) return;

        db.collection('users').doc(uid).collection('notifications').add({
          type: 'session_closed',
          fromUid: currentUser.uid,
          fromName: creatorName,
          fromUsername: myData.username || '',
          fromPhoto: myData.photoURL || null,
          venue: venue || '',
          mvpName: mvpName || '',
          message: 'Session' + (venue ? ' at ' + venue : '') + ' ended. MVP: ' + (mvpName || 'N/A'),
          read: false,
          acted: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function () {});
      });
    }).catch(function () {});
  }

  /* ---------- DELETE ACCOUNT (email confirm via Cloud Function) ---------- */
  function setupDeleteAccount() {
    var btn = document.getElementById('requestDeleteAccountBtn');
    if (!btn) return;

    btn.addEventListener('click', function () {
      showModal({
        title: t('modal.delete_account.title'),
        message: t('modal.delete_account.body'),
        danger: true,
        confirmText: t('modal.action.send_delete_email'),
        onConfirm: function () {
          if (typeof functions === 'undefined' || !functions || !functions.httpsCallable) {
            showToast(t('toast.delete_account_no_functions'), 'danger');
            return;
          }
          if (!currentUser) return;
          var fn = functions.httpsCallable('requestAccountDeletion');
          btn.disabled = true;
          fn()
            .then(function () {
              showToast(t('toast.delete_account_email_sent'), 'success');
            })
            .catch(function (err) {
              console.error(err);
              var code = err && err.code ? String(err.code) : '';
              if (code.indexOf('failed-precondition') !== -1) {
                showToast(t('toast.delete_account_no_email'), 'danger');
              } else {
                showToast(t('toast.delete_account_email_failed'), 'danger');
              }
            })
            .finally(function () {
              btn.disabled = false;
            });
        }
      });
    });
  }

  /* ---------- EDIT PROFILE + RESET PASSWORD + EMAIL PREF ---------- */
  function setupAccountSettings() {
    var nameInput = document.getElementById('editDisplayName');
    var saveBtn = document.getElementById('saveDisplayName');
    var resetPwBtn = document.getElementById('resetPasswordBtn');
    var emailNotifsToggle = document.getElementById('toggleEmailNotifs');
    var notifsToggle = document.getElementById('toggleNotifs');
    var autosaveToggle = document.getElementById('toggleAutosave');

    if (nameInput && currentUser) {
      nameInput.value = currentUser.displayName || '';
    }

    /* In-app notifications toggle */
    if (notifsToggle && currentUser && typeof db !== 'undefined' && db) {
      db.collection('users').doc(currentUser.uid).get().then(function (doc) {
        if (doc.exists) {
          notifsToggle.checked = doc.data().inAppNotifications !== false;
        }
      }).catch(function () {});
      notifsToggle.addEventListener('change', function () {
        if (!currentUser || typeof db === 'undefined' || !db) return;
        var on = notifsToggle.checked;
        db.collection('users').doc(currentUser.uid).update({ inAppNotifications: on }).then(function () {
          showToast(on ? t('toast.notifications_on') : t('toast.notifications_off'), 'success');
        }).catch(function (err) {
          console.error('Failed to update notification preference:', err);
          notifsToggle.checked = !on;
        });
      });
    }

    /* Push notifications toggle (FCM) */
    setupPushNotificationsToggle();

    /* Email notifications toggle */
    if (emailNotifsToggle && currentUser && typeof db !== 'undefined' && db) {
      db.collection('users').doc(currentUser.uid).get().then(function (doc) {
        if (doc.exists) {
          var data = doc.data();
          emailNotifsToggle.checked = data.emailNotifications !== false;
        }
      }).catch(function () {});
      emailNotifsToggle.addEventListener('change', function () {
        if (!currentUser || typeof db === 'undefined' || !db) return;
        var on = emailNotifsToggle.checked;
        db.collection('users').doc(currentUser.uid).update({ emailNotifications: on }).then(function () {
          showToast(on ? t('toast.email_notifications_on') : t('toast.email_notifications_off'), 'success');
        }).catch(function (err) {
          console.error('Failed to update email preference:', err);
          emailNotifsToggle.checked = !on;
        });
      });
    }

    /* Auto-save roster toggle */
    if (autosaveToggle) {
      var autosaveOn = true;
      try { autosaveOn = localStorage.getItem('niterun_autosave') !== '0'; } catch (e) {}
      autosaveToggle.checked = autosaveOn;
      autosaveToggle.addEventListener('change', function () {
        var on = autosaveToggle.checked;
        try { localStorage.setItem('niterun_autosave', on ? '1' : '0'); } catch (e) {}
        showToast(on ? t('toast.autosave_on') : t('toast.autosave_off'), 'success');
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var newName = nameInput ? nameInput.value.trim() : '';
        if (!newName || newName.length < 2) {
          showToast(t('toast.name_min_chars'), 'info');
          return;
        }
        if (!currentUser) return;

        currentUser.updateProfile({ displayName: newName }).then(function () {
          return db.collection('users').doc(currentUser.uid).update({
            displayName: newName,
            displayNameLower: newName.toLowerCase()
          });
        }).then(function () {
          showToast(t('toast.name_updated'), 'success');
          var topbarName = document.querySelector('.topbar__name');
          var profileNames = document.querySelectorAll('.profile__name');
          if (topbarName) topbarName.textContent = newName;
          profileNames.forEach(function (el) { el.textContent = newName; });
        }).catch(function (err) {
          console.error('Failed to update name:', err);
          showToast(t('toast.name_update_failed'), 'info');
        });
      });
    }

    /* Email: show current + change */
    var currentEmailDisplay = document.getElementById('currentEmailDisplay');
    var editEmailInput = document.getElementById('editEmail');
    var saveEmailBtn = document.getElementById('saveEmail');
    var emailNote = document.getElementById('emailNote');

    if (currentEmailDisplay && currentUser) {
      currentEmailDisplay.textContent = currentUser.email || t('app.account.no_email_set');
    }

    if (saveEmailBtn && editEmailInput) {
      saveEmailBtn.addEventListener('click', function () {
        var newEmail = editEmailInput.value.trim();
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

        if (!newEmail) {
          setEmailNote(t('app.account.enter_new_email'), 'error');
          return;
        }
        if (!emailRegex.test(newEmail)) {
          setEmailNote(t('auth.error.valid_email'), 'error');
          return;
        }
        if (newEmail === currentUser.email) {
          setEmailNote(t('app.account.email_is_current'), 'error');
          return;
        }

        setEmailNote('', '');

        showModal({
          title: t('modal.confirm_password.title'),
          message: t('modal.confirm_password.body'),
          inputMode: true,
          inputType: 'password',
          placeholder: t('modal.confirm_password.placeholder'),
          confirmText: t('modal.action.confirm'),
          onConfirm: function (password) {
            if (!password) {
              setEmailNote(t('app.account.password_required'), 'error');
              return;
            }

            var credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, password);

            currentUser.reauthenticateWithCredential(credential)
              .then(function () {
                return currentUser.updateEmail(newEmail);
              })
              .then(function () {
                // Send verification to the NEW email before we consider it final.
                var sendVerification = functions && functions.httpsCallable ? functions.httpsCallable('sendVerification') : null;
                if (!sendVerification) throw new Error('Verification not available');
                return sendVerification();
              })
              .then(function () {
                editEmailInput.value = '';
                setEmailNote(t('app.account.verify_new_email_note'), 'success');
                showToast(t('toast.verification_email_sent', { email: newEmail }), 'success');
                // Force re-login (app gate requires verified email)
                return auth.signOut();
              })
              .then(function () {
                window.location.replace('auth.html');
              })
              .catch(function (err) {
                if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                  setEmailNote(t('app.account.incorrect_password'), 'error');
                } else if (err.code === 'auth/email-already-in-use') {
                  setEmailNote(t('app.account.email_in_use'), 'error');
                } else if (err.code === 'auth/invalid-email') {
                  setEmailNote(t('app.account.invalid_email'), 'error');
                } else if (err.code === 'auth/requires-recent-login') {
                  setEmailNote(t('app.account.requires_recent_login'), 'error');
                } else if (String(err && err.message || '').toLowerCase().indexOf('verification not available') !== -1) {
                  setEmailNote('Could not send verification email. Try again shortly.', 'error');
                } else {
                  console.error('Email change error:', err);
                  setEmailNote('Could not update email. Try again.', 'error');
                }
              });
          }
        });
      });
    }

    function setEmailNote(msg, type) {
      if (!emailNote) return;
      emailNote.textContent = msg;
      emailNote.className = 'setting-row__note';
      if (type === 'success') emailNote.classList.add('setting-row__note--success');
      if (type === 'error') emailNote.classList.add('setting-row__note--error');
    }

    if (resetPwBtn) {
      resetPwBtn.addEventListener('click', function () {
        if (!currentUser || !currentUser.email) {
          showToast(t('toast.no_email_found'), 'info');
          return;
        }
        auth.sendPasswordResetEmail(currentUser.email).then(function () {
          showToast(t('toast.reset_email_sent', { email: currentUser.email }), 'success');
        }).catch(function (err) {
          console.error('Password reset error:', err);
          showToast(t('toast.reset_email_failed'), 'info');
        });
      });
    }
  }

  /* ---------- VIEW SWITCHING ---------- */
  var viewTitles = {
    dashboard: 'Dashboard',
    session: 'Create Session',
    stats: 'My Stats',
    milestones: 'Milestones',
    groups: 'Groups',
    group: 'Group',
    howto: 'How to Use',
    search: 'Search',
    profile: 'Profile',
    settings: 'Settings',
    user: 'Player'
  };

  function switchView(viewName, opts) {
    opts = opts || {};

    var smEarly = document.getElementById('sessionMode');
    var leavingQuickSession = viewName !== 'session' && smEarly && smEarly.value === 'quick';

    if (viewName !== 'session') {
      pendingSession = null;
    }

    if (leavingQuickSession) {
      players = [];
      editingId = null;
      selectedPlayerUid = null;
      selectedPlayerPhoto = null;
      saveData();
    }

    if (viewName !== 'session') {
      forceQuickFlow = false;
    }

    /* Save previous view for back navigation (never save 'search' so
       the close-search button always returns to a real content view) */
    if (!opts.skipHistory) {
      var currentView = document.querySelector('.view--active');
      if (currentView) {
        var currentName = currentView.id.replace('view-', '');
        if (currentName !== 'search' && currentName !== 'user') {
          previousView = currentName;
        }
      }
    }

    /* Hide all views */
    var views = document.querySelectorAll('.view');
    views.forEach(function (v) { v.classList.remove('view--active'); });

    /* Show target */
    var target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('view--active');

    /* Update sidebar active state */
    var sidebarLinks = document.querySelectorAll('.sidebar__link[data-view]');
    var tabbarBtns = document.querySelectorAll('.tabbar__btn[data-view]');

    /* Sub-views of dashboard keep "Dashboard" highlighted */
    var sidebarTarget = (viewName === 'session' || viewName === 'stats' || viewName === 'milestones' || viewName === 'groups' || viewName === 'search') ? 'dashboard' : (viewName === 'user' ? '' : viewName);

    sidebarLinks.forEach(function (link) {
      link.classList.toggle('sidebar__link--active', link.getAttribute('data-view') === sidebarTarget);
    });

    tabbarBtns.forEach(function (btn) {
      btn.classList.toggle('tabbar__btn--active', btn.getAttribute('data-view') === sidebarTarget);
    });
    // Slide the highlight pill to the new active button
    updateTabbarPill();

    /* Update page title */
    if (els.pageTitle) els.pageTitle.textContent = viewTitles[viewName] || 'Dashboard';

    /* Update stats when viewing stats or profile */
    if (viewName === 'stats' || viewName === 'profile') updateStats();

    if (viewName === 'milestones') renderMilestonesUI();

    if (viewName === 'profile' && currentUser) {
      loadSessionHistory(currentUser.uid, 'sessionHistory');
    }

    if (viewName !== 'group') {
      stopGroupLiveSessions();
      stopGroupMembersListener();
      stopGroupSessionsCount();
      stopGroupDocListener();
    } else if (currentUser && selectedGroupId) {
      renderGroupDetailHeader();
      listenGroupDoc(selectedGroupId);
      listenGroupLiveSessions(currentUser, selectedGroupId);
      listenGroupMembers(selectedGroupId);
      listenGroupSessionsCount(selectedGroupId);
    }

    /* Focus search input when opening search */
    if (viewName === 'search' && els.searchInput) {
      setTimeout(function () { els.searchInput.focus(); }, 100);
    }

    /* Reset wizard to step 1 when entering session view */
    if (viewName === 'session') {
      var resultsPanel = document.getElementById('wizardResults');
      if (resultsPanel) resultsPanel.style.display = 'none';
      var stepsEl = document.querySelector('.wizard__steps');
      if (stepsEl) stepsEl.style.display = '';
      // Quick flow skips match details entirely.
      var step1Panel = document.getElementById('wizardStep1');
      if (forceQuickFlow) {
        if (step1Panel) step1Panel.style.display = 'none';
        goToWizardStep(2);
      } else {
        if (step1Panel) step1Panel.style.display = '';
        goToWizardStep(1);
      }

      updateConfirmButtonState();

      // Extra safety: if quick-flow entry, hide the mode card immediately.
      if (forceQuickFlow && els.sessionModeCard) {
        els.sessionModeCard.style.display = 'none';
      }
    }

    /* Scroll to top */
    window.scrollTo(0, 0);
  }

  /* ---------- MAIN NAVIGATION (sidebar + tabbar) ---------- */
  function setupNavigation() {
    var sidebarLinks = document.querySelectorAll('.sidebar__link[data-view]');
    var tabbarBtns = document.querySelectorAll('.tabbar__btn[data-view]');

    sidebarLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        switchView(link.getAttribute('data-view'));
      });
    });

    tabbarBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchView(btn.getAttribute('data-view'));
      });
    });

    document.querySelectorAll('.sidebar__logo[data-view], .topbar__logo[data-view]').forEach(function (logo) {
      logo.addEventListener('click', function () {
        switchView(logo.getAttribute('data-view'));
      });
    });

    // Position the floating tabbar's highlight pill on first paint and on resize/orientation.
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateTabbarPill);
      window.addEventListener('orientationchange', updateTabbarPill);
      // Run after layout settles (fonts/icons could shift widths slightly)
      requestAnimationFrame(updateTabbarPill);
      setTimeout(updateTabbarPill, 200);
    }
  }

  // Slides the floating-pill highlight to whichever tabbar button is currently active.
  // Uses translateX + width (instead of left) so transitions are GPU-accelerated.
  function updateTabbarPill() {
    var tabbar = document.getElementById('tabbar');
    var pill = document.getElementById('tabbarPill');
    if (!tabbar || !pill) return;
    // Don't animate if the tabbar isn't visible (e.g. desktop layout) — saves work and
    // avoids an initial jump if the user resizes from desktop down to mobile.
    if (window.getComputedStyle(tabbar).display === 'none') return;

    var active = tabbar.querySelector('.tabbar__btn--active');
    if (!active) return;

    // Use offsetLeft/offsetWidth (in CSS pixels) for stable positioning that
    // doesn't drift across rerenders.
    var x = active.offsetLeft;
    var w = active.offsetWidth;
    pill.style.transform = 'translateX(' + x + 'px)';
    pill.style.width = w + 'px';
  }

  /* ---------- HUB PANELS (dashboard → sub-views) ---------- */
  function setupHubPanels() {
    // Regular nav panels
    var panels = document.querySelectorAll('.hub__panel[data-subview]');
    panels.forEach(function (panel) {
      panel.addEventListener('click', function () {
        switchView(panel.getAttribute('data-subview'));
      });
    });

    // Action panels
    document.querySelectorAll('.hub__panel[data-action]').forEach(function (panel) {
      panel.addEventListener('click', function () {
        var action = panel.getAttribute('data-action');
        if (action === 'quick-session') {
          forceQuickFlow = true;
          switchView('session');
          if (els.sessionMode) {
            els.sessionMode.value = 'quick';
            // Trigger UI update
            try { els.sessionMode.dispatchEvent(new Event('change')); } catch (e) {}
          }
          beginQuickSessionRoster();
          return;
        }

        if (action === 'session-history') {
          switchView('profile');
          setTimeout(function () {
            var el = document.getElementById('sessionHistory');
            if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 200);
          return;
        }

        if (action === 'create-group') {
          switchView('groups');
          setTimeout(function () {
            if (els.createOfficialGroupBtn) els.createOfficialGroupBtn.click();
          }, 120);
          return;
        }

        if (action === 'group-sessions') {
          switchView('groups');
        }
      });
    });
  }

  /* ---------- BACK BUTTONS ---------- */
  function setupBackButtons() {
    var backBtns = document.querySelectorAll('.back-btn[data-back]');
    backBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dest = btn.getAttribute('data-back');
        switchView(dest, { skipHistory: true });
      });
    });
  }

  /* ---------- SEARCH ---------- */
  function setupSearch() {
    /* Toggle button in topbar */
    if (els.searchToggle) {
      els.searchToggle.addEventListener('click', function () {
        switchView('search');
      });
    }

    /* Close button */
    if (els.searchClose) {
      els.searchClose.addEventListener('click', function () {
        els.searchInput.value = '';
        switchView(previousView || 'dashboard', { skipHistory: true });
      });
    }

    /* Live search */
    if (els.searchInput) {
      els.searchInput.addEventListener('input', function () {
        var query = els.searchInput.value.trim().toLowerCase();
        renderSearchResults(query);
      });
    }
  }

  function renderSearchResults(query) {
    if (!query) {
      els.searchResults.innerHTML = '<p class="search-results__hint">' + escapeHtml(t('app.search.hint')) + '</p>';
      return;
    }

    var localHtml = '';

    /* Search local players */
    players.forEach(function (p) {
      if (p.name.toLowerCase().indexOf(query) !== -1) {
        var initial = p.name.charAt(0).toUpperCase();
        localHtml +=
          '<div class="search-results__item">' +
            '<div class="search-results__info">' +
              '<div class="search-results__badge">' + initial + '</div>' +
              '<div>' +
                '<span class="search-results__name">' + escapeHtml(p.name) + '</span><br>' +
                '<span class="search-results__type">' + escapeHtml(t('app.search.skill', { rating: p.rating })) + '</span>' +
              '</div>' +
            '</div>' +
            '<span class="search-results__type">' + escapeHtml(t('app.search.type.player')) + '</span>' +
          '</div>';
      }
    });

    /* Search local groups */
    groups.forEach(function (g) {
      if (g.name.toLowerCase().indexOf(query) !== -1) {
        var initial = g.name.charAt(0).toUpperCase();
        localHtml +=
          '<div class="search-results__item">' +
            '<div class="search-results__info">' +
              '<div class="search-results__badge">' + initial + '</div>' +
              '<div>' +
                '<span class="search-results__name">' + escapeHtml(g.name) + '</span><br>' +
                '<span class="search-results__type">' + escapeHtml(t('app.players.count', { count: g.players.length })) + '</span>' +
              '</div>' +
            '</div>' +
            '<span class="search-results__type">' + escapeHtml(t('app.search.type.group')) + '</span>' +
          '</div>';
      }
    });

    /* Search Firestore users by username */
    if (typeof db !== 'undefined' && db && query.length >= 2) {
      var searchQuery = query.replace(/^@/, '').toLowerCase();

      db.collection('users')
        .orderBy('username')
        .startAt(searchQuery)
        .endAt(searchQuery + '\uf8ff')
        .limit(8)
        .get()
        .then(function (snapshot) {
          var myFriends = [];
          if (currentUser) {
            db.collection('users').doc(currentUser.uid).get().then(function (doc) {
              if (doc.exists) myFriends = doc.data().friends || [];
              renderCombinedSearch(localHtml, snapshot, myFriends, query);
            });
          } else {
            renderCombinedSearch(localHtml, snapshot, [], query);
          }
        }).catch(function () {
          els.searchResults.innerHTML = localHtml || '<p class="search-results__hint">' + escapeHtml(t('app.search.no_results', { query: query })) + '</p>';
        });
    } else {
      els.searchResults.innerHTML = localHtml || '<p class="search-results__hint">' + escapeHtml(t('app.search.no_results', { query: query })) + '</p>';
    }
  }

  function renderCombinedSearch(localHtml, snapshot, myFriends, query) {
    var usersHtml = '';

    snapshot.forEach(function (doc) {
      var u = doc.data();
      if (currentUser && doc.id === currentUser.uid) return;

      var initial = (u.displayName || '?').charAt(0).toUpperCase();
      var avatarContent = u.photoURL
        ? '<img src="' + u.photoURL + '" alt="" class="avatar-img">'
        : initial;

      var isFriend = myFriends.indexOf(doc.id) !== -1;
      var actionHtml = isFriend
        ? '<span class="search-results__friend-tag">Friends</span>'
        : '<button class="search-results__add-btn" data-uid="' + doc.id + '" data-name="' + escapeHtml(u.displayName || '') + '">Add Friend</button>';

      usersHtml +=
        '<div class="search-results__item search-results__item--user" data-uid="' + doc.id + '">' +
          '<div class="search-results__info">' +
            '<div class="search-results__badge search-results__badge--user">' + avatarContent + '</div>' +
            '<div>' +
          '<span class="search-results__name search-results__name--user">' + escapeHtml(u.displayName || t('app.unknown')) + '</span><br>' +
              '<span class="search-results__type">@' + escapeHtml(u.username || '') + '</span>' +
            '</div>' +
          '</div>' +
          actionHtml +
        '</div>';
    });

    var combined = '';
    if (usersHtml) combined += usersHtml;
    if (localHtml) combined += localHtml;

    if (!combined) {
      els.searchResults.innerHTML = '<p class="search-results__hint">' + escapeHtml(t('app.search.no_results', { query: query })) + '</p>';
      return;
    }

    els.searchResults.innerHTML = combined;

    els.searchResults.querySelectorAll('.search-results__add-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var uid = btn.getAttribute('data-uid');
        var name = btn.getAttribute('data-name');
        sendFriendRequest(uid, name);
        btn.textContent = t('app.search.sent');
        btn.disabled = true;
        btn.classList.add('search-results__add-btn--sent');
      });
    });

    els.searchResults.querySelectorAll('.search-results__item--user').forEach(function (item) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', function (e) {
        if (e.target.closest('.search-results__add-btn') || e.target.closest('.search-results__friend-tag')) return;
        var uid = item.getAttribute('data-uid');
        if (uid) {
          userProfileHistory = [];
          openUserProfile(uid);
        }
      });
    });
  }

  /* ---------- WIZARD (multi-step session) ---------- */
  function setupWizard() {
    /* Steppers for team config */
    document.querySelectorAll('.stepper__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-stepper');
        var input = document.getElementById(targetId);
        if (!input) return;
        var dir = parseInt(btn.getAttribute('data-dir'), 10);
        var val = parseInt(input.value, 10) + dir;
        var min = parseInt(input.min, 10);
        var max = parseInt(input.max, 10);
        if (val < min || val > max) return;
        input.value = val;
        updateTeamSummary();
      });
    });

    /* Position picker */
    document.querySelectorAll('.pos-picker__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.pos-picker__btn').forEach(function (b) {
          b.classList.remove('pos-picker__btn--active');
        });
        btn.classList.add('pos-picker__btn--active');
        selectedPosition = btn.getAttribute('data-pos');
      });
    });

    /* Step 1 → 2 */
    var next1 = document.getElementById('wizardNext1');
    if (next1) next1.addEventListener('click', function () {
      if (!els.sessionVenue || !els.sessionVenue.value.trim()) {
        els.sessionVenue.focus();
        return;
      }
      goToWizardStep(2);
    });

    /* Step 2 → 3 */
    var next2 = document.getElementById('wizardNext2');
    if (next2) next2.addEventListener('click', function () { goToWizardStep(3); });

    /* Step 2 ← back */
    var back2 = document.getElementById('wizardBack2');
    if (back2) back2.addEventListener('click', function () { goToWizardStep(1); });

    /* Step 3 ← back */
    var back3 = document.getElementById('wizardBack3');
    if (back3) back3.addEventListener('click', function () { goToWizardStep(2); });

    /* Results ← back to re-shuffle */
    var resultsBack = document.getElementById('resultsBack');
    if (resultsBack) resultsBack.addEventListener('click', function () {
      pendingSession = null;
      var quick = isQuickSessionMode();
      var resultsPanel = document.getElementById('wizardResults');
      if (resultsPanel) resultsPanel.style.display = 'none';
      var stepsEl = document.querySelector('.wizard__steps');
      if (stepsEl) stepsEl.style.display = '';
      goToWizardStep(3);
      if (quick) {
        players = [];
        editingId = null;
        selectedPlayerUid = null;
        selectedPlayerPhoto = null;
        if (els.addForm) els.addForm.reset();
        if (els.ratingVal) els.ratingVal.textContent = '5';
        if (els.playerName) els.playerName.classList.remove('add-form__input--linked');
        var md = document.getElementById('mentionDropdown');
        if (md) md.innerHTML = '';
        renderRoster();
        saveData();
      }
    });

    /* Confirm & Go Live */
    var confirmBtn = document.getElementById('resultsConfirm');
    if (confirmBtn) confirmBtn.addEventListener('click', function () {
      if (!pendingSession) return;
      if (!isOfficialModeReady()) {
        showToast(t('app.results.official_hint'), 'info');
        return;
      }
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = escapeHtml(t('app.session.going_live')) + '\u2026';

      saveSessionToFirestore(pendingSession.teams, pendingSession.nTeams, pendingSession.ppt, selectedGroup);

      confirmBtn.innerHTML = '\u2713 ' + escapeHtml(t('app.session.live'));
      confirmBtn.classList.add('btn--confirmed');
      pendingSession = null;
      showToast(t('toast.session_live'), 'success');
    });

    /* New session from results */
    var newSession = document.getElementById('resultsNewSession');
    if (newSession) newSession.addEventListener('click', function () {
      pendingSession = null;
      players = [];
      editingId = null;
      selectedPosition = 'HYB';
      if (els.addForm) els.addForm.reset();
      if (els.ratingVal) els.ratingVal.textContent = '5';
      document.querySelectorAll('.pos-picker__btn').forEach(function (b) {
        b.classList.remove('pos-picker__btn--active');
      });
      var firstPos = document.querySelector('.pos-picker__btn[data-pos="HYB"]');
      if (firstPos) firstPos.classList.add('pos-picker__btn--active');
      renderRoster();
      var resultsPanel = document.getElementById('wizardResults');
      if (resultsPanel) resultsPanel.style.display = 'none';
      var stepsEl = document.querySelector('.wizard__steps');
      if (stepsEl) stepsEl.style.display = '';
      goToWizardStep(1);
      if (els.sessionVenue) els.sessionVenue.value = '';
      if (els.sessionDate) els.sessionDate.value = '';
      if (els.sessionTime) els.sessionTime.value = '';
    });

    updateTeamSummary();
  }

  function goToWizardStep(step) {
    currentWizardStep = step;
    /* Hide all wizard panels */
    document.querySelectorAll('.wizard__panel').forEach(function (p) {
      p.classList.remove('wizard__panel--active');
    });

    /* Show target step */
    var target = document.getElementById('wizardStep' + step);
    if (target) target.classList.add('wizard__panel--active');

    /* Update step indicators */
    document.querySelectorAll('[data-step-indicator]').forEach(function (indicator) {
      var s = parseInt(indicator.getAttribute('data-step-indicator'), 10);
      indicator.classList.remove('wizard__step--active', 'wizard__step--done');
      if (s === step) indicator.classList.add('wizard__step--active');
      else if (s < step) indicator.classList.add('wizard__step--done');
    });

    /* Focus first input if relevant */
    if (step === 3 && els.playerName) {
      setTimeout(function () { els.playerName.focus(); }, 100);
    }

    window.scrollTo(0, 0);
  }

  function updateTeamSummary() {
    if (!els.numTeams || !els.playersPerTeam || !els.teamSummary) return;
    var nTeams = parseInt(els.numTeams.value, 10);
    var ppt = parseInt(els.playersPerTeam.value, 10);
    var total = nTeams * ppt;
    els.teamSummary.textContent = t('app.team_config.summary', { teams: nTeams, ppt: ppt, total: total });
    updatePlayerProgress();
  }

  function getTotalNeeded() {
    if (!els.numTeams || !els.playersPerTeam) return 10;
    return parseInt(els.numTeams.value, 10) * parseInt(els.playersPerTeam.value, 10);
  }

  function updatePlayerProgress() {
    if (!els.playerProgress) return;
    els.playerProgress.textContent = t('app.player_progress', { current: players.length, total: getTotalNeeded() });
  }

  /* ---------- ADD / EDIT PLAYER FORM ---------- */
  function setupForm() {
    if (!els.playerRating || !els.addForm) return;

    var mentionDropdown = document.getElementById('mentionDropdown');
    var mentionDebounce = null;

    /* Live rating display */
    els.playerRating.addEventListener('input', function () {
      els.ratingVal.textContent = els.playerRating.value;
    });

    /* @mention detection on name input */
    els.playerName.addEventListener('input', function () {
      var val = els.playerName.value;
      selectedPlayerUid = null;
      els.playerName.classList.remove('add-form__input--linked');

      if (isQuickSessionMode()) {
        if (mentionDropdown) mentionDropdown.innerHTML = '';
        return;
      }

      if (val.charAt(0) === '@' && val.length > 1) {
        var query = val.substring(1).toLowerCase();
        clearTimeout(mentionDebounce);
        mentionDebounce = setTimeout(function () {
          searchUsers(query, mentionDropdown);
        }, 250);
      } else {
        if (mentionDropdown) mentionDropdown.innerHTML = '';
      }
    });

    /* Close dropdown on outside click */
    document.addEventListener('click', function (e) {
      if (mentionDropdown && !mentionDropdown.contains(e.target) && e.target !== els.playerName) {
        mentionDropdown.innerHTML = '';
      }
    });

    els.addForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var rawName = els.playerName.value.trim();
      if (isQuickSessionMode()) {
        if (selectedPlayerUid) {
          showToast(t('toast.quick_no_mentions'), 'info');
          return;
        }
        if (rawName.charAt(0) === '@') {
          showToast(t('toast.quick_no_mentions'), 'info');
          return;
        }
      } else {
        if (rawName.charAt(0) === '@' && !selectedPlayerUid) {
          showToast(t('toast.official_mention_pick'), 'info');
          return;
        }
      }

      var name = rawName.charAt(0) === '@' && !selectedPlayerUid ? rawName.substring(1) : rawName;
      if (selectedPlayerUid) name = rawName;
      var rating = parseInt(els.playerRating.value, 10);

      if (!name) return;

      var wasEdit = (editingId !== null);
      var linkUid = isQuickSessionMode() ? null : (selectedPlayerUid || null);
      var linkPhoto = isQuickSessionMode() ? null : (selectedPlayerPhoto || null);

      if (editingId !== null) {
        var player = players.find(function (p) { return p.id === editingId; });
        if (player) {
          player.name = name;
          player.rating = rating;
          player.position = selectedPosition;
          player.uid = linkUid;
          player.photoURL = linkPhoto;
        }
        editingId = null;
        els.addForm.querySelector('.add-form__submit').innerHTML = escapeHtml(t('app.player.add')) + ' <span class="btn__arrow">+</span>';
      } else {
        players.push({
          id: Date.now() + Math.random(),
          name: name,
          rating: rating,
          position: selectedPosition,
          uid: linkUid,
          photoURL: linkPhoto
        });
      }

      selectedPlayerUid = null;
      selectedPlayerPhoto = null;
      saveData();
      renderRoster();
      showToast(wasEdit ? t('toast.player_updated', { name: name }) : t('toast.player_added', { name: name }), 'success');
      els.addForm.reset();
      els.ratingVal.textContent = '5';
      els.playerName.classList.remove('add-form__input--linked');
      if (mentionDropdown) mentionDropdown.innerHTML = '';
      els.playerName.focus();
    });
  }

  /* ---------- @MENTION: group members only (official sessions) ---------- */
  function renderMentionDropdownFromMembers(matches, dropdown) {
    if (!matches.length) {
      dropdown.innerHTML = '<div class="mention-dropdown__empty">' + escapeHtml(t('app.mentions.empty')) + '</div>';
      return;
    }
    var html = '';
    matches.forEach(function (m) {
      var initial = (m.displayName || '?').charAt(0).toUpperCase();
      var avatarContent = m.photoURL
        ? '<img src="' + m.photoURL + '" alt="" class="mention-dropdown__avatar-img">'
        : initial;
      var uname = m.username ? ('@' + escapeHtml(m.username)) : '';
      html += '<button type="button" class="mention-dropdown__item" data-uid="' + m.uid + '" data-name="' + escapeHtml(m.displayName || '') + '" data-photo="' + escapeHtml(m.photoURL || '') + '">' +
        '<span class="mention-dropdown__avatar">' + avatarContent + '</span>' +
        '<span class="mention-dropdown__info">' +
          '<span class="mention-dropdown__name">' + escapeHtml(m.displayName || t('app.unknown')) + '</span>' +
          (uname ? '<span class="mention-dropdown__username">' + uname + '</span>' : '') +
        '</span>' +
      '</button>';
    });
    dropdown.innerHTML = html;
    dropdown.querySelectorAll('.mention-dropdown__item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var uid = btn.getAttribute('data-uid');
        var name = btn.getAttribute('data-name');
        var photo = btn.getAttribute('data-photo');
        els.playerName.value = name;
        selectedPlayerUid = uid;
        selectedPlayerPhoto = photo || null;
        els.playerName.classList.add('add-form__input--linked');
        dropdown.innerHTML = '';
        els.playerRating.focus();
      });
    });
  }

  function searchUsers(query, dropdown) {
    if (typeof db === 'undefined' || !db || !dropdown) return;
    if (isQuickSessionMode()) return;

    var gid = selectedGroupId;
    if (!gid) {
      dropdown.innerHTML = '<div class="mention-dropdown__empty">' + escapeHtml(t('app.mentions.select_group_first')) + '</div>';
      return;
    }

    fetchGroupMembersForMentions(gid).then(function (list) {
      var matches = filterMembersByMentionQuery(list, query);
      renderMentionDropdownFromMembers(matches, dropdown);
    });
  }

  /* ---------- RENDER ROSTER ---------- */
  function renderRoster() {
    if (!els.roster) return;

    /* Clear existing items (keep empty message) */
    var items = els.roster.querySelectorAll('.roster__item');
    items.forEach(function (item) { item.remove(); });

    var total = getTotalNeeded();

    if (players.length === 0) {
      if (els.rosterEmpty) els.rosterEmpty.style.display = '';
      if (els.generateBtn) els.generateBtn.disabled = true;
      if (els.playerCount) els.playerCount.textContent = t('app.players.count', { count: 0 });
      updatePlayerProgress();
      return;
    }

    if (els.rosterEmpty) els.rosterEmpty.style.display = 'none';
    if (els.generateBtn) els.generateBtn.disabled = players.length < total;
    if (els.playerCount) els.playerCount.textContent = t('app.players.count', { count: players.length });
    updatePlayerProgress();

    var posLabels = { HYB: 'HYB', ATK: 'ATK', DEF: 'DEF', GK: 'GK' };

    players.forEach(function (player, idx) {
      var item = document.createElement('div');
      item.className = 'roster__item';
      item.style.animationDelay = (idx * 40) + 'ms';

      var initial = player.name.charAt(0).toUpperCase();
      var posTag = posLabels[player.position] || 'HYB';
      var isLinked = !!player.uid;
      var badgeClass = isLinked ? 'roster__badge roster__badge--linked' : 'roster__badge';
      var nameClass = isLinked ? 'roster__name roster__name--linked' : 'roster__name';

      item.innerHTML =
        '<div class="roster__player">' +
          '<div class="' + badgeClass + '">' + initial + '</div>' +
          '<div>' +
            '<span class="' + nameClass + '">' + escapeHtml(player.name) + '</span>' +
            '<span class="roster__rating"> — Lvl ' + player.rating + ' · ' + posTag + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="roster__actions">' +
          '<button class="roster__btn roster__btn--edit" data-id="' + player.id + '" title="Edit">\u270E</button>' +
          '<button class="roster__btn roster__btn--delete" data-id="' + player.id + '" title="Delete">\u00D7</button>' +
        '</div>';

      els.roster.appendChild(item);
    });

    /* Attach edit/delete handlers */
    els.roster.querySelectorAll('.roster__btn--edit').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseFloat(btn.getAttribute('data-id'));
        editPlayer(id);
      });
    });

    els.roster.querySelectorAll('.roster__btn--delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseFloat(btn.getAttribute('data-id'));
        deletePlayer(id);
      });
    });
  }

  function editPlayer(id) {
    var player = players.find(function (p) { return p.id === id; });
    if (!player) return;

    editingId = id;
    els.playerName.value = player.name;
    els.playerRating.value = player.rating;
    els.ratingVal.textContent = player.rating;

    /* Set position picker */
    selectedPosition = player.position || 'HYB';
    document.querySelectorAll('.pos-picker__btn').forEach(function (b) {
      b.classList.toggle('pos-picker__btn--active', b.getAttribute('data-pos') === selectedPosition);
    });

    els.addForm.querySelector('.add-form__submit').innerHTML = escapeHtml(t('app.player.update')) + ' <span class="btn__arrow">\u2713</span>';
    els.playerName.focus();
  }

  function deletePlayer(id) {
    var player = players.find(function (p) { return p.id === id; });
    var pName = player ? player.name : t('app.user.player');
    players = players.filter(function (p) { return p.id !== id; });
    saveData();
    renderRoster();
    showToast(t('toast.player_removed', { name: pName }), 'info');
  }

  /* ---------- TEAM GENERATION (Position-Aware Balanced Draft) ---------- */
  function setupGenerate() {
    if (!els.generateBtn) return;
    els.generateBtn.addEventListener('click', function () {
      var total = getTotalNeeded();
      if (players.length < total) return;
      generateTeams();
    });
  }

  /* ---- Balancing: skill-first utility, then position spread ----
     UI 1–10 → internal skill ~ -1 … +5. Field roles add a small bump: HYB > DEF > ATK.
     GKs use skill only and are placed first, spread across teams by utility spread + GK count.
     Remaining players go in skill order; each pick minimizes spread of team utility, then
     stacks of the same position, then roster size. A swap pass tightens totals + position mix. */

  function toInternal(uiRating) {
    return (uiRating - 1) * (6 / 9) - 1;
  }

  var FIELD_POS_UTILITY = { HYB: 0.58, DEF: 0.30, ATK: 0.14 };

  function utilityScore(player) {
    var base = toInternal(player.rating);
    if (player.position === 'GK') return base;
    return base + (FIELD_POS_UTILITY[player.position] != null ? FIELD_POS_UTILITY[player.position] : 0.4);
  }

  function recomputeTeamTotals(teams) {
    teams.forEach(function (team) {
      team.effTotal = 0;
      team.uiTotal = 0;
      team.players.forEach(function (p) {
        team.effTotal += utilityScore(p);
        team.uiTotal += p.rating;
      });
    });
  }

  function spreadOfTeamEff(teams) {
    if (!teams.length) return 0;
    var minV = Infinity;
    var maxV = -Infinity;
    teams.forEach(function (t) {
      if (t.effTotal < minV) minV = t.effTotal;
      if (t.effTotal > maxV) maxV = t.effTotal;
    });
    return maxV - minV;
  }

  function countPosOnTeam(team, pos) {
    var n = 0;
    team.players.forEach(function (p) {
      if (p.position === pos) n++;
    });
    return n;
  }

  function simulatedSpreadAfterAdd(teams, trialIdx, addU) {
    var minV = Infinity;
    var maxV = -Infinity;
    for (var j = 0; j < teams.length; j++) {
      var v = teams[j].effTotal + (j === trialIdx ? addU : 0);
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    return maxV - minV;
  }

  function cmpKey(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  }

  function positionClusterPenalty(teams) {
    var positions = ['GK', 'HYB', 'DEF', 'ATK'];
    var penalty = 0;
    positions.forEach(function (pos) {
      var counts = teams.map(function (t) { return countPosOnTeam(t, pos); });
      var maxC = Math.max.apply(null, counts);
      var minC = Math.min.apply(null, counts);
      penalty += (maxC - minC) * (pos === 'GK' ? 1.15 : 1);
    });
    return penalty;
  }

  /* Variance of effective totals — squared deviations are a stricter
     balance metric than max-min spread, because it punishes outliers
     even when they don't change the extremes. */
  function varianceOfTeamEff(teams) {
    if (!teams.length) return 0;
    var sum = 0;
    for (var i = 0; i < teams.length; i++) sum += teams[i].effTotal;
    var mean = sum / teams.length;
    var v = 0;
    for (var k = 0; k < teams.length; k++) {
      var d = teams[k].effTotal - mean;
      v += d * d;
    }
    return v / teams.length;
  }

  function combinedBalanceCost(teams) {
    /* Spread (max-min) is the primary signal users feel. Variance is a
       finer-grained tie-breaker. Position-cluster penalty discourages
       e.g. all attackers on one team. */
    return spreadOfTeamEff(teams) * 1.0
         + varianceOfTeamEff(teams) * 0.18
         + positionClusterPenalty(teams) * 0.12;
  }

  function cloneTeams(teams) {
    return teams.map(function (t) {
      return {
        players: t.players.slice(),
        effTotal: t.effTotal,
        uiTotal: t.uiTotal
      };
    });
  }

  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /* Greedy LPT assignment: sort players by utility desc, then for each
     player place them on the team with lowest current utility that
     still has room. Position-cluster aware. */
  function greedyAssign(pool, nTeams, ppt, randomize) {
    var teams = [];
    for (var t = 0; t < nTeams; t++) {
      teams.push({ players: [], effTotal: 0, uiTotal: 0 });
    }

    var goalkeepers = pool.filter(function (p) { return p.position === 'GK'; });
    var others = pool.filter(function (p) { return p.position !== 'GK'; });

    function placeWithKey(player, keyFn) {
      var u = utilityScore(player);
      var bestIdx = null;
      var bestKey = null;
      // When randomizing, iterate teams in shuffled order so ties break differently
      var order = [];
      for (var i = 0; i < nTeams; i++) order.push(i);
      if (randomize) shuffleArray(order);

      for (var oi = 0; oi < order.length; oi++) {
        var idx = order[oi];
        if (teams[idx].players.length >= ppt) continue;
        var key = keyFn(teams, idx, u, player);
        if (bestKey === null || cmpKey(key, bestKey) < 0) {
          bestKey = key;
          bestIdx = idx;
        }
      }
      if (bestIdx !== null) {
        teams[bestIdx].players.push(player);
        teams[bestIdx].effTotal += u;
        teams[bestIdx].uiTotal += player.rating;
      }
    }

    goalkeepers.sort(function (a, b) { return utilityScore(b) - utilityScore(a); });
    if (randomize) {
      // Add a tiny random jitter to break ties between equal-utility GKs
      goalkeepers.sort(function (a, b) {
        var diff = utilityScore(b) - utilityScore(a);
        return Math.abs(diff) < 1e-9 ? (Math.random() - 0.5) : diff;
      });
    }

    goalkeepers.forEach(function (gk) {
      placeWithKey(gk, function (T, i, addU) {
        return [
          simulatedSpreadAfterAdd(T, i, addU),
          countPosOnTeam(T[i], 'GK'),
          T[i].players.length,
          T[i].effTotal
        ];
      });
    });

    others.sort(function (a, b) { return utilityScore(b) - utilityScore(a); });
    if (randomize) {
      others.sort(function (a, b) {
        var diff = utilityScore(b) - utilityScore(a);
        return Math.abs(diff) < 1e-9 ? (Math.random() - 0.5) : diff;
      });
    }

    others.forEach(function (player) {
      placeWithKey(player, function (T, i, addU, pl) {
        return [
          simulatedSpreadAfterAdd(T, i, addU),
          countPosOnTeam(T[i], pl.position),
          T[i].players.length,
          T[i].effTotal
        ];
      });
    });

    return teams;
  }

  /* Hill-climb via single-player swaps. Recomputes totals incrementally
     for speed, restores swap if no improvement found. Stops when a full
     pass yields no improvement (local optimum). */
  function refineTeamsBySwaps(teams, nTeams, maxRounds) {
    recomputeTeamTotals(teams);
    var rounds = typeof maxRounds === 'number' ? maxRounds : 30;
    var cur = combinedBalanceCost(teams);
    for (var round = 0; round < rounds; round++) {
      var improved = false;
      for (var a = 0; a < nTeams; a++) {
        for (var b = a + 1; b < nTeams; b++) {
          for (var i = 0; i < teams[a].players.length; i++) {
            for (var j = 0; j < teams[b].players.length; j++) {
              var p1 = teams[a].players[i];
              var p2 = teams[b].players[j];
              var u1 = utilityScore(p1);
              var u2 = utilityScore(p2);

              // Apply swap (incremental totals)
              teams[a].players[i] = p2;
              teams[b].players[j] = p1;
              teams[a].effTotal += (u2 - u1);
              teams[b].effTotal += (u1 - u2);
              teams[a].uiTotal += (p2.rating - p1.rating);
              teams[b].uiTotal += (p1.rating - p2.rating);

              var next = combinedBalanceCost(teams);
              if (next < cur - 1e-9) {
                cur = next;
                improved = true;
              } else {
                // revert
                teams[a].players[i] = p1;
                teams[b].players[j] = p2;
                teams[a].effTotal -= (u2 - u1);
                teams[b].effTotal -= (u1 - u2);
                teams[a].uiTotal -= (p2.rating - p1.rating);
                teams[b].uiTotal -= (p1.rating - p2.rating);
              }
            }
          }
        }
      }
      if (!improved) break;
    }
    return cur;
  }

  /* Multi-restart wrapper: try N seedings of the greedy assignment with
     randomized tie-breaks, refine each via swaps, and return the best.
     This is a tried-and-true approach for the balanced-partition problem
     and produces noticeably tighter results than a single greedy pass. */
  function buildBalancedTeams(pool, nTeams, ppt, restarts) {
    var bestTeams = null;
    var bestCost = Infinity;

    var attempts = typeof restarts === 'number' ? restarts : 12;

    for (var r = 0; r < attempts; r++) {
      var randomize = r > 0; // first run is deterministic for reproducibility
      var trial = greedyAssign(pool, nTeams, ppt, randomize);
      var cost = refineTeamsBySwaps(trial, nTeams, 30);
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        bestTeams = cloneTeams(trial);
      }
    }

    return bestTeams || greedyAssign(pool, nTeams, ppt, false);
  }

  function generateTeams() {
    var nTeams = parseInt(els.numTeams.value, 10);
    var ppt = parseInt(els.playersPerTeam.value, 10);

    /* Show loading state */
    if (els.generateBtn) els.generateBtn.disabled = true;
    document.querySelectorAll('.wizard__panel').forEach(function (p) {
      p.classList.remove('wizard__panel--active');
    });
    var stepsEl = document.querySelector('.wizard__steps');
    if (stepsEl) stepsEl.style.display = 'none';
    if (els.generateLoading) {
      els.generateLoading.style.display = '';
      var bar = els.generateLoading.querySelector('.generate-loading__bar-fill');
      if (bar) { bar.style.animation = 'none'; bar.offsetHeight; bar.style.animation = ''; }
    }

    setTimeout(function () {
      try {
        if (els.generateLoading) els.generateLoading.style.display = 'none';
        if (els.generateBtn) els.generateBtn.disabled = false;

        var pool = players.slice();

        // Multi-restart greedy + hill-climb. Larger restart counts for
        // smaller pools (cheap), smaller counts for big pools (expensive).
        var restarts = pool.length <= 20 ? 24 : (pool.length <= 30 ? 16 : 10);
        var teams = buildBalancedTeams(pool, nTeams, ppt, restarts);
        recomputeTeamTotals(teams);

        renderResults(teams);

        /* Track games (device tally only — quick games don't count) */
        if (!isQuickSessionMode()) {
          gamesGenerated++;
        }
        saveData();

        /* Store pending — don't go live until user confirms */
        pendingSession = { teams: teams, nTeams: nTeams, ppt: ppt };
        var confirmBtn = document.getElementById('resultsConfirm');
        if (confirmBtn) {
          confirmBtn.disabled = !isOfficialModeReady();
          confirmBtn.innerHTML = escapeHtml(t('app.session.confirm_go_live')) + ' <span class="btn__arrow">\u2192</span>';
          confirmBtn.classList.remove('btn--confirmed');
        }

        showToast(t('toast.teams_balanced'), 'success');
        updateConfirmButtonState();
      } catch (err) {
        console.error('Team generation failed:', err);
        try { window.NiteRunErrors && window.NiteRunErrors.log(err, 'generateTeams'); } catch (e2) {}
        if (els.generateLoading) els.generateLoading.style.display = 'none';
        if (els.generateBtn) els.generateBtn.disabled = false;
        showToast(t('toast.something_went_wrong') || 'Something went wrong.', 'danger');
      }
    }, 700);
  }

  /* ---------- SAVE SESSION TO FIRESTORE ---------- */
  function saveSessionToFirestore(teams, nTeams, ppt, group) {
    if (typeof db === 'undefined' || !db || !currentUser) return;
    if (!group || !group.id) return;

    var venue = els.sessionVenue ? els.sessionVenue.value.trim() : '';
    var date = els.sessionDate ? els.sessionDate.value : '';
    var time = els.sessionTime ? els.sessionTime.value : '';

    var teamNames = ['Team A', 'Team B', 'Team C', 'Team D', 'Team E', 'Team F', 'Team G', 'Team H'];

    var teamsData = teams.map(function (team, idx) {
      return {
        name: teamNames[idx] || ('Team ' + (idx + 1)),
        uiTotal: team.uiTotal,
        players: team.players.map(function (p) {
          return {
            name: p.name,
            position: p.position || 'HYB',
            rating: p.rating,
            uid: p.uid || null,
            isGuest: p.uid ? false : true,
            photoURL: p.photoURL || null
          };
        })
      };
    });

    var allPlayers = [];
    var invitedUids = [];
    teams.forEach(function (team) {
      team.players.forEach(function (p) {
        allPlayers.push({
          name: p.name,
          position: p.position || 'HYB',
          rating: p.rating,
          uid: p.uid || null,
          isGuest: p.uid ? false : true,
          photoURL: p.photoURL || null
        });
        if (p.uid) invitedUids.push(p.uid);
      });
    });

    db.collection('sessions').add({
      groupId: group.id,
      groupName: group.name || '',
      creatorId: currentUser.uid,
      creatorName: currentUser.displayName || 'Player',
      venue: venue,
      date: date,
      time: time,
      numTeams: nTeams,
      playersPerTeam: ppt,
      status: 'live',
      players: allPlayers,
      teams: teamsData,
      invitedUids: invitedUids,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      db.collection('users').doc(currentUser.uid).update({
        sessionsPlayed: firebase.firestore.FieldValue.increment(1)
      }).catch(function () {});

      invitedUids.forEach(function (uid) {
        db.collection('users').doc(uid).update({
          sessionsPlayed: firebase.firestore.FieldValue.increment(1)
        }).catch(function () {});
      });

      notifySessionInvites(invitedUids, venue);
    }).catch(function (err) {
      console.error('Failed to save session:', err);
      try { window.NiteRunErrors && window.NiteRunErrors.log(err, 'saveSession'); } catch (e2) {}
      var msg = t('toast.session_save_failed');
      var c = err && err.code ? String(err.code) : '';
      if (c === 'permission-denied') msg = t('toast.session_save_permission');
      else if (c === 'unavailable') msg = t('toast.error.offline');
      showToast(msg, 'danger');
    });
  }

  function renderResults(teams) {
    if (!els.resultsGrid) return;

    /* Build meta info */
    var venue = els.sessionVenue ? els.sessionVenue.value.trim() : '';
    var date = els.sessionDate ? els.sessionDate.value : '';
    var time = els.sessionTime ? els.sessionTime.value : '';
    var metaParts = [];
    if (venue) metaParts.push(venue);
    if (date) metaParts.push(date);
    if (time) metaParts.push(time);
    if (els.resultsMeta) els.resultsMeta.textContent = metaParts.join(' \u00B7 ');

    var teamNames = ['Team A', 'Team B', 'Team C', 'Team D', 'Team E', 'Team F', 'Team G', 'Team H'];
    var posLabels = { HYB: 'HYB', ATK: 'ATK', DEF: 'DEF', GK: 'GK' };

    var html = '';
    teams.forEach(function (team, idx) {
      html += '<div class="team-card">';
      html += '<h3 class="team-card__name">' + teamNames[idx] + '</h3>';
      html += '<p class="team-card__skill">Total Skill: ' + team.uiTotal + '</p>';
      html += '<ul class="team-card__list">';
      team.players.forEach(function (p) {
        var posTag = posLabels[p.position] || 'HYB';
        html +=
          '<li class="team-card__player">' +
            '<div class="team-card__player-info">' +
              '<span class="team-card__player-name">' + escapeHtml(p.name) + '</span>' +
              '<span class="team-card__player-pos">' + posTag + '</span>' +
            '</div>' +
            '<span class="team-card__player-level">' + p.rating + '</span>' +
          '</li>';
      });
      html += '</ul></div>';
    });

    els.resultsGrid.innerHTML = html;

    /* Show results panel, hide wizard steps */
    document.querySelectorAll('.wizard__panel').forEach(function (p) {
      p.classList.remove('wizard__panel--active');
    });
    var resultsPanel = document.getElementById('wizardResults');
    if (resultsPanel) resultsPanel.style.display = 'block';

    /* Hide step indicator */
    var stepsEl = document.querySelector('.wizard__steps');
    if (stepsEl) stepsEl.style.display = 'none';

    window.scrollTo(0, 0);
  }

  /* ---------- GROUPS ---------- */
  function setupGroups() {
    if (!els.createGroupBtn) return;

    els.createGroupBtn.addEventListener('click', function () {
      showModal({
        title: t('modal.new_group.title'),
        inputMode: true,
        placeholder: t('modal.new_group.placeholder'),
        confirmText: t('modal.action.create'),
        onConfirm: function (val) {
          if (!val || !val.trim()) return;
          groups.push({
            id: Date.now() + Math.random(),
            name: val.trim(),
            players: []
          });
          saveData();
          renderGroups();
          showToast(t('toast.group_created_named', { name: val.trim() }), 'success');
        }
      });
    });

    renderGroups();
  }

  function renderGroups() {
    if (!els.groupsList) return;

    /* Clear existing items */
    var items = els.groupsList.querySelectorAll('.group-item');
    items.forEach(function (item) { item.remove(); });

    if (groups.length === 0) {
      if (els.groupsEmpty) els.groupsEmpty.style.display = '';
      return;
    }

    if (els.groupsEmpty) els.groupsEmpty.style.display = 'none';

    groups.forEach(function (group) {
      var item = document.createElement('div');
      item.className = 'group-item';

      var initial = group.name.charAt(0).toUpperCase();

      item.innerHTML =
        '<div class="group-item__info">' +
          '<div class="group-item__badge">' + initial + '</div>' +
          '<div>' +
            '<span class="group-item__name">' + escapeHtml(group.name) + '</span><br>' +
            '<span class="group-item__count">' + escapeHtml(t('app.players.count', { count: group.players.length })) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="roster__actions">' +
          '<button class="roster__btn roster__btn--delete" data-group-id="' + group.id + '" title="' + escapeHtml(t('app.actions.delete')) + '">×</button>' +
        '</div>';

      els.groupsList.appendChild(item);
    });

    /* Delete handlers */
    els.groupsList.querySelectorAll('.roster__btn--delete[data-group-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseFloat(btn.getAttribute('data-group-id'));
        var group = groups.find(function (g) { return g.id === id; });
        var gName = group ? group.name : t('app.group');
        groups = groups.filter(function (g) { return g.id !== id; });
        saveData();
        renderGroups();
        showToast(t('toast.group_removed_named', { name: gName }), 'info');
      });
    });
  }

  /* ---------- CLEAR DATA ---------- */
  function setupClearData() {
    if (!els.clearDataBtn) return;
    els.clearDataBtn.addEventListener('click', function () {
      showModal({
        title: t('modal.clear_data.title'),
        message: t('modal.clear_data.body'),
        danger: true,
        confirmText: t('modal.action.clear_everything'),
        onConfirm: function () {
          players = [];
          groups = [];
          gamesGenerated = 0;
          editingId = null;
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(GAMES_KEY);
          localStorage.removeItem(GROUPS_KEY);
          renderRoster();
          renderGroups();
          updateStats();
          showToast(t('toast.all_data_cleared'), 'danger');
        }
      });
    });
  }

  /* ---------- STATS ---------- */
  function updateStats() {
    if (els.statPlayers) els.statPlayers.textContent = players.length;
    if (els.statGames) els.statGames.textContent = gamesGenerated;
    if (els.statGroups) els.statGroups.textContent = groups.length;
    if (els.statSessions) els.statSessions.textContent = gamesGenerated;
  }

  /* ---------- TOAST ---------- */
  function showToast(message, type) {
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast--' + (type || 'info');
    toast.textContent = message;
    container.appendChild(toast);
    toast.addEventListener('animationend', function (e) {
      if (e.animationName === 'toastOut') toast.remove();
    });
  }

  /* ---------- MODAL ---------- */
  function setupModal() {
    var overlay = document.getElementById('modalOverlay');
    var cancelBtn = document.getElementById('modalCancel');
    var confirmBtn = document.getElementById('modalConfirm');
    var input = document.getElementById('modalInput');

    if (cancelBtn) cancelBtn.addEventListener('click', hideModal);
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hideModal();
    });
    if (confirmBtn) confirmBtn.addEventListener('click', function () {
      if (modalCallback) modalCallback(input ? input.value : '');
      hideModal();
    });
    if (input) input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (modalCallback) modalCallback(input.value);
        hideModal();
      }
    });
  }

  function showModal(opts) {
    var overlay = document.getElementById('modalOverlay');
    var title = document.getElementById('modalTitle');
    var message = document.getElementById('modalMessage');
    var input = document.getElementById('modalInput');
    var confirmBtn = document.getElementById('modalConfirm');

    if (title) title.textContent = opts.title || '';
    if (message) {
      message.textContent = opts.message || '';
      message.style.display = opts.message ? '' : 'none';
    }
    if (input) {
      input.style.display = opts.inputMode ? '' : 'none';
      input.type = opts.inputType || 'text';
      input.placeholder = opts.placeholder || '';
      input.value = '';
    }
    if (confirmBtn) {
      confirmBtn.textContent = opts.confirmText || t('app.actions.confirm') || 'Confirm';
      confirmBtn.className = opts.danger ? 'btn btn--danger btn--sm' : 'btn btn--primary btn--sm';
    }
    modalCallback = opts.onConfirm || null;
    if (overlay) overlay.classList.add('modal-overlay--active');
    if (opts.inputMode && input) {
      setTimeout(function () { input.focus(); }, 150);
    }
  }

  function hideModal() {
    var overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.remove('modal-overlay--active');
    modalCallback = null;
  }

  /* ---------- HELPERS ---------- */
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

})();
