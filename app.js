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
  var currentWizardStep = 1;
  var modalCallback = null;

  var STORAGE_KEY = 'niterun_players';
  var GAMES_KEY = 'niterun_games';
  var GROUPS_KEY = 'niterun_groups';

  /* ---------- DOM REFS ---------- */
  var els = {};

  document.addEventListener('DOMContentLoaded', function () {
    cacheElements();
    loadData();
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
    renderRoster();
    updateStats();
  });

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
    els.statPlayers2 = document.getElementById('statPlayers2');
    els.statGames2 = document.getElementById('statGames2');
    els.clearDataBtn = document.getElementById('clearDataBtn');
    els.searchToggle = document.getElementById('searchToggle');
    els.searchInput = document.getElementById('searchInput');
    els.searchClose = document.getElementById('searchClose');
    els.searchResults = document.getElementById('searchResults');
    els.groupsList = document.getElementById('groupsList');
    els.groupsEmpty = document.getElementById('groupsEmpty');
    els.createGroupBtn = document.getElementById('createGroupBtn');
    els.generateLoading = document.getElementById('generateLoading');
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

  /* ---------- VIEW SWITCHING ---------- */
  var viewTitles = {
    dashboard: 'Dashboard',
    session: 'Create Session',
    stats: 'My Stats',
    groups: 'Groups',
    search: 'Search',
    profile: 'Profile',
    settings: 'Settings'
  };

  function switchView(viewName, opts) {
    opts = opts || {};

    /* Save previous view for back navigation (never save 'search' so
       the close-search button always returns to a real content view) */
    if (!opts.skipHistory) {
      var currentView = document.querySelector('.view--active');
      if (currentView) {
        var currentName = currentView.id.replace('view-', '');
        if (currentName !== 'search') {
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
    var sidebarTarget = (viewName === 'session' || viewName === 'stats' || viewName === 'groups' || viewName === 'search') ? 'dashboard' : viewName;

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
      els.searchResults.innerHTML = '<p class="search-results__hint">Start typing to search for players and groups.</p>';
      return;
    }

    var results = [];

    /* Search players */
    players.forEach(function (p) {
      if (p.name.toLowerCase().indexOf(query) !== -1) {
        results.push({ type: 'player', name: p.name, detail: 'Skill ' + p.rating });
      }
    });

    /* Search groups */
    groups.forEach(function (g) {
      if (g.name.toLowerCase().indexOf(query) !== -1) {
        results.push({ type: 'group', name: g.name, detail: g.players.length + ' players' });
      }
    });

    if (results.length === 0) {
      els.searchResults.innerHTML = '<p class="search-results__hint">No results found for "' + escapeHtml(query) + '".</p>';
      return;
    }

    var html = '';
    results.forEach(function (r) {
      var initial = r.name.charAt(0).toUpperCase();
      html +=
        '<div class="search-results__item">' +
          '<div class="search-results__info">' +
            '<div class="search-results__badge">' + initial + '</div>' +
            '<div>' +
              '<span class="search-results__name">' + escapeHtml(r.name) + '</span><br>' +
              '<span class="search-results__type">' + r.detail + '</span>' +
            '</div>' +
          '</div>' +
          '<span class="search-results__type">' + r.type + '</span>' +
        '</div>';
    });

    els.searchResults.innerHTML = html;
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

    /* Results ← back to edit */
    var resultsBack = document.getElementById('resultsBack');
    if (resultsBack) resultsBack.addEventListener('click', function () {
      var resultsPanel = document.getElementById('wizardResults');
      if (resultsPanel) resultsPanel.style.display = 'none';
      var stepsEl = document.querySelector('.wizard__steps');
      if (stepsEl) stepsEl.style.display = '';
      goToWizardStep(3);
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

    /* Live rating display */
    els.playerRating.addEventListener('input', function () {
      els.ratingVal.textContent = els.playerRating.value;
    });

    els.addForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var name = els.playerName.value.trim();
      var rating = parseInt(els.playerRating.value, 10);

      if (!name) return;

      var wasEdit = (editingId !== null);

      if (editingId !== null) {
        /* Update existing player */
        var player = players.find(function (p) { return p.id === editingId; });
        if (player) {
          player.name = name;
          player.rating = rating;
          player.position = selectedPosition;
        }
        editingId = null;
        els.addForm.querySelector('.add-form__submit').innerHTML = 'Add Player <span class="btn__arrow">+</span>';
      } else {
        /* Add new player */
        players.push({
          id: Date.now() + Math.random(),
          name: name,
          rating: rating,
          position: selectedPosition
        });
      }

      saveData();
      renderRoster();
      showToast(wasEdit ? name + ' updated' : name + ' added', 'success');
      els.addForm.reset();
      els.ratingVal.textContent = '5';
      els.playerName.focus();
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

      item.innerHTML =
        '<div class="roster__player">' +
          '<div class="roster__badge">' + initial + '</div>' +
          '<div>' +
            '<span class="roster__name">' + escapeHtml(player.name) + '</span>' +
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
      showToast('Teams balanced!', 'success');
    }, 700);
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
    if (els.statPlayers2) els.statPlayers2.textContent = players.length;
    if (els.statGames2) els.statGames2.textContent = gamesGenerated;
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
