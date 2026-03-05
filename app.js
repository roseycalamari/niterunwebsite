/* ========================================================
   NITE-RUN — Dashboard App Logic
   Hub navigation · Sub-views · Session Wizard · Team Balancer
   Search · Groups
   ======================================================== */

(function () {
  'use strict';

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
    setupBackButtons();
    setupSearch();
    setupWizard();
    setupForm();
    setupGenerate();
    setupGroups();
    setupClearData();
    setupModal();
    setupLogout();
    renderRoster();
    updateStats();

    if (user) {
      populateUserInfo(user);
      listenLiveSessions(user);
      setupAvatarUpload(user);
      setupNotifications(user);
      setupFriendsCard();
      setupAccountSettings();
    }
  }

  /* ---------- LIVE SESSIONS LISTENER ---------- */
  var liveSessionUnsub = null;

  function listenLiveSessions(user) {
    if (typeof db === 'undefined' || !db || !user) return;

    var grid = document.getElementById('liveSessionsGrid');
    var wrap = document.getElementById('liveSessions');
    if (!grid || !wrap) return;

    if (liveSessionUnsub) liveSessionUnsub();

    liveSessionUnsub = db.collection('sessions')
      .where('status', '==', 'live')
      .orderBy('createdAt', 'desc')
      .onSnapshot(function (snapshot) {
        var sessions = [];
        snapshot.forEach(function (doc) {
          var d = doc.data();
          var isCreator = d.creatorId === user.uid;
          var isInvited = Array.isArray(d.invitedUids) && d.invitedUids.indexOf(user.uid) !== -1;
          if (isCreator || isInvited) {
            sessions.push({ id: doc.id, data: d, isCreator: isCreator });
          }
        });

        if (sessions.length === 0) {
          wrap.style.display = 'none';
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
        console.error('Live sessions listener error:', err);
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
        '<span class="live-card__label">LIVE</span>' +
        (isCreator
          ? '<button class="live-card__close-btn" data-session-id="' + id + '" title="End session">End</button>'
          : '') +
      '</div>' +
      '<h3 class="live-card__venue">' + escapeHtml(data.venue || 'Session') + '</h3>' +
      '<p class="live-card__meta">' + meta + '</p>' +
      '<p class="live-card__info">' + teamCount + ' teams &middot; ' + playerCount + ' players</p>' +
      '<p class="live-card__creator">by ' + escapeHtml(data.creatorName || 'Unknown') + '</p>' +
    '</div>';
  }

  /* ---------- SESSION DETAIL OVERLAY ---------- */
  function showSessionDetail(id, data, isCreator) {
    var overlay = document.getElementById('sessionDetailOverlay');
    var titleEl = document.getElementById('sessionDetailTitle');
    var bodyEl = document.getElementById('sessionDetailBody');
    var closeX = document.getElementById('sessionDetailClose');
    if (!overlay || !bodyEl) return;

    if (titleEl) titleEl.textContent = data.venue || 'Session';

    var teamNames = ['Team A', 'Team B', 'Team C', 'Team D', 'Team E', 'Team F', 'Team G', 'Team H'];

    var html = '';
    var metaParts = [];
    if (data.date) metaParts.push(data.date);
    if (data.time) metaParts.push(data.time);
    html += '<p class="session-detail__meta">' + metaParts.join(' &middot; ') + '</p>';
    html += '<p class="session-detail__creator">Created by ' + escapeHtml(data.creatorName || 'Unknown') + '</p>';

    if (Array.isArray(data.teams)) {
      html += '<div class="session-detail__teams">';
      data.teams.forEach(function (team, idx) {
        html += '<div class="session-detail__team">';
        html += '<h4 class="session-detail__team-name">' + escapeHtml(team.name || teamNames[idx] || 'Team') + '</h4>';
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
              '<span class="session-detail__player-pos">' + (p.position || 'HYB') + '</span>' +
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

    if (titleEl) titleEl.textContent = 'Select MVP';

    var allPlayers = [];
    if (Array.isArray(data.players)) {
      data.players.forEach(function (p) {
        allPlayers.push({ name: p.name, uid: p.uid || null });
      });
    }

    var html = '';
    html += '<p class="mvp-picker__prompt">Who was the MVP this session?</p>';
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
      showToast(playerName + ' is the MVP!', 'success');

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
      showToast('Error closing session', 'info');
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
    els.createGroupBtn = document.getElementById('createGroupBtn');
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
      localStorage.setItem(GAMES_KEY, String(gamesGenerated));
      localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
    } catch (e) { /* silently fail */ }
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
    profileMetas.forEach(function (el) { el.textContent = 'Member since ' + joinYear; });

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

        var statMvps = document.getElementById('statMvps');
        var statSessions2 = document.getElementById('statSessions2');
        var statFriends = document.getElementById('statFriends');

        if (statMvps) statMvps.textContent = mvps;
        if (statSessions2) statSessions2.textContent = sessions;
        if (statFriends) statFriends.textContent = friendCount;

        /* Update avatars everywhere if photoURL exists */
        if (data.photoURL) {
          applyAvatarPhoto(data.photoURL, initial);
        }
      });
    }
  }

  /* ---------- SESSION HISTORY ---------- */
  function loadSessionHistory(uid, containerId) {
    if (typeof db === 'undefined' || !db) return;

    var container = document.getElementById(containerId);
    if (!container) return;

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
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'info');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        showToast('Image must be under 5 MB', 'info');
        return;
      }

      showToast('Uploading...', 'info');
      compressAndUpload(file, user);
      input.value = '';
    });
  }

  function compressAndUpload(file, user) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        var maxSize = 256;
        var w = img.width;
        var h = img.height;

        if (w > h) {
          if (w > maxSize) { h = h * (maxSize / w); w = maxSize; }
        } else {
          if (h > maxSize) { w = w * (maxSize / h); h = maxSize; }
        }

        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(function (blob) {
          if (!blob) { showToast('Failed to process image', 'info'); return; }
          uploadAvatar(blob, user);
        }, 'image/jpeg', 0.8);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function uploadAvatar(blob, user) {
    if (typeof storage === 'undefined' || !storage) {
      showToast('Storage not available', 'info');
      return;
    }

    var path = 'avatars/' + user.uid + '.jpg';
    var ref = storage.ref().child(path);

    ref.put(blob, { contentType: 'image/jpeg' })
      .then(function (snapshot) {
        return snapshot.ref.getDownloadURL();
      })
      .then(function (url) {
        return db.collection('users').doc(user.uid).update({
          photoURL: url
        });
      })
      .then(function () {
        showToast('Profile photo updated!', 'success');
      })
      .catch(function (err) {
        console.error('Avatar upload error:', err);
        showToast('Upload failed', 'info');
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

    notifUnsub = db.collection('users').doc(uid).collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .onSnapshot(function (snapshot) {
        var notifs = [];
        snapshot.forEach(function (doc) {
          notifs.push({ id: doc.id, data: doc.data() });
        });
        renderNotifications(notifs);
      });
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
      list.innerHTML = '<p class="notif-dropdown__empty">No notifications</p>';
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
      html += '<p class="notif-item__msg">' + escapeHtml(d.message || '') + '</p>';

      if (d.type === 'friend_request' && !d.acted) {
        html += '<div class="notif-item__actions">' +
          '<button class="notif-item__btn notif-item__btn--accept" data-notif-id="' + n.id + '" data-from-uid="' + d.fromUid + '">Accept</button>' +
          '<button class="notif-item__btn notif-item__btn--decline" data-notif-id="' + n.id + '">Decline</button>' +
        '</div>';
      }

      if (d.acted) {
        html += '<p class="notif-item__status">' + (d.actedResult || '') + '</p>';
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
        message: (myData.displayName || 'Someone') + ' wants to be your friend',
        read: false,
        acted: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).then(function () {
      showToast('Friend request sent to ' + toName, 'success');
    }).catch(function (err) {
      console.error('Friend request error:', err);
      showToast('Could not send request', 'info');
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
      showToast('Friend added!', 'success');

      return db.collection('users').doc(currentUser.uid).get();
    }).then(function (doc) {
      var myData = doc.data() || {};
      return theirRef.collection('notifications').add({
        type: 'friend_accepted',
        fromUid: currentUser.uid,
        fromName: myData.displayName || 'Player',
        fromUsername: myData.username || '',
        fromPhoto: myData.photoURL || null,
        message: (myData.displayName || 'Someone') + ' accepted your friend request',
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
      showToast('Friend removed', 'success');
      if (callback) callback();
    }).catch(function (err) {
      console.error('Unfriend error:', err);
      showToast('Could not remove friend', 'info');
    });
  }

  /* ---------- USER PROFILE (full-page view) ---------- */
  var userProfileHistory = [];

  function openUserProfile(uid) {
    if (typeof db === 'undefined' || !db) return;

    var contentEl = document.getElementById('uviewContent');
    var backBtn = document.getElementById('uviewBack');
    if (!contentEl) return;

    contentEl.innerHTML = '<p class="uview__loading">Loading...</p>';

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
        contentEl.innerHTML = '<p class="uview__loading">User not found</p>';
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
      contentEl.innerHTML = '<p class="uview__loading">Error loading profile</p>';
    });
  }

  function renderUserProfile(uid, data, isMe, myFriends, container) {
    var displayName = data.displayName || 'Player';
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
        html += '<button class="uview__follow-btn uview__follow-btn--following" data-uid="' + uid + '" data-name="' + escapeHtml(displayName) + '">Friends</button>';
      } else {
        html += '<button class="uview__follow-btn" data-uid="' + uid + '" data-name="' + escapeHtml(displayName) + '">Add Friend</button>';
      }
    }
    html += '</div>';
    html += '</div>';

    html += '<div class="profile__grid profile__grid--three uview__stats-grid">';
    html += '<div class="card card--stat"><svg class="card--stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg><span class="card--stat__val">' + sessions + '</span><span class="card--stat__label">Sessions</span></div>';
    html += '<div class="card card--stat uview__friends-stat" data-uid="' + uid + '" data-name="' + escapeHtml(displayName) + '"><svg class="card--stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span class="card--stat__val">' + friendCount + '</span><span class="card--stat__label">Friends</span></div>';
    html += '<div class="card card--stat"><svg class="card--stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><span class="card--stat__val">' + mvps + '</span><span class="card--stat__label">MVPs</span></div>';
    html += '</div>';

    html += '<div class="card"><h2 class="card__title">Session History</h2><div id="uviewSessionHistory"><p class="uview__loading">Loading...</p></div></div>';

    container.innerHTML = html;

    var followBtn = container.querySelector('.uview__follow-btn');
    if (followBtn) {
      followBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var targetUid = followBtn.getAttribute('data-uid');
        var targetName = followBtn.getAttribute('data-name');
        var isFollowing = followBtn.classList.contains('uview__follow-btn--following');

        if (isFollowing) {
          if (confirm('Remove ' + targetName + ' from your friends?')) {
            removeFriend(targetUid, function () {
              followBtn.classList.remove('uview__follow-btn--following');
              followBtn.textContent = 'Add Friend';
            });
          }
        } else if (followBtn.classList.contains('uview__follow-btn--sent')) {
          return;
        } else {
          sendFriendRequest(targetUid, targetName);
          followBtn.textContent = 'Requested';
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
    html += '<h2 class="flist__title">' + escapeHtml(ownerName) + '\'s Friends</h2>';

    if (!friendUids || friendUids.length === 0) {
      html += '<div class="flist__empty">No friends yet</div>';
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
            ? '<span class="flist__remove" data-uid="' + doc.id + '" data-name="' + escapeHtml(f.displayName || 'Unknown') + '">Remove</span>'
            : '';

          rows.push(
            '<div class="flist__row" data-uid="' + doc.id + '">' +
              '<div class="flist__row-left">' +
                '<span class="flist__avatar' + (f.photoURL ? ' has-photo' : '') + '">' + photoHtml + '</span>' +
                '<span class="flist__info">' +
                  '<span class="flist__name">' + escapeHtml(f.displayName || 'Unknown') + '</span>' +
                  '<span class="flist__uname">@' + escapeHtml(f.username || '') + '</span>' +
                '</span>' +
              '</div>' +
              removeHtml +
            '</div>'
          );
        }

        if (loaded === friendUids.length) {
          listEl.innerHTML = rows.join('') || '<div class="flist__empty">No friends yet</div>';

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
              if (confirm('Remove ' + targetName + ' from your friends?')) {
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
          message: 'Session' + (venue ? ' at ' + venue : '') + ' ended. MVP: ' + (mvpName || 'N/A'),
          read: false,
          acted: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function () {});
      });
    }).catch(function () {});
  }

  /* ---------- LOGOUT ---------- */
  function setupLogout() {
    var logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;

    logoutBtn.addEventListener('click', function () {
      if (typeof auth !== 'undefined' && auth.signOut) {
        auth.signOut().then(function () {
          window.location.href = 'auth.html';
        });
      }
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
          showToast(on ? 'Notifications on' : 'Notifications off', 'success');
        }).catch(function (err) {
          console.error('Failed to update notification preference:', err);
          notifsToggle.checked = !on;
        });
      });
    }

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
          showToast(on ? 'Email notifications on' : 'Email notifications off', 'success');
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
        showToast(on ? 'Auto-save on' : 'Auto-save off — roster cleared on new session', 'success');
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var newName = nameInput ? nameInput.value.trim() : '';
        if (!newName || newName.length < 2) {
          showToast('Name must be at least 2 characters', 'info');
          return;
        }
        if (!currentUser) return;

        currentUser.updateProfile({ displayName: newName }).then(function () {
          return db.collection('users').doc(currentUser.uid).update({
            displayName: newName,
            displayNameLower: newName.toLowerCase()
          });
        }).then(function () {
          showToast('Name updated!', 'success');
          var topbarName = document.querySelector('.topbar__name');
          var profileNames = document.querySelectorAll('.profile__name');
          if (topbarName) topbarName.textContent = newName;
          profileNames.forEach(function (el) { el.textContent = newName; });
        }).catch(function (err) {
          console.error('Failed to update name:', err);
          showToast('Could not update name', 'info');
        });
      });
    }

    /* Email: show current + change */
    var currentEmailDisplay = document.getElementById('currentEmailDisplay');
    var editEmailInput = document.getElementById('editEmail');
    var saveEmailBtn = document.getElementById('saveEmail');
    var emailNote = document.getElementById('emailNote');

    if (currentEmailDisplay && currentUser) {
      currentEmailDisplay.textContent = currentUser.email || 'No email set';
    }

    if (saveEmailBtn && editEmailInput) {
      saveEmailBtn.addEventListener('click', function () {
        var newEmail = editEmailInput.value.trim();
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

        if (!newEmail) {
          setEmailNote('Enter a new email address.', 'error');
          return;
        }
        if (!emailRegex.test(newEmail)) {
          setEmailNote('Please enter a valid email address.', 'error');
          return;
        }
        if (newEmail === currentUser.email) {
          setEmailNote('That\'s already your current email.', 'error');
          return;
        }

        setEmailNote('', '');

        showModal({
          title: 'Confirm Password',
          message: 'Re-enter your password to change your email.',
          inputMode: true,
          inputType: 'password',
          placeholder: 'Your current password',
          confirmText: 'Confirm',
          onConfirm: function (password) {
            if (!password) {
              setEmailNote('Password is required.', 'error');
              return;
            }

            var credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, password);

            currentUser.reauthenticateWithCredential(credential)
              .then(function () {
                return currentUser.updateEmail(newEmail);
              })
              .then(function () {
                return db.collection('users').doc(currentUser.uid).update({ email: newEmail });
              })
              .then(function () {
                if (currentEmailDisplay) currentEmailDisplay.textContent = newEmail;
                editEmailInput.value = '';
                setEmailNote('Email updated!', 'success');
                showToast('Email changed to ' + newEmail, 'success');
              })
              .catch(function (err) {
                if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                  setEmailNote('Incorrect password.', 'error');
                } else if (err.code === 'auth/email-already-in-use') {
                  setEmailNote('That email is already in use.', 'error');
                } else if (err.code === 'auth/invalid-email') {
                  setEmailNote('Invalid email format.', 'error');
                } else if (err.code === 'auth/requires-recent-login') {
                  setEmailNote('Please log out and log back in, then try again.', 'error');
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
          showToast('No email found', 'info');
          return;
        }
        auth.sendPasswordResetEmail(currentUser.email).then(function () {
          showToast('Reset email sent to ' + currentUser.email, 'success');
        }).catch(function (err) {
          console.error('Password reset error:', err);
          showToast('Could not send reset email', 'info');
        });
      });
    }
  }

  /* ---------- VIEW SWITCHING ---------- */
  var viewTitles = {
    dashboard: 'Dashboard',
    session: 'Create Session',
    stats: 'My Stats',
    groups: 'Groups',
    search: 'Search',
    profile: 'Profile',
    settings: 'Settings',
    user: 'Player'
  };

  function switchView(viewName, opts) {
    opts = opts || {};

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
    var sidebarTarget = (viewName === 'session' || viewName === 'stats' || viewName === 'groups' || viewName === 'search') ? 'dashboard' : (viewName === 'user' ? '' : viewName);

    sidebarLinks.forEach(function (link) {
      link.classList.toggle('sidebar__link--active', link.getAttribute('data-view') === sidebarTarget);
    });

    tabbarBtns.forEach(function (btn) {
      btn.classList.toggle('tabbar__btn--active', btn.getAttribute('data-view') === sidebarTarget);
    });

    /* Update page title */
    if (els.pageTitle) els.pageTitle.textContent = viewTitles[viewName] || 'Dashboard';

    /* Update stats when viewing stats or profile */
    if (viewName === 'stats' || viewName === 'profile') updateStats();

    if (viewName === 'profile' && currentUser) {
      loadSessionHistory(currentUser.uid, 'sessionHistory');
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
      goToWizardStep(1);
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
  }

  /* ---------- HUB PANELS (dashboard → sub-views) ---------- */
  function setupHubPanels() {
    var panels = document.querySelectorAll('.hub__panel[data-subview]');
    panels.forEach(function (panel) {
      panel.addEventListener('click', function () {
        switchView(panel.getAttribute('data-subview'));
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
      els.searchResults.innerHTML = '<p class="search-results__hint">Search for players, groups, or @username to find people.</p>';
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
                '<span class="search-results__type">Skill ' + p.rating + '</span>' +
              '</div>' +
            '</div>' +
            '<span class="search-results__type">player</span>' +
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
                '<span class="search-results__type">' + g.players.length + ' players</span>' +
              '</div>' +
            '</div>' +
            '<span class="search-results__type">group</span>' +
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
          els.searchResults.innerHTML = localHtml || '<p class="search-results__hint">No results found for "' + escapeHtml(query) + '".</p>';
        });
    } else {
      els.searchResults.innerHTML = localHtml || '<p class="search-results__hint">No results found for "' + escapeHtml(query) + '".</p>';
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
              '<span class="search-results__name search-results__name--user">' + escapeHtml(u.displayName || 'Unknown') + '</span><br>' +
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
      els.searchResults.innerHTML = '<p class="search-results__hint">No results found for "' + escapeHtml(query) + '".</p>';
      return;
    }

    els.searchResults.innerHTML = combined;

    els.searchResults.querySelectorAll('.search-results__add-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var uid = btn.getAttribute('data-uid');
        var name = btn.getAttribute('data-name');
        sendFriendRequest(uid, name);
        btn.textContent = 'Sent';
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
      var resultsPanel = document.getElementById('wizardResults');
      if (resultsPanel) resultsPanel.style.display = 'none';
      var stepsEl = document.querySelector('.wizard__steps');
      if (stepsEl) stepsEl.style.display = '';
      goToWizardStep(3);
    });

    /* Confirm & Go Live */
    var confirmBtn = document.getElementById('resultsConfirm');
    if (confirmBtn) confirmBtn.addEventListener('click', function () {
      if (!pendingSession) return;
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = 'Going Live\u2026';

      saveSessionToFirestore(pendingSession.teams, pendingSession.nTeams, pendingSession.ppt);

      confirmBtn.innerHTML = '\u2713 Session is Live';
      confirmBtn.classList.add('btn--confirmed');
      pendingSession = null;
      showToast('Session is now live!', 'success');
    });

    /* New session from results */
    var newSession = document.getElementById('resultsNewSession');
    if (newSession) newSession.addEventListener('click', function () {
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
    els.teamSummary.textContent = nTeams + ' team' + (nTeams > 1 ? 's' : '') + ' \u00D7 ' + ppt + ' player' + (ppt > 1 ? 's' : '') + ' = ' + total + ' players needed';
    updatePlayerProgress();
  }

  function getTotalNeeded() {
    if (!els.numTeams || !els.playersPerTeam) return 10;
    return parseInt(els.numTeams.value, 10) * parseInt(els.playersPerTeam.value, 10);
  }

  function updatePlayerProgress() {
    if (!els.playerProgress) return;
    els.playerProgress.textContent = players.length + ' / ' + getTotalNeeded();
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
      var name = rawName.charAt(0) === '@' && !selectedPlayerUid ? rawName.substring(1) : rawName;
      if (selectedPlayerUid) name = rawName;
      var rating = parseInt(els.playerRating.value, 10);

      if (!name) return;

      var wasEdit = (editingId !== null);

      if (editingId !== null) {
        var player = players.find(function (p) { return p.id === editingId; });
        if (player) {
          player.name = name;
          player.rating = rating;
          player.position = selectedPosition;
          player.uid = selectedPlayerUid || null;
        }
        editingId = null;
        els.addForm.querySelector('.add-form__submit').innerHTML = 'Add Player <span class="btn__arrow">+</span>';
      } else {
        players.push({
          id: Date.now() + Math.random(),
          name: name,
          rating: rating,
          position: selectedPosition,
          uid: selectedPlayerUid || null,
          photoURL: selectedPlayerPhoto || null
        });
      }

      selectedPlayerUid = null;
      selectedPlayerPhoto = null;
      saveData();
      renderRoster();
      showToast(wasEdit ? name + ' updated' : name + ' added', 'success');
      els.addForm.reset();
      els.ratingVal.textContent = '5';
      els.playerName.classList.remove('add-form__input--linked');
      if (mentionDropdown) mentionDropdown.innerHTML = '';
      els.playerName.focus();
    });
  }

  /* ---------- @MENTION: SEARCH USERS IN FIRESTORE ---------- */
  function searchUsers(query, dropdown) {
    if (typeof db === 'undefined' || !db || !dropdown) return;

    db.collection('users')
      .orderBy('username')
      .startAt(query.toLowerCase())
      .endAt(query.toLowerCase() + '\uf8ff')
      .limit(6)
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          dropdown.innerHTML = '<div class="mention-dropdown__empty">No accounts found</div>';
          return;
        }

        var html = '';
        snapshot.forEach(function (doc) {
          var u = doc.data();
          if (doc.id === currentUser.uid) return;
          var initial = (u.displayName || '?').charAt(0).toUpperCase();
          var avatarContent = u.photoURL
            ? '<img src="' + u.photoURL + '" alt="" class="mention-dropdown__avatar-img">'
            : initial;
          html += '<button type="button" class="mention-dropdown__item" data-uid="' + doc.id + '" data-name="' + escapeHtml(u.displayName || '') + '" data-photo="' + escapeHtml(u.photoURL || '') + '">' +
            '<span class="mention-dropdown__avatar">' + avatarContent + '</span>' +
            '<span class="mention-dropdown__info">' +
              '<span class="mention-dropdown__name">' + escapeHtml(u.displayName || 'Unknown') + '</span>' +
              '<span class="mention-dropdown__username">@' + escapeHtml(u.username || '') + '</span>' +
            '</span>' +
          '</button>';
        });

        if (!html) {
          dropdown.innerHTML = '<div class="mention-dropdown__empty">No accounts found</div>';
          return;
        }

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
      }).catch(function (err) {
        console.error('@mention search error:', err);
        dropdown.innerHTML = '';
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
      if (els.playerCount) els.playerCount.textContent = '0 players';
      updatePlayerProgress();
      return;
    }

    if (els.rosterEmpty) els.rosterEmpty.style.display = 'none';
    if (els.generateBtn) els.generateBtn.disabled = players.length < total;
    if (els.playerCount) els.playerCount.textContent = players.length + (players.length === 1 ? ' player' : ' players');
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

    els.addForm.querySelector('.add-form__submit').innerHTML = 'Update Player <span class="btn__arrow">\u2713</span>';
    els.playerName.focus();
  }

  function deletePlayer(id) {
    var player = players.find(function (p) { return p.id === id; });
    var pName = player ? player.name : 'Player';
    players = players.filter(function (p) { return p.id !== id; });
    saveData();
    renderRoster();
    showToast(pName + ' removed', 'info');
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

  /* ---- Internal scoring ----
     UI level 1–10 maps linearly to -1 … +5 for sharper differentiation.
     Position weights reflect team value: HYB > DEF > ATK. GK neutral (placed separately).
     effectiveScore = internalSkill + positionWeight
     Teams are balanced on effectiveScore; UI still shows 1–10. */

  var POS_WEIGHT = { HYB: 0.5, DEF: 0.3, ATK: 0, GK: 0 };

  function toInternal(uiRating) {
    /* 1 → -1, 10 → +5  ⇒  internal = (uiRating - 1) * (6/9) - 1 */
    return (uiRating - 1) * (6 / 9) - 1;
  }

  function effectiveScore(player) {
    return toInternal(player.rating) + (POS_WEIGHT[player.position] || 0);
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
      if (els.generateLoading) els.generateLoading.style.display = 'none';
      if (els.generateBtn) els.generateBtn.disabled = false;

      var pool = players.slice();

      /* Initialize empty teams */
      var teams = [];
      for (var t = 0; t < nTeams; t++) {
        teams.push({ players: [], effTotal: 0, uiTotal: 0 });
      }

      /* --- Phase 1: Distribute goalkeepers evenly --- */
      var goalkeepers = pool.filter(function (p) { return p.position === 'GK'; });
      var others = pool.filter(function (p) { return p.position !== 'GK'; });

      goalkeepers.sort(function (a, b) { return effectiveScore(b) - effectiveScore(a); });

      goalkeepers.forEach(function (gk) {
        var bestTeam = null;
        var bestGkCount = Infinity;
        var bestEff = Infinity;

        for (var i = 0; i < teams.length; i++) {
          if (teams[i].players.length >= ppt) continue;
          var gkCount = teams[i].players.filter(function (p) { return p.position === 'GK'; }).length;
          if (gkCount < bestGkCount || (gkCount === bestGkCount && teams[i].effTotal < bestEff)) {
            bestTeam = i;
            bestGkCount = gkCount;
            bestEff = teams[i].effTotal;
          }
        }

        if (bestTeam !== null) {
          teams[bestTeam].players.push(gk);
          teams[bestTeam].effTotal += effectiveScore(gk);
          teams[bestTeam].uiTotal += gk.rating;
        }
      });

      /* --- Phase 2: Balanced draft for remaining players --- */
      others.sort(function (a, b) { return effectiveScore(b) - effectiveScore(a); });

      others.forEach(function (player) {
        var bestTeam = null;
        var bestCount = Infinity;
        var bestEff = Infinity;

        for (var i = 0; i < teams.length; i++) {
          if (teams[i].players.length >= ppt) continue;
          var count = teams[i].players.length;
          if (count < bestCount || (count === bestCount && teams[i].effTotal < bestEff)) {
            bestTeam = i;
            bestCount = count;
            bestEff = teams[i].effTotal;
          }
        }

        if (bestTeam !== null) {
          teams[bestTeam].players.push(player);
          teams[bestTeam].effTotal += effectiveScore(player);
          teams[bestTeam].uiTotal += player.rating;
        }
      });

      /* --- Phase 3: Render --- */
      renderResults(teams);

      /* Track games */
      gamesGenerated++;
      saveData();

      /* Store pending — don't go live until user confirms */
      pendingSession = { teams: teams, nTeams: nTeams, ppt: ppt };
      var confirmBtn = document.getElementById('resultsConfirm');
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Confirm & Go Live <span class="btn__arrow">\u2192</span>';
        confirmBtn.classList.remove('btn--confirmed');
      }

      showToast('Teams balanced! Review and confirm to go live.', 'success');
    }, 700);
  }

  /* ---------- SAVE SESSION TO FIRESTORE ---------- */
  function saveSessionToFirestore(teams, nTeams, ppt) {
    if (typeof db === 'undefined' || !db || !currentUser) return;

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
        title: 'New Group',
        inputMode: true,
        placeholder: 'e.g. Tuesday Night Crew',
        confirmText: 'Create',
        onConfirm: function (val) {
          if (!val || !val.trim()) return;
          groups.push({
            id: Date.now() + Math.random(),
            name: val.trim(),
            players: []
          });
          saveData();
          renderGroups();
          showToast(val.trim() + ' created', 'success');
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
            '<span class="group-item__count">' + group.players.length + ' players</span>' +
          '</div>' +
        '</div>' +
        '<div class="roster__actions">' +
          '<button class="roster__btn roster__btn--delete" data-group-id="' + group.id + '" title="Delete">×</button>' +
        '</div>';

      els.groupsList.appendChild(item);
    });

    /* Delete handlers */
    els.groupsList.querySelectorAll('.roster__btn--delete[data-group-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseFloat(btn.getAttribute('data-group-id'));
        var group = groups.find(function (g) { return g.id === id; });
        var gName = group ? group.name : 'Group';
        groups = groups.filter(function (g) { return g.id !== id; });
        saveData();
        renderGroups();
        showToast(gName + ' removed', 'info');
      });
    });
  }

  /* ---------- CLEAR DATA ---------- */
  function setupClearData() {
    if (!els.clearDataBtn) return;
    els.clearDataBtn.addEventListener('click', function () {
      showModal({
        title: 'Clear All Data',
        message: 'This will remove all saved players, groups, and history. This cannot be undone.',
        danger: true,
        confirmText: 'Clear Everything',
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
          showToast('All data cleared', 'danger');
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
      confirmBtn.textContent = opts.confirmText || 'Confirm';
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
