/**
 * Daily Feed — Patch-Based Micro-Learning & Combined Quiz Application
 */

(function () {
  'use strict';

  // Configuration & Metadata State
  let appConfig = {
    app_name: 'Daily Feed',
    default_card_language: 'both',
    delete_password: '123',
    srs_intervals_days: [1, 2, 3, 7, 14, 30],
    max_reviews_per_day: 50,
    github: { owner: 'Matrix-abdelatty', repo: 'daily_feed', branch: 'main' }
  };

  let topics = [];
  let indexData = { files: [], batches_per_day_target: 3, batch_size_target: 5 };
  let numbersMap = {};
  let repoDeletedIds = new Set();
  let buildReport = { skipped_details: [] };

  // Loaded Patches & Cards
  let patchesList = []; // Array of patch objects: { patch_number, batch_id, date, created_at, source, cards: [...] }
  let loadedCardsMap = new Map(); // card.id -> card
  let isLoading = false;

  // UI View State
  let currentLang = 'en'; // 'en' | 'ar' (Single language only, never dual translated!)
  let activeTab = 'new'; // 'new' | 'seen' | 'saved'
  let activeTopic = null;
  let currentSearch = '';
  let activePatchIdx = 0; // Current displayed patch in 'new' tab (0 is latest)
  let expandedPatches = new Set(); // Patch batch_ids explicitly expanded in 'seen' tab

  // Local User Progress Storage
  const STORAGE_KEY = 'daily_feed_progress_v2';
  const LEGACY_KEY = 'daily_feed_progress_v1';
  let userProgress = {
    theme: 'ivory',       // 'ivory' | 'midnight' | 'paper' | 'sepia' | 'forest'
    saves: {},            // cardId -> timestamp (Bookmark / Save 🔖)
    finished_patches: {}, // batchId -> { finished_at, score, total }
    srs: {},              // cardId -> { stage: 0..6, due: 'YYYY-MM-DD', updated_at: '...' }
    mistakes: {},         // cardId -> timestamp
    hidden: {},           // cardId -> timestamp (locally deleted)
    local_patches: [],    // Array of user-uploaded JSON patch objects
    owner_token: '',
    delete_password: '123',
    lang_display: 'en'
  };

  // Date Helpers
  function getTodayStr() {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  // Load & Migrate User Progress
  function loadUserProgress() {
    try {
      const rawV2 = localStorage.getItem(STORAGE_KEY);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        userProgress = Object.assign(userProgress, parsed);
        userProgress.saves = userProgress.saves || {};
        userProgress.theme = userProgress.theme || 'ivory';
        if (userProgress.lang_display === 'both') userProgress.lang_display = 'en';
      } else {
        // Migrate from v1 if present
        const rawV1 = localStorage.getItem(LEGACY_KEY);
        if (rawV1) {
          const v1 = JSON.parse(rawV1);
          userProgress.saves = Object.assign({}, v1.saves || {}, v1.likes || {});
          userProgress.srs = v1.srs || {};
          userProgress.mistakes = v1.mistakes || {};
          userProgress.hidden = v1.hidden || {};
          userProgress.owner_token = v1.owner_token || '';
          userProgress.delete_password = v1.delete_password || '123';
          if (Array.isArray(v1.local_cards) && v1.local_cards.length > 0) {
            userProgress.local_patches = [{
              batch_id: 'local_custom_01',
              date: getTodayStr(),
              created_at: new Date().toISOString(),
              source: 'manual',
              cards: v1.local_cards
            }];
          }
        }
      }
      if (userProgress.lang_display) {
        currentLang = userProgress.lang_display;
      }
    } catch (e) {
      console.error('Failed to load user progress:', e);
    }
  }

  function saveUserProgress() {
    try {
      userProgress.lang_display = currentLang;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userProgress));
      updateCountsAndStatusBar();
    } catch (e) {
      console.error('Failed to save user progress:', e);
    }
  }

  async function fetchJSON(url) {
    const resp = await fetch(url + '?_t=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.json();
  }

  function applyTheme(themeName) {
    const validThemes = ['ivory', 'midnight', 'paper', 'sepia', 'forest'];
    const theme = validThemes.includes(themeName) ? themeName : 'ivory';
    document.documentElement.setAttribute('data-theme', theme);
    userProgress.theme = theme;
    document.querySelectorAll('.theme-picker-btn').forEach(btn => {
      const btnTheme = btn.dataset.themeName || btn.dataset.theme;
      btn.classList.toggle('active', btnTheme === theme);
    });
  }

  function initThemeSelector() {
    document.querySelectorAll('.theme-picker-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const selectedTheme = btn.dataset.themeName || btn.dataset.theme;
        applyTheme(selectedTheme);
        saveUserProgress();
      });
    });
    applyTheme(userProgress.theme || 'ivory');
  }

  function populateCardSelector() {
    const picker = document.getElementById('cardSelectPicker');
    if (!picker) return;

    picker.innerHTML = '<option value="">🎯 Jump to Card...</option>';

    const allCards = Array.from(loadedCardsMap.values()).filter(c => !isCardHidden(c.id));
    allCards.sort((a, b) => (numbersMap[a.id] || 0) - (numbersMap[b.id] || 0));

    allCards.forEach(c => {
      const num = numbersMap[c.id] || '?';
      const isAr = currentLang === 'ar';
      const title = (isAr && c.ar?.title) ? c.ar.title : (c.en?.title || c.ar?.title || 'Untitled');
      const topic = (c.topic || 'General').toUpperCase();
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `#${num} · [${topic}] ${title}`;
      picker.appendChild(opt);
    });
  }

  function jumpToCard(cardId) {
    if (!cardId) return;
    const card = loadedCardsMap.get(cardId);
    if (!card) return;

    if (activeTopic && card.topic !== activeTopic) {
      activeTopic = null;
    }

    const batchId = card._patch_id;
    const patchIsDone = isPatchFinished(batchId);

    if (activeTab === 'saved' && !userProgress.saves[cardId]) {
      switchTab(patchIsDone ? 'seen' : 'new');
    }

    if (activeTab === 'seen' || patchIsDone) {
      if (activeTab !== 'seen') {
        switchTab('seen');
      }
      expandedPatches.add(batchId);
      renderFeed();
    } else {
      if (activeTab !== 'new') {
        switchTab('new');
      }
      const targetPatches = patchesList.filter(p => {
        const visible = p.cards.filter(c => !isCardHidden(c.id));
        return visible.length > 0 && !isPatchFinished(p.batch_id);
      });
      const foundIdx = targetPatches.findIndex(p => p.batch_id === batchId);
      if (foundIdx !== -1) {
        activePatchIdx = foundIdx;
      }
      renderFeed();
    }

    setTimeout(() => {
      const cardEl = document.getElementById(`card-${cardId}`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        cardEl.classList.remove('highlight-pulse');
        void cardEl.offsetWidth;
        cardEl.classList.add('highlight-pulse');
        setTimeout(() => {
          cardEl.classList.remove('highlight-pulse');
        }, 2200);
      }
    }, 150);
  }

  // Initialization
  async function init() {
    loadUserProgress();
    initThemeSelector();

    // Language toggle buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === currentLang);
      btn.addEventListener('click', () => {
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentLang = btn.dataset.lang;
        saveUserProgress();
        populateCardSelector();
        renderFeed();
      });
    });

    try {
      const [cfg, top, idx, nums, deleted, report] = await Promise.all([
        fetchJSON('config/app.config.json').catch(() => appConfig),
        fetchJSON('config/topics.json').catch(() => []),
        fetchJSON('data/index.json').catch(() => ({ files: [] })),
        fetchJSON('data/numbers.json').catch(() => ({})),
        fetchJSON('data/deleted.json').catch(() => []),
        fetchJSON('data/build_report.json').catch(() => ({ skipped_details: [] }))
      ]);

      appConfig = Object.assign(appConfig, cfg);
      topics = top;
      indexData = idx;
      numbersMap = nums;
      repoDeletedIds = new Set(deleted);
      buildReport = report;
    } catch (e) {
      console.error('Metadata load error:', e);
    }

    populateComposerTopics();
    setupEventListeners();
    await loadAllPatches();
    populateCardSelector();
    updateCountsAndStatusBar();
    renderFeed();
  }

  // Load all patch files listed in index.json + local patches
  async function loadAllPatches() {
    isLoading = true;
    const statusEl = document.getElementById('feedStatusText');
    if (statusEl) statusEl.textContent = 'Loading patches...';

    const files = indexData.files || [];
    const loadedRepoPatches = [];

    await Promise.all(files.map(async (fileMeta) => {
      try {
        const batchData = await fetchJSON(fileMeta.path);
        const cards = (batchData && Array.isArray(batchData.cards)) ? batchData.cards : [];
        cards.forEach(c => {
          c._patch_id = fileMeta.batch_id;
          c._patch_number = fileMeta.patch_number;
          loadedCardsMap.set(c.id, c);
        });
        loadedRepoPatches.push({
          patch_number: fileMeta.patch_number || 1,
          batch_id: fileMeta.batch_id || fileMeta.path,
          path: fileMeta.path,
          date: fileMeta.date || (fileMeta.created_at || '').slice(0, 10),
          created_at: fileMeta.created_at || batchData.created_at || '',
          source: fileMeta.source || batchData.source || 'auto',
          cards: cards
        });
      } catch (err) {
        console.warn('Failed to load patch:', fileMeta.path, err);
      }
    }));

    // Merge local uploaded patches (that aren't already in repo)
    const repoBatchIds = new Set(loadedRepoPatches.map(p => p.batch_id));
    let maxPatchNum = loadedRepoPatches.reduce((m, p) => Math.max(m, p.patch_number || 0), 0);
    let maxCardNum = Object.values(numbersMap).reduce((m, n) => Math.max(m, n || 0), 0);

    const localPatches = [];
    (userProgress.local_patches || []).forEach(lp => {
      if (repoBatchIds.has(lp.batch_id)) return;
      maxPatchNum += 1;
      const pNum = lp.patch_number || maxPatchNum;
      const cards = lp.cards || [];
      cards.forEach(c => {
        if (!numbersMap[c.id]) {
          maxCardNum += 1;
          numbersMap[c.id] = maxCardNum;
        }
        c._patch_id = lp.batch_id;
        c._patch_number = pNum;
        loadedCardsMap.set(c.id, c);
      });
      localPatches.push({
        patch_number: pNum,
        batch_id: lp.batch_id,
        path: 'local browser',
        date: lp.date || (lp.created_at || '').slice(0, 10) || getTodayStr(),
        created_at: lp.created_at || new Date().toISOString(),
        source: lp.source || 'manual-ui',
        cards: cards
      });
    });

    patchesList = [...localPatches, ...loadedRepoPatches];
    patchesList.sort((a, b) => (b.patch_number || 0) - (a.patch_number || 0));

    isLoading = false;
    if (statusEl) {
      statusEl.textContent = `${patchesList.length} Patches (${loadedCardsMap.size} Cards) Loaded`;
    }
  }

  function isCardHidden(cardId) {
    return repoDeletedIds.has(cardId) || !!userProgress.hidden[cardId];
  }

  function isPatchFinished(batchId) {
    return !!userProgress.finished_patches[batchId];
  }

  // Update Tab Counters & Top Patch Status Bar
  function updateCountsAndStatusBar() {
    const today = getTodayStr();

    let newPatchesCount = 0;
    let seenPatchesCount = 0;
    let savedCardsCount = 0;
    let dueSrsCount = 0;
    let todayPatchesCount = 0;
    let todayCardsCount = 0;

    patchesList.forEach(p => {
      const visibleCards = p.cards.filter(c => !isCardHidden(c.id));
      if (visibleCards.length === 0) return;

      if (isPatchFinished(p.batch_id)) {
        seenPatchesCount++;
      } else {
        newPatchesCount++;
      }

      if (p.date === today) {
        todayPatchesCount++;
        todayCardsCount += visibleCards.length;
      }
    });

    loadedCardsMap.forEach(c => {
      if (isCardHidden(c.id)) return;
      if (userProgress.saves[c.id]) {
        savedCardsCount++;
      }
    });

    // Count SRS due cards (cards from finished patches or saved cards)
    getReviewPoolCards().forEach(c => {
      const s = userProgress.srs[c.id];
      if (!s || (s.due && s.due <= today)) {
        dueSrsCount++;
      }
    });

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('countNew', newPatchesCount);
    setTxt('countSeen', seenPatchesCount);
    setTxt('countSaved', savedCardsCount);
    setTxt('srsDueCount', dueSrsCount);

    // Update Top Daily Patch Status Bar
    const dotEl = document.getElementById('todayStatusDot');
    const txtEl = document.getElementById('todayStatusText');
    const targetPatches = indexData.batches_per_day_target || 3;

    if (txtEl && dotEl) {
      const latestPatch = patchesList[0];
      const latestDate = latestPatch ? latestPatch.date : 'None';
      if (todayPatchesCount > 0) {
        dotEl.className = 'status-dot';
        txtEl.innerHTML = `<strong>Today (${today}):</strong> ${todayPatchesCount} Patch${todayPatchesCount > 1 ? 'es' : ''} Added (+${todayCardsCount} cards) · Total: ${patchesList.length} Patches`;
      } else {
        dotEl.className = 'status-dot pending';
        txtEl.innerHTML = `<strong>Today (${today}):</strong> 0/${targetPatches} Patches Added yet · Last added: ${latestDate} (${patchesList.length} Patches total)`;
      }
    }
  }

  // Get all cards eligible for Combined Review Quiz (from Finished Patches + Saved Cards)
  function getReviewPoolCards() {
    const poolMap = new Map();
    patchesList.forEach(p => {
      if (isPatchFinished(p.batch_id)) {
        p.cards.forEach(c => {
          if (!isCardHidden(c.id)) poolMap.set(c.id, c);
        });
      }
    });
    loadedCardsMap.forEach(c => {
      if (!isCardHidden(c.id) && userProgress.saves[c.id]) {
        poolMap.set(c.id, c);
      }
    });
    return Array.from(poolMap.values());
  }

  // Render Main Feed (Patches Mode or Filtered Cards Mode)
  function renderFeed() {
    const container = document.getElementById('cardsList');
    if (!container) return;
    container.innerHTML = '';

    // Topic button indicator
    const topicBtn = document.getElementById('btnTopicsPicker');
    const topicLabel = document.getElementById('activeTopicLabel');
    if (topicBtn && topicLabel) {
      if (activeTopic) {
        const tObj = topics.find(t => t.id === activeTopic) || { label: activeTopic, icon: '🏷️' };
        topicLabel.textContent = `${tObj.icon} ${tObj.label}`;
        topicBtn.classList.add('filtered');
      } else {
        topicLabel.textContent = '🏷️ Topics';
        topicBtn.classList.remove('filtered');
      }
    }

    // Filter banner
    const banner = document.getElementById('filterBanner');
    const bannerText = document.getElementById('filterBannerText');
    if (banner && bannerText) {
      if (activeTopic) {
        banner.classList.remove('hidden');
        bannerText.textContent = `Filtered by Topic: ${activeTopic}`;
      } else {
        banner.classList.add('hidden');
      }
    }

    // If user is on "Saved ⭐" tab OR filtering by topic -> render matching cards
    if (activeTab === 'saved' || activeTopic) {
      renderFilteredCardsView(container);
      return;
    }

    // Otherwise render grouped 5-Card Patches for 'new' or 'seen' tabs!
    const targetPatches = patchesList.filter(p => {
      const visible = p.cards.filter(c => !isCardHidden(c.id));
      if (visible.length === 0) return false;
      const done = isPatchFinished(p.batch_id);
      return activeTab === 'seen' ? done : !done;
    });

    if (targetPatches.length === 0) {
      if (activeTab === 'new') {
        container.innerHTML = `
          <div class="card-item" style="text-align: center; padding: 36px 18px;">
            <p style="font-size: 28px; margin-bottom: 8px;">🎉</p>
            <h3 style="font-size: 17px; margin-bottom: 6px;">You're all caught up on New Patches!</h3>
            <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 16px;">
              You have finished all current patches. Check your <strong>✅ Seen</strong> tab or take a <strong>🧠 Combined Review Quiz</strong>!
            </p>
            <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
              <button class="primary-btn" id="emptyGoQuizBtn">🧠 Take Combined Review Quiz</button>
              <button class="secondary-btn" id="emptyGoSeenBtn">✅ View Seen Patches</button>
            </div>
          </div>
        `;
        const qBtn = document.getElementById('emptyGoQuizBtn');
        if (qBtn) qBtn.addEventListener('click', () => openQuizHubModal());
        const sBtn = document.getElementById('emptyGoSeenBtn');
        if (sBtn) sBtn.addEventListener('click', () => switchTab('seen'));
      } else {
        container.innerHTML = `
          <div class="card-item" style="text-align: center; padding: 36px 18px;">
            <p style="font-size: 26px; margin-bottom: 8px;">📭</p>
            <h3 style="font-size: 16px; margin-bottom: 6px;">No Finished Patches Yet</h3>
            <p style="color: var(--text-secondary); font-size: 13px;">
              Read a 5-card patch in <strong>🆕 New Feed</strong> and tap <strong>✅ Mark Patch Finished</strong> (or complete its 5-question quiz) to move it here.
            </p>
          </div>
        `;
      }
      return;
    }

    if (activeTab === 'new') {
      // Home page displays the latest / current patch ONLY (5 cards)
      if (activePatchIdx >= targetPatches.length) activePatchIdx = 0;
      if (activePatchIdx < 0) activePatchIdx = 0;
      const currentPatch = targetPatches[activePatchIdx];
      container.appendChild(createPatchGroupElement(currentPatch, activePatchIdx, targetPatches));
    } else {
      // 'seen' tab displays all finished patches (collapsed)
      targetPatches.forEach(patch => {
        container.appendChild(createPatchGroupElement(patch));
      });
    }
  }

  // Render Filtered / Saved Individual Cards
  function renderFilteredCardsView(container) {
    let cards = Array.from(loadedCardsMap.values()).filter(c => !isCardHidden(c.id));

    if (activeTab === 'saved') {
      cards = cards.filter(c => !!userProgress.saves[c.id]);
    }

    if (activeTopic) {
      cards = cards.filter(c => c.topic === activeTopic);
    }

    cards.sort((a, b) => (numbersMap[b.id] || 0) - (numbersMap[a.id] || 0));

    if (cards.length === 0) {
      container.innerHTML = `
        <div class="card-item" style="text-align: center; padding: 36px 18px;">
          <p style="font-size: 24px; margin-bottom: 8px;">🏷️</p>
          <h3 style="font-size: 16px; margin-bottom: 6px;">No matching cards</h3>
          <p style="color: var(--text-secondary); font-size: 13px;">
            ${activeTab === 'saved' ? 'Tap 🔖 Save on any card to bookmark it here.' : 'Try resetting your topic filter.'}
          </p>
        </div>
      `;
      return;
    }

    cards.forEach(card => {
      container.appendChild(createCardElement(card));
    });
  }

  // Create a 5-Card Patch Container Element
  function createPatchGroupElement(patch, patchIdx, allPatches) {
    const visibleCards = patch.cards
      .filter(c => !isCardHidden(c.id))
      .sort((a, b) => (numbersMap[a.id] || 0) - (numbersMap[b.id] || 0));

    const nums = visibleCards.map(c => numbersMap[c.id] || 0).filter(Boolean);
    const minNum = nums.length ? Math.min(...nums) : '?';
    const maxNum = nums.length ? Math.max(...nums) : '?';

    const doneInfo = userProgress.finished_patches[patch.batch_id];
    const isDone = !!doneInfo;

    // In 'seen' tab, finished patches start neatly collapsed unless user expanded them
    const isCollapsed = isDone && !expandedPatches.has(patch.batch_id);

    const wrap = document.createElement('section');
    wrap.className = 'patch-group' + (isDone ? ' finished-patch' : '') + (isCollapsed ? ' collapsed' : '');
    wrap.id = `patch-${patch.batch_id}`;

    const scoreBadge = (doneInfo && typeof doneInfo.score === 'number')
      ? ` · Quiz: ${doneInfo.score}/${doneInfo.total}`
      : '';

    // Patch Header
    const header = document.createElement('div');
    header.className = 'patch-header';
    header.innerHTML = `
      <div class="patch-header-left">
        <span class="patch-title-badge">📦 Patch #${patch.patch_number}</span>
        <span class="patch-range-text">Cards #${minNum}–#${maxNum}</span>
        <span class="patch-meta-sub">(${visibleCards.length} cards · ${patch.date || ''}${scoreBadge})</span>
      </div>
      <div class="patch-header-right">
        <span class="patch-status-pill ${isDone ? 'done' : ''}">
          ${isDone ? '✅ Finished' : '🆕 Unread'}
        </span>
        <button type="button" class="patch-collapse-btn">
          ${isCollapsed ? '▾ Expand' : '▴ Collapse'}
        </button>
      </div>
    `;

    header.addEventListener('click', () => {
      const nowCollapsed = wrap.classList.toggle('collapsed');
      if (nowCollapsed) {
        expandedPatches.delete(patch.batch_id);
      } else {
        expandedPatches.add(patch.batch_id);
      }
      const btn = header.querySelector('.patch-collapse-btn');
      if (btn) btn.textContent = nowCollapsed ? '▾ Expand' : '▴ Collapse';
    });

    wrap.appendChild(header);

    // Collapsed summary bar (shown when collapsed)
    const collapsedBar = document.createElement('div');
    collapsedBar.className = 'patch-collapsed-bar';
    const previewTitles = visibleCards.slice(0, 2).map(c => c.en?.title || c.ar?.title || '').join(' · ');
    collapsedBar.innerHTML = `
      <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 65%;">
        ${previewTitles}...
      </span>
      <div style="display: flex; gap: 6px;">
        <button type="button" class="secondary-btn small btn-requiz-collapsed">🧠 Quiz (${visibleCards.length})</button>
        <button type="button" class="secondary-btn small btn-unfinish-collapsed">↩️ Mark Unread</button>
      </div>
    `;
    collapsedBar.querySelector('.btn-requiz-collapsed').addEventListener('click', (e) => {
      e.stopPropagation();
      startPatchQuizSession(patch, visibleCards);
    });
    collapsedBar.querySelector('.btn-unfinish-collapsed').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFinishPatch(patch, visibleCards);
    });
    wrap.appendChild(collapsedBar);

    // Cards List inside Patch
    const cardsWrapper = document.createElement('div');
    cardsWrapper.className = 'patch-cards-wrapper';
    visibleCards.forEach(card => {
      cardsWrapper.appendChild(createCardElement(card));
    });
    wrap.appendChild(cardsWrapper);

    // End-of-Patch Footer: Quiz This Patch (5 Qs) + Mark Patch Finished
    const footer = document.createElement('div');
    footer.className = 'patch-footer';
    footer.innerHTML = `
      <div class="patch-footer-info">
        Finished reading <strong>Patch #${patch.patch_number}</strong> (Cards #${minNum}–#${maxNum})? Test yourself or mark it done:
      </div>
      <div class="patch-footer-actions">
        <button type="button" class="patch-action-btn quiz-btn">
          🧠 Quiz This Patch (${visibleCards.length} Questions)
        </button>
        <button type="button" class="patch-action-btn finish-btn ${isDone ? 'is-finished' : ''}">
          ${isDone ? '✅ Patch Finished (Tap to Unmark)' : '✅ Mark Patch as Finished'}
        </button>
      </div>
    `;

    footer.querySelector('.quiz-btn').addEventListener('click', () => {
      startPatchQuizSession(patch, visibleCards);
    });

    footer.querySelector('.finish-btn').addEventListener('click', () => {
      toggleFinishPatch(patch, visibleCards);
    });

    // If on 'new' tab and multiple patches exist, add Patch Navigation Bar!
    if (activeTab === 'new' && allPatches && allPatches.length > 1 && typeof patchIdx === 'number') {
      const navBar = document.createElement('div');
      navBar.className = 'patch-nav-bar';

      const hasPrev = patchIdx < allPatches.length - 1; // older patch
      const hasNext = patchIdx > 0;                     // newer patch

      const prevPatch = hasPrev ? allPatches[patchIdx + 1] : null;
      const nextPatch = hasNext ? allPatches[patchIdx - 1] : null;

      navBar.innerHTML = `
        <button type="button" class="patch-nav-btn prev-btn" ${!hasPrev ? 'disabled' : ''}>
          ${hasPrev ? `◀ Older (Patch #${prevPatch.patch_number})` : '◀ Older Patch'}
        </button>
        <span class="patch-nav-indicator">
          Patch ${allPatches.length - patchIdx} of ${allPatches.length}
        </span>
        <button type="button" class="patch-nav-btn next-btn" ${!hasNext ? 'disabled' : ''}>
          ${hasNext ? `Newer (Patch #${nextPatch.patch_number}) ▶` : 'Newer Patch ▶'}
        </button>
      `;

      navBar.querySelector('.prev-btn')?.addEventListener('click', () => {
        if (hasPrev) {
          activePatchIdx = patchIdx + 1;
          renderFeed();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });

      navBar.querySelector('.next-btn')?.addEventListener('click', () => {
        if (hasNext) {
          activePatchIdx = patchIdx - 1;
          renderFeed();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });

      footer.appendChild(navBar);
    }

    wrap.appendChild(footer);
    return wrap;
  }

  // Create Single Card Element (Clean, Authentic Single-Language, Save & Delete Only)
  function createCardElement(card) {
    const el = document.createElement('article');
    el.className = 'card-item';
    el.id = `card-${card.id}`;

    const num = numbersMap[card.id] || '?';
    const isSaved = !!userProgress.saves[card.id];
    const topicObj = topics.find(t => t.id === card.topic) || { label: card.topic || 'General', icon: '📌' };
    const topicPillText = (card.topic || 'General').toUpperCase();

    // 1. Top Meta Row: Card #N + Patch Tag (Left) & Sage Topic Pill (Right) - No Avatar / Series Title
    const topRow = document.createElement('div');
    topRow.className = 'card-top-row';
    topRow.innerHTML = `
      <div class="card-meta-left">
        <span class="card-number-badge">#${num}</span>
        ${card._patch_number ? `<span class="card-patch-tag">Patch #${card._patch_number}</span>` : ''}
      </div>
      <div class="card-topic-pill">${topicPillText}</div>
    `;
    el.appendChild(topRow);

    // 2. Single Language Content (Never translated or stacked dual-language!)
    const isAr = (currentLang === 'ar' && card.ar) || (!card.en && card.ar);
    const content = isAr ? (card.ar || {}) : (card.en || card.ar || {});

    const contentSection = document.createElement('div');
    contentSection.className = 'card-editorial-content' + (isAr ? ' rtl' : '');
    if (isAr) contentSection.dir = 'rtl';

    const hasDetails = !!(content.why || content.when || content.example || content.mistake);

    contentSection.innerHTML = `
      <h2 class="card-editorial-headline ${isAr ? 'ar' : ''}">${content.title || ''}</h2>
      ${content.hook ? `<div class="card-hook-text ${isAr ? 'ar' : ''}">${content.hook}</div>` : ''}

      ${hasDetails ? `
        <button type="button" class="card-see-more-btn ${isAr ? 'ar' : ''}">
          ${isAr ? 'اقرأ المزيد' : 'See more'}
        </button>
        <div class="card-expanded-details ${isAr ? 'ar' : ''}">
          ${content.why ? `<div class="detail-row"><strong>${isAr ? '💡 ليه بتشتغل:' : '💡 Why it works:'}</strong> ${content.why}</div>` : ''}
          ${content.when ? `<div class="detail-row"><strong>${isAr ? '⏱ التوقيت:' : '⏱ When to use:'}</strong> ${content.when}</div>` : ''}
          ${content.example ? `<div class="detail-row"><strong>${isAr ? '📖 مثال واقعي:' : '📖 Real Example:'}</strong> ${content.example}</div>` : ''}
          ${content.mistake ? `<div class="detail-row"><strong>⚠️ الغلطة الشائعة:' : '⚠️ Mistake to avoid:'}</strong> ${content.mistake}</div>` : ''}
        </div>
      ` : ''}

      ${content.key_phrase ? `
        <div class="card-callout-box ${isAr ? 'rtl' : ''}">
          <div class="callout-header">
            <span class="callout-label">${isAr ? 'قول كدة بالمصري' : 'SAY THIS'}</span>
            <button type="button" class="copy-phrase-btn" title="${isAr ? 'نسخ الجملة' : 'Copy phrase'}">
              ${isAr ? '📋 نسخ' : '📋 Copy'}
            </button>
          </div>
          <div class="callout-quote ${isAr ? 'ar' : ''}">
            ${isAr ? `«${content.key_phrase}»` : `"${content.key_phrase}"`}
          </div>
        </div>
      ` : ''}

      ${content.action ? `
        <div class="card-move-row ${isAr ? 'ar' : ''}">
          <strong class="move-label ${isAr ? 'ar' : ''}">${isAr ? 'الخلاصة:' : 'The move:'}</strong>
          <span class="move-text">${content.action}</span>
        </div>
      ` : ''}
    `;

    // Copy phrase handler
    const cpBtn = contentSection.querySelector('.copy-phrase-btn');
    if (cpBtn) {
      cpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(content.key_phrase);
        cpBtn.textContent = isAr ? '✓ تم النسخ' : '✓ Copied';
        setTimeout(() => { cpBtn.textContent = isAr ? '📋 نسخ' : '📋 Copy'; }, 1800);
      });
    }

    // See more toggle
    const seeMoreBtn = contentSection.querySelector('.card-see-more-btn');
    const detailsBody = contentSection.querySelector('.card-expanded-details');
    if (seeMoreBtn && detailsBody) {
      seeMoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = detailsBody.classList.toggle('open');
        seeMoreBtn.textContent = isOpen ? (isAr ? 'اقرأ أقل' : 'See less') : (isAr ? 'اقرأ المزيد' : 'See more');
      });
    }

    el.appendChild(contentSection);

    // 3. Card Footer Divider & Actions (Only Save & Delete — No Like, No Quiz under individual card!)
    const hr = document.createElement('hr');
    hr.className = 'card-footer-divider';
    el.appendChild(hr);

    const footer = document.createElement('div');
    footer.className = 'card-editorial-footer';

    const rightActions = document.createElement('div');
    rightActions.className = 'card-footer-right';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'card-footer-btn save-btn' + (isSaved ? ' saved' : '');
    saveBtn.title = isSaved ? 'Saved in your Saved tab' : 'Save card to your Saved tab';
    saveBtn.innerHTML = `
      <svg class="footer-icon bookmark-icon" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
      <span class="btn-text">${isSaved ? (isAr ? 'تم الحفظ' : 'Saved') : (isAr ? 'حفظ' : 'Save')}</span>
    `;
    saveBtn.addEventListener('click', () => toggleSave(card.id, saveBtn));
    rightActions.appendChild(saveBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'card-footer-btn delete-btn';
    deleteBtn.title = 'Delete card (Password protected)';
    deleteBtn.innerHTML = `<span class="icon">🗑️</span>`;
    deleteBtn.addEventListener('click', () => confirmDeleteCard(card.id));
    rightActions.appendChild(deleteBtn);

    footer.appendChild(rightActions);
    el.appendChild(footer);

    return el;
  }

  // Toggle Save Card (Bookmark Action)
  function toggleSave(cardId, btnEl) {
    const isNowSaved = !userProgress.saves[cardId];
    if (isNowSaved) {
      userProgress.saves[cardId] = Date.now();
      btnEl.classList.add('saved');
      btnEl.querySelector('.bookmark-icon')?.setAttribute('fill', 'currentColor');
      btnEl.querySelector('.btn-text').textContent = 'Saved';
      if (!userProgress.srs[cardId]) {
        userProgress.srs[cardId] = {
          stage: 0,
          due: getTodayStr(),
          updated_at: new Date().toISOString()
        };
      }
    } else {
      delete userProgress.saves[cardId];
      btnEl.classList.remove('saved');
      btnEl.querySelector('.bookmark-icon')?.setAttribute('fill', 'none');
      btnEl.querySelector('.btn-text').textContent = 'Save';
    }
    saveUserProgress();
    if (activeTab === 'saved') renderFeed();
  }

  // Toggle Mark Patch as Finished / Read
  function toggleFinishPatch(patch, visibleCards, quizScoreObj) {
    const batchId = patch.batch_id;
    const today = getTodayStr();

    if (userProgress.finished_patches[batchId] && !quizScoreObj) {
      delete userProgress.finished_patches[batchId];
      expandedPatches.delete(batchId);
      saveUserProgress();
      renderFeed();
      return;
    }

    userProgress.finished_patches[batchId] = {
      finished_at: new Date().toISOString(),
      score: quizScoreObj ? quizScoreObj.score : undefined,
      total: quizScoreObj ? quizScoreObj.total : visibleCards.length
    };

    // Enroll all 5 cards of the finished patch into the Spaced Repetition Review Pool
    visibleCards.forEach(c => {
      if (!userProgress.srs[c.id]) {
        userProgress.srs[c.id] = {
          stage: 0,
          due: today,
          updated_at: new Date().toISOString()
        };
      }
    });

    expandedPatches.delete(batchId);
    saveUserProgress();
    renderFeed();
  }

  // ========================================================
  // PATCH QUIZ & COMBINED REVIEW QUIZ ENGINE
  // ========================================================
  function openQuizHubModal() {
    const modal = document.getElementById('quizModal');
    const titleEl = document.getElementById('quizModalTitle');
    const bodyEl = document.getElementById('quizModalBody');
    if (!modal || !bodyEl) return;

    titleEl.textContent = '🧠 Combined Quiz & Review Hub';

    const today = getTodayStr();
    const poolCards = getReviewPoolCards();
    const dueCards = poolCards.filter(c => {
      const s = userProgress.srs[c.id];
      return !s || (s.due && s.due <= today);
    });
    const mistakeCards = Array.from(loadedCardsMap.values()).filter(
      c => !isCardHidden(c.id) && !!userProgress.mistakes[c.id]
    );
    let masteredCount = 0;
    Object.values(userProgress.srs).forEach(s => {
      if (s && s.stage >= 6) masteredCount++;
    });

    const finishedPatchesCount = Object.keys(userProgress.finished_patches).length;

    bodyEl.innerHTML = `
      <div class="quiz-hub-stats">
        <div class="stat-card">
          <span class="stat-num" style="color: #34d399;">${finishedPatchesCount}</span>
          <span class="stat-label">Finished Patches</span>
        </div>
        <div class="stat-card">
          <span class="stat-num" style="color: #38bdf8;">${dueCards.length}</span>
          <span class="stat-label">Due Today (SRS)</span>
        </div>
        <div class="stat-card">
          <span class="stat-num" style="color: #fbbf24;">${mistakeCards.length}</span>
          <span class="stat-label">Need Retry</span>
        </div>
        <div class="stat-card">
          <span class="stat-num" style="color: #c084fc;">${poolCards.length}</span>
          <span class="stat-label">Cards in Review Pool</span>
        </div>
      </div>

      <div class="quiz-mode-list">
        <button type="button" class="primary-btn" id="btnStartSrsDue" ${dueCards.length === 0 ? 'disabled style="opacity:0.5"' : ''}>
          ⏰ Review Due Today (${dueCards.length} Cards · Spaced Repetition)
        </button>

        <button type="button" class="secondary-btn" id="btnStartCombined5" ${poolCards.length === 0 ? 'disabled style="opacity:0.5"' : ''}>
          🔀 Combined Quiz: Mix 5 Cards from Finished Patches
        </button>

        <button type="button" class="secondary-btn" id="btnStartCombined10" ${poolCards.length === 0 ? 'disabled style="opacity:0.5"' : ''}>
          🔀 Combined Quiz: Mix 10 Cards from Finished Patches
        </button>

        <button type="button" class="secondary-btn" id="btnStartMistakes" ${mistakeCards.length === 0 ? 'disabled style="opacity:0.5"' : ''}>
          🔄 Retry Mistakes (${mistakeCards.length} Cards)
        </button>

        <button type="button" class="secondary-btn" id="btnStartAllRandom">
          ⚡ Quick Practice: Mix 5 Cards from All Patches
        </button>
      </div>

      <div style="margin-top: 14px; font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
        <strong>How it works:</strong> When you finish a 5-card patch, its cards enter your Review Pool. Spaced repetition schedules reviews at <strong>1 → 2 → 3 → 7 → 14 → 30 days</strong> (${masteredCount} mastered so far).
      </div>
    `;

    const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

    bodyEl.querySelector('#btnStartSrsDue')?.addEventListener('click', () => {
      runInteractiveQuizSession('⏰ Due Today (Spaced Repetition)', dueCards.slice(0, 15), null);
    });

    bodyEl.querySelector('#btnStartCombined5')?.addEventListener('click', () => {
      runInteractiveQuizSession('🔀 Combined Review (5 Finished Cards)', shuffle(poolCards).slice(0, 5), null);
    });

    bodyEl.querySelector('#btnStartCombined10')?.addEventListener('click', () => {
      runInteractiveQuizSession('🔀 Combined Review (10 Finished Cards)', shuffle(poolCards).slice(0, 10), null);
    });

    bodyEl.querySelector('#btnStartMistakes')?.addEventListener('click', () => {
      runInteractiveQuizSession('🔄 Retry Mistakes', mistakeCards, null);
    });

    bodyEl.querySelector('#btnStartAllRandom')?.addEventListener('click', () => {
      const allVisible = Array.from(loadedCardsMap.values()).filter(c => !isCardHidden(c.id));
      runInteractiveQuizSession('⚡ Quick 5-Card Mix', shuffle(allVisible).slice(0, 5), null);
    });

    modal.classList.add('open');
  }

  function startPatchQuizSession(patch, visibleCards) {
    const modal = document.getElementById('quizModal');
    if (modal) modal.classList.add('open');
    runInteractiveQuizSession(
      `📦 Patch #${patch.patch_number} Quiz (${visibleCards.length} Questions)`,
      visibleCards,
      patch
    );
  }

  function runInteractiveQuizSession(sessionTitle, cardsQueue, associatedPatch) {
    const titleEl = document.getElementById('quizModalTitle');
    const bodyEl = document.getElementById('quizModalBody');
    if (!bodyEl) return;

    const validCards = cardsQueue.filter(c => c && c.quiz);
    if (validCards.length === 0) {
      bodyEl.innerHTML = `<p>No quiz questions available for this selection.</p>`;
      return;
    }

    titleEl.textContent = sessionTitle;
    let currentIdx = 0;
    let correctCount = 0;

    function renderQuestionStep() {
      if (currentIdx >= validCards.length) {
        // Quiz finished summary!
        const pct = Math.round((correctCount / validCards.length) * 100);
        if (associatedPatch) {
          toggleFinishPatch(associatedPatch, validCards, {
            score: correctCount,
            total: validCards.length
          });
        }

        bodyEl.innerHTML = `
          <div class="quiz-runner-card" style="text-align: center; padding: 24px 16px;">
            <div style="font-size: 36px; margin-bottom: 8px;">${pct >= 80 ? '🏆' : '🎯'}</div>
            <h3 style="font-size: 18px; margin-bottom: 6px;">
              Quiz Complete: ${correctCount} / ${validCards.length} (${pct}%)
            </h3>
            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 18px;">
              ${associatedPatch
                ? `Patch #${associatedPatch.patch_number} has been marked as <strong>✅ Finished</strong> and added to your Review Pool!`
                : 'Your Spaced Repetition intervals have been updated!'}
            </p>
            <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
              <button type="button" class="secondary-btn" id="btnRetryThisQuiz">🔄 Replay Quiz</button>
              <button type="button" class="primary-btn" id="btnDoneQuizClose">Done ✓</button>
            </div>
          </div>
        `;

        bodyEl.querySelector('#btnRetryThisQuiz')?.addEventListener('click', () => {
          currentIdx = 0;
          correctCount = 0;
          renderQuestionStep();
        });
        bodyEl.querySelector('#btnDoneQuizClose')?.addEventListener('click', () => {
          closeModal('quizModal');
        });
        return;
      }

      const card = validCards[currentIdx];
      const num = numbersMap[card.id] || '?';
      const isQuizAr = (currentLang === 'ar' && card.quiz.ar) || (!card.quiz.en && card.quiz.ar);
      const q = isQuizAr ? (card.quiz.ar || {}) : (card.quiz.en || card.quiz.ar || {});
      const options = q.options || [];

      bodyEl.innerHTML = `
        <div class="quiz-runner-card">
          <div class="quiz-progress-top">
            <span>${isQuizAr ? `السؤال <strong>${currentIdx + 1} من ${validCards.length}</strong> · كارت #${num}` : `Question <strong>${currentIdx + 1} of ${validCards.length}</strong> · Card #${num}`}</span>
            <span>${isQuizAr ? `الدرجة: ${correctCount}/${currentIdx}` : `Score: ${correctCount}/${currentIdx}`}</span>
          </div>

          <div class="quiz-q-title ${isQuizAr ? 'quiz-q-ar' : ''}" ${isQuizAr ? 'dir="rtl" style="font-family: var(--font-ar);"' : ''}>
            ${q.question || ''}
          </div>

          <div class="quiz-options">
            ${options.map((opt, idx) => `
              <button type="button" class="quiz-opt-btn" data-idx="${idx}">
                <div ${isQuizAr ? 'dir="rtl" style="font-family: var(--font-ar);"' : ''}>
                  <strong>${String.fromCharCode(65 + idx)}.</strong> ${opt}
                </div>
              </button>
            `).join('')}
          </div>

          <div class="quiz-feedback" id="runnerFeedback"></div>

          <div class="modal-footer" style="display: none;" id="runnerNextFooter">
            <button type="button" class="primary-btn" id="btnNextQuestion">
              ${currentIdx + 1 < validCards.length ? (isQuizAr ? 'السؤال التالي ▸' : 'Next Question ▸') : (isQuizAr ? 'النتيجة 🏆' : 'See Results 🏆')}
            </button>
          </div>
        </div>
      `;

      const optBtns = bodyEl.querySelectorAll('.quiz-opt-btn');
      const fbEl = bodyEl.querySelector('#runnerFeedback');
      const nextFooter = bodyEl.querySelector('#runnerNextFooter');

      optBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const chosen = parseInt(btn.dataset.idx, 10);
          const correct = card.quiz.correct_index;
          optBtns.forEach(b => { b.disabled = true; });

          const isRight = chosen === correct;
          if (isRight) {
            correctCount++;
            btn.classList.add('correct');
          } else {
            btn.classList.add('wrong');
            if (optBtns[correct]) optBtns[correct].classList.add('correct');
          }

          handleSrsAnswer(card.id, isRight);

          fbEl.className = 'quiz-feedback show ' + (isRight ? 'success' : 'fail');
          fbEl.innerHTML = `
            <div><strong>${isRight ? (isQuizAr ? '✓ إجابة صحيحة!' : '✓ Correct!') : (isQuizAr ? '✕ مش الإجابة دي' : '✕ Not quite.')}</strong></div>
            ${q.explanation ? `<div style="margin-top:4px;" ${isQuizAr ? 'dir="rtl" style="font-family: var(--font-ar);"' : ''}>${q.explanation}</div>` : ''}
          `;

          nextFooter.style.display = 'flex';
        });
      });

      bodyEl.querySelector('#btnNextQuestion')?.addEventListener('click', () => {
        currentIdx++;
        renderQuestionStep();
      });
    }

    renderQuestionStep();
  }

  function handleSrsAnswer(cardId, isCorrect) {
    const today = getTodayStr();
    const intervals = appConfig.srs_intervals_days || [1, 2, 3, 7, 14, 30];
    if (!userProgress.srs[cardId]) {
      userProgress.srs[cardId] = { stage: 0, due: today, updated_at: new Date().toISOString() };
    }
    const state = userProgress.srs[cardId];
    if (isCorrect) {
      delete userProgress.mistakes[cardId];
      const nextDays = intervals[state.stage] || 30;
      state.stage = Math.min(state.stage + 1, intervals.length);
      state.due = addDays(today, nextDays);
    } else {
      userProgress.mistakes[cardId] = Date.now();
      state.stage = 0;
      state.due = today;
    }
    state.updated_at = new Date().toISOString();
    saveUserProgress();
  }

  // ========================================================
  // TOPIC PICKER MODAL (All 14 Topics Grouped Under 1 Button)
  // ========================================================
  function openTopicsModal() {
    const modal = document.getElementById('topicsModal');
    const grid = document.getElementById('topicsGridContainer');
    if (!modal || !grid) return;

    // Count active cards per topic
    const counts = {};
    let totalVisible = 0;
    loadedCardsMap.forEach(c => {
      if (isCardHidden(c.id)) return;
      totalVisible++;
      counts[c.topic] = (counts[c.topic] || 0) + 1;
    });

    grid.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'topic-grid-btn full-span' + (activeTopic === null ? ' active' : '');
    allBtn.innerHTML = `
      <span>✨ All Topics (Show Patches)</span>
      <span class="topic-count-pill">${totalVisible} cards</span>
    `;
    allBtn.addEventListener('click', () => {
      activeTopic = null;
      closeModal('topicsModal');
      renderFeed();
    });
    grid.appendChild(allBtn);

    topics.forEach(t => {
      const cCount = counts[t.id] || 0;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'topic-grid-btn' + (activeTopic === t.id ? ' active' : '');
      btn.innerHTML = `
        <span>${t.icon || '📌'} ${t.label}</span>
        <span class="topic-count-pill">${cCount}</span>
      `;
      btn.addEventListener('click', () => {
        activeTopic = (activeTopic === t.id) ? null : t.id;
        closeModal('topicsModal');
        renderFeed();
      });
      grid.appendChild(btn);
    });

    modal.classList.add('open');
  }

  // ========================================================
  // PATCH STATUS & HISTORY MODAL
  // ========================================================
  function openHistoryModal() {
    const modal = document.getElementById('historyModal');
    const body = document.getElementById('historyModalBody');
    if (!modal || !body) return;

    const today = getTodayStr();
    const todayPatches = patchesList.filter(p => p.date === today);

    let html = `
      <div class="history-summary-box">
        <div><strong>Today's Date:</strong> ${today}</div>
        <div><strong>Added Today:</strong> ${todayPatches.length} Patch(es) (Target: 3 patches / 15 cards per day)</div>
        <div><strong>Total in Library:</strong> ${patchesList.length} Patches (${loadedCardsMap.size} Cards)</div>
      </div>
      <h3 style="font-size: 14px; margin-bottom: 8px;">All Patches (Newest First)</h3>
      <div class="history-list">
    `;

    patchesList.forEach(p => {
      const visible = p.cards.filter(c => !isCardHidden(c.id));
      const nums = visible.map(c => numbersMap[c.id] || 0).filter(Boolean);
      const minN = nums.length ? Math.min(...nums) : '?';
      const maxN = nums.length ? Math.max(...nums) : '?';
      const done = isPatchFinished(p.batch_id);

      html += `
        <div class="history-item">
          <div>
            <div>
              <strong>📦 Patch #${p.patch_number}</strong> · Cards #${minN}–#${maxN} (${visible.length} cards)
            </div>
            <div style="font-size: 11.5px; color: var(--text-secondary);">
              Date: ${p.date || 'N/A'} · Source: <code>${p.source || 'auto'}</code> · ID: <code>${p.batch_id}</code>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="patch-status-pill ${done ? 'done' : ''}">${done ? '✅ Finished' : '🆕 Unread'}</span>
            <button type="button" class="secondary-btn small" data-quiz-patch="${p.batch_id}">🧠 Quiz</button>
          </div>
        </div>
      `;
    });

    html += `</div>`;

    if (buildReport && Array.isArray(buildReport.skipped_details) && buildReport.skipped_details.length > 0) {
      html += `
        <h3 style="font-size: 14px; margin: 16px 0 6px; color: var(--color-warning);">⚠️ Skipped / Invalid Cards Report</h3>
        <div style="font-size: 12px; color: var(--text-secondary);">
          ${buildReport.skipped_details.map(s => `<div>• ${s.file} (${s.card_id}): ${s.reason}</div>`).join('')}
        </div>
      `;
    }

    body.innerHTML = html;

    body.querySelectorAll('[data-quiz-patch]').forEach(btn => {
      btn.addEventListener('click', () => {
        const bId = btn.dataset.quizPatch;
        const found = patchesList.find(p => p.batch_id === bId);
        if (found) {
          closeModal('historyModal');
          const vis = found.cards.filter(c => !isCardHidden(c.id));
          startPatchQuizSession(found, vis);
        }
      });
    });

    modal.classList.add('open');
  }

  // ========================================================
  // ADD JSON PATCH (UPLOAD FILE OR PASTE JSON) & SYNC TO GITHUB
  // ========================================================
  function parseAndValidateJsonPatchText(rawText) {
    if (!rawText || !rawText.trim()) {
      return { valid: false, error: 'Please upload a .json file or paste JSON text first.' };
    }
    let cleaned = rawText.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return { valid: false, error: 'Invalid JSON syntax: ' + e.message };
    }

    const cards = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.cards) ? parsed.cards : null);
    if (!cards || cards.length === 0) {
      return { valid: false, error: 'JSON must contain a "cards": [...] array (or be an array of card objects).' };
    }

    const validCards = [];
    const errors = [];
    const today = getTodayStr();

    cards.forEach((c, idx) => {
      if (!c || typeof c !== 'object') {
        errors.push(`Card #${idx + 1} is not an object.`);
        return;
      }
      if (!c.en || !c.en.title || !c.en.action) {
        errors.push(`Card #${idx + 1} is missing en.title or en.action.`);
        return;
      }
      const topic = c.topic || 'sales';
      const slug = c.en.title.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 28);
      if (!c.id) {
        c.id = `${today}_${topic}_${slug}-${Date.now().toString().slice(-3)}${idx}`;
      }
      if (!c.created_at) c.created_at = new Date().toISOString();
      if (!c.ar) {
        c.ar = Object.assign({}, c.en);
      }
      if (!c.quiz || !c.quiz.en) {
        c.quiz = {
          type: 'mcq',
          correct_index: 0,
          en: {
            question: `What is the key action for "${c.en.title}"?`,
            options: [c.en.action, 'Do nothing and wait', 'Argue directly', 'Offer an immediate discount'],
            explanation: c.en.why || 'This approach protects value and achieves results.'
          },
          ar: {
            question: `إيه التصرف الصح في «${c.ar.title || c.en.title}»؟`,
            options: [c.ar.action || c.en.action, 'الانتظار بدون حركة', 'الدخول في جدال مباشر', 'تقديم تنازل فوري'],
            explanation: c.ar.why || c.en.why || 'الأسلوب ده بيحقق أفضل نتيجة.'
          }
        };
      }
      validCards.push(c);
    });

    if (validCards.length === 0) {
      return { valid: false, error: errors.join(' | ') || 'No valid cards found.' };
    }

    return {
      valid: true,
      cards: validCards,
      batch_id: (parsed && parsed.batch_id) ? parsed.batch_id : `${today}_manual_${Date.now().toString().slice(-4)}`,
      source: (parsed && parsed.source) ? parsed.source : 'manual-json',
      warnings: errors
    };
  }

  async function publishValidatedJsonPatch() {
    const textarea = document.getElementById('jsonPatchTextarea');
    const previewEl = document.getElementById('jsonValidationPreview');
    const res = parseAndValidateJsonPatchText(textarea ? textarea.value : '');

    if (!res.valid) {
      if (previewEl) {
        previewEl.className = 'validation-preview invalid';
        previewEl.textContent = '❌ ' + res.error;
      }
      return;
    }

    const expectedPass = userProgress.delete_password || appConfig.delete_password || '123';
    const entered = window.prompt(`Confirm publishing ${res.cards.length}-card JSON Patch:\nEnter password (default: ${expectedPass}):`);
    if (entered === null) return;
    if (entered !== expectedPass) {
      alert('Incorrect password.');
      return;
    }

    const today = getTodayStr();
    const maxPatchNum = patchesList.reduce((m, p) => Math.max(m, p.patch_number || 0), 0);
    let maxCardNum = Object.values(numbersMap).reduce((m, n) => Math.max(m, n || 0), 0);

    const newPatchNum = maxPatchNum + 1;
    res.cards.forEach(c => {
      if (!numbersMap[c.id]) {
        maxCardNum += 1;
        numbersMap[c.id] = maxCardNum;
      }
      c._patch_id = res.batch_id;
      c._patch_number = newPatchNum;
      loadedCardsMap.set(c.id, c);
    });

    const newPatchObj = {
      patch_number: newPatchNum,
      batch_id: res.batch_id,
      path: `cards/${today.slice(0, 4)}/${res.batch_id}.json`,
      date: today,
      created_at: new Date().toISOString(),
      source: res.source,
      cards: res.cards
    };

    if (!Array.isArray(userProgress.local_patches)) userProgress.local_patches = [];
    userProgress.local_patches.unshift(newPatchObj);
    patchesList.unshift(newPatchObj);
    saveUserProgress();
    populateCardSelector();

    // If Owner GitHub token is set, also push the JSON file straight to GitHub repo!
    let githubMsg = 'Saved immediately to your feed!';
    if (userProgress.owner_token && appConfig.github) {
      try {
        await pushPatchFileToGitHub(newPatchObj);
        githubMsg = 'Published to your feed AND pushed to GitHub repository!';
      } catch (e) {
        console.warn('GitHub push notice:', e);
        githubMsg = `Added to your feed! (GitHub push note: ${e.message})`;
      }
    }

    if (textarea) textarea.value = '';
    if (previewEl) previewEl.className = 'validation-preview hidden';
    const fileLabel = document.getElementById('uploadedFileName');
    if (fileLabel) fileLabel.textContent = '';

    closeModal('addPatchModal');
    switchTab('new');
    alert(`✅ Patch #${newPatchNum} (${res.cards.length} cards) added!\n${githubMsg}`);
  }

  async function pushPatchFileToGitHub(patchObj) {
    const { owner, repo, branch = 'main' } = appConfig.github;
    const year = (patchObj.date || getTodayStr()).slice(0, 4);
    const filePath = `cards/${year}/${patchObj.batch_id}.json`;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    const cleanCards = patchObj.cards.map(c => {
      const copy = Object.assign({}, c);
      delete copy._patch_id;
      delete copy._patch_number;
      return copy;
    });

    const payloadObj = {
      schema_version: 1,
      batch_id: patchObj.batch_id,
      created_at: patchObj.created_at,
      source: patchObj.source || 'manual-ui',
      cards: cleanCards
    };

    const jsonStr = JSON.stringify(payloadObj, null, 2) + '\n';
    const contentBase64 = btoa(unescape(encodeURIComponent(jsonStr)));

    const putResp = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `token ${userProgress.owner_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Add manual patch ${patchObj.batch_id} (${cleanCards.length} cards)`,
        content: contentBase64,
        branch
      })
    });

    if (!putResp.ok) {
      throw new Error(`GitHub API HTTP ${putResp.status}`);
    }
  }

  // Delete Single Card (Password Guard)
  async function confirmDeleteCard(cardId) {
    const expectedPass = userProgress.delete_password || appConfig.delete_password || '123';
    const entered = window.prompt(`Delete Single Card (#${numbersMap[cardId] || ''}):\nEnter password (default: ${expectedPass}):`);
    if (entered === null) return;
    if (entered !== expectedPass) {
      alert('Incorrect password. Card was not deleted.');
      return;
    }

    userProgress.hidden[cardId] = Date.now();
    saveUserProgress();
    populateCardSelector();
    renderFeed();
  }

  function switchTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll('.feed-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });
    renderFeed();
  }

  function populateComposerTopics() {
    const select = document.getElementById('compTopic');
    if (!select) return;
    select.innerHTML = '';
    topics.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.icon || ''} ${t.label}`;
      select.appendChild(opt);
    });
  }

  // Setup Event Listeners
  function setupEventListeners() {
    // 3 Main Feed Tabs
    document.querySelectorAll('.feed-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Card Selector Dropdown (Replaces search text input)
    const cardPicker = document.getElementById('cardSelectPicker');
    if (cardPicker) {
      cardPicker.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        if (selectedId) {
          jumpToCard(selectedId);
          e.target.value = '';
        }
      });
    }

    // Reset Filter Banner
    document.getElementById('resetFilterBtn')?.addEventListener('click', () => {
      activeTopic = null;
      renderFeed();
    });

    // Single Grouped Topics Button
    document.getElementById('btnTopicsPicker')?.addEventListener('click', openTopicsModal);

    // Header Buttons
    setupModal('btnSettings', 'settingsModal');
    document.getElementById('btnCombinedQuiz')?.addEventListener('click', openQuizHubModal);

    // Open History modal from inside Settings
    document.getElementById('btnOpenHistoryFromSettings')?.addEventListener('click', () => {
      closeModal('settingsModal');
      openHistoryModal();
    });

    // Open Add Patch modal from inside Settings
    document.getElementById('btnOpenAddPatchFromSettings')?.addEventListener('click', () => {
      closeModal('settingsModal');
      openModal('addPatchModal');
    });

    // Prepopulate settings fields when opening Settings
    document.getElementById('btnSettings')?.addEventListener('click', () => {
      const passInput = document.getElementById('settingDeletePassword');
      const tokenInput = document.getElementById('settingOwnerToken');
      if (passInput) passInput.value = userProgress.delete_password || '';
      if (tokenInput) tokenInput.value = userProgress.owner_token || '';
      applyTheme(userProgress.theme || 'ivory');
    });

    // Close modal buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
    });

    // Mode tabs inside Add Patch Modal (JSON vs Single Card)
    document.querySelectorAll('.mode-tab').forEach(mTab => {
      mTab.addEventListener('click', () => {
        document.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
        mTab.classList.add('active');
        const mode = mTab.dataset.mode;
        document.getElementById('modeJsonPanel')?.classList.toggle('hidden', mode !== 'json');
        document.getElementById('composerForm')?.classList.toggle('hidden', mode !== 'single');
      });
    });

    // Upload .json File Picker
    const btnPickJsonFile = document.getElementById('btnPickJsonFile');
    const jsonFileInput = document.getElementById('jsonPatchFileInput');
    if (btnPickJsonFile && jsonFileInput) {
      btnPickJsonFile.addEventListener('click', () => jsonFileInput.click());
      jsonFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const nameEl = document.getElementById('uploadedFileName');
        if (nameEl) nameEl.textContent = `✓ Loaded file: ${file.name}`;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const textarea = document.getElementById('jsonPatchTextarea');
          if (textarea) {
            textarea.value = ev.target.result;
            showJsonPreview();
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      });
    }

    // Live JSON Check & Publish
    document.getElementById('btnValidateJson')?.addEventListener('click', showJsonPreview);
    document.getElementById('jsonPatchTextarea')?.addEventListener('input', showJsonPreview);
    document.getElementById('btnPublishJsonPatch')?.addEventListener('click', publishValidatedJsonPatch);

    // Copy AI Prompt Button
    document.getElementById('btnCopyAiPrompt')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      try {
        const resp = await fetch('prompts/card_prompt.md');
        const txt = await resp.text();
        await navigator.clipboard.writeText(txt);
        btn.textContent = '✓ Prompt Copied!';
      } catch (_) {
        btn.textContent = '✓ Copied!';
      }
      setTimeout(() => { btn.textContent = '📋 Copy AI Prompt'; }, 2000);
    });

    // Single Card Composer Form
    document.getElementById('composerForm')?.addEventListener('submit', handleSingleCardSubmit);

    // Export / Import / Settings
    document.getElementById('btnExportProgress')?.addEventListener('click', exportProgressJSON);
    document.getElementById('btnExportAllContent')?.addEventListener('click', exportAllContentJSON);

    const btnTriggerImport = document.getElementById('btnTriggerImport');
    const importFileInput = document.getElementById('importFileInput');
    if (btnTriggerImport && importFileInput) {
      btnTriggerImport.addEventListener('click', () => importFileInput.click());
      importFileInput.addEventListener('change', handleImportProgressFile);
    }

    document.getElementById('btnSaveSettings')?.addEventListener('click', () => {
      const pass = document.getElementById('settingDeletePassword').value.trim();
      const token = document.getElementById('settingOwnerToken').value.trim();
      if (pass) userProgress.delete_password = pass;
      if (token) userProgress.owner_token = token;
      saveUserProgress();
      alert('Settings saved!');
      closeModal('settingsModal');
    });

    document.getElementById('btnRestoreHidden')?.addEventListener('click', () => {
      userProgress.hidden = {};
      saveUserProgress();
      renderFeed();
      alert('All locally hidden cards restored!');
    });
  }

  function showJsonPreview() {
    const textarea = document.getElementById('jsonPatchTextarea');
    const previewEl = document.getElementById('jsonValidationPreview');
    if (!textarea || !previewEl) return;

    if (!textarea.value.trim()) {
      previewEl.className = 'validation-preview hidden';
      return;
    }

    const res = parseAndValidateJsonPatchText(textarea.value);
    if (!res.valid) {
      previewEl.className = 'validation-preview invalid';
      previewEl.innerHTML = `❌ <strong>Invalid JSON:</strong> ${res.error}`;
    } else {
      const titles = res.cards.map((c, i) => `${i + 1}. [${c.topic}] ${c.en.title}`).join('<br>');
      previewEl.className = 'validation-preview valid';
      previewEl.innerHTML = `
        <div>✅ <strong>Valid Patch! ${res.cards.length} Card(s) Ready to Publish:</strong></div>
        <div style="margin-top: 4px; font-size: 11.5px; color: #e2e8f0;">${titles}</div>
      `;
    }
  }

  function handleSingleCardSubmit(e) {
    e.preventDefault();
    const topic = document.getElementById('compTopic').value;
    const level = document.getElementById('compLevel').value;
    const enTitle = document.getElementById('compEnTitle').value.trim();
    const enHook = document.getElementById('compEnHook').value.trim();
    const enKeyPhrase = document.getElementById('compEnKeyPhrase').value.trim();
    const enAction = document.getElementById('compEnAction').value.trim();
    const enWhen = document.getElementById('compEnWhen').value.trim();
    const enWhy = document.getElementById('compEnWhy').value.trim();
    const enExample = document.getElementById('compEnExample').value.trim();
    const enMistake = document.getElementById('compEnMistake').value.trim();

    const arTitle = document.getElementById('compArTitle').value.trim() || enTitle;
    const arHook = document.getElementById('compArHook').value.trim() || enHook;
    const arKeyPhrase = document.getElementById('compArKeyPhrase').value.trim() || enKeyPhrase;
    const arAction = document.getElementById('compArAction').value.trim() || enAction;
    const arWhen = document.getElementById('compArWhen').value.trim() || enWhen;
    const arWhy = document.getElementById('compArWhy').value.trim() || enWhy;
    const arExample = document.getElementById('compArExample').value.trim() || enExample;
    const arMistake = document.getElementById('compArMistake').value.trim() || enMistake;

    const singlePatchJson = JSON.stringify({
      batch_id: `${getTodayStr()}_single_${Date.now().toString().slice(-4)}`,
      source: 'manual-single',
      cards: [{
        topic,
        level,
        en: { title: enTitle, hook: enHook, key_phrase: enKeyPhrase, action: enAction, when: enWhen, why: enWhy, example: enExample, mistake: enMistake },
        ar: { title: arTitle, hook: arHook, key_phrase: arKeyPhrase, action: arAction, when: arWhen, why: arWhy, example: arExample, mistake: arMistake }
      }]
    });

    const textarea = document.getElementById('jsonPatchTextarea');
    if (textarea) textarea.value = singlePatchJson;
    e.target.reset();
    publishValidatedJsonPatch();
  }

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('open');
  }

  function setupModal(triggerId, modalId) {
    const trigger = document.getElementById(triggerId);
    const modal = document.getElementById(modalId);
    if (!trigger || !modal) return;
    trigger.addEventListener('click', () => openModal(modalId));
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
  }

  // Export & Import
  function exportProgressJSON() {
    const data = {
      schema_version: 2,
      exported_at: new Date().toISOString(),
      saves: userProgress.saves,
      finished_patches: userProgress.finished_patches,
      srs: userProgress.srs,
      mistakes: userProgress.mistakes,
      hidden: userProgress.hidden,
      local_patches: userProgress.local_patches || []
    };
    downloadJSON(data, `daily-feed-progress-${getTodayStr()}.json`);
  }

  function exportAllContentJSON() {
    const allPatches = patchesList.map(p => ({
      patch_number: p.patch_number,
      batch_id: p.batch_id,
      date: p.date,
      source: p.source,
      cards: p.cards.map(c => Object.assign({ permanent_number: numbersMap[c.id] || 0 }, c))
    }));
    downloadJSON({
      schema_version: 2,
      exported_at: new Date().toISOString(),
      total_patches: allPatches.length,
      total_cards: loadedCardsMap.size,
      patches: allPatches
    }, `daily-feed-all-patches-${getTodayStr()}.json`);
  }

  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImportProgressFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const imp = JSON.parse(ev.target.result);
        if (!imp || typeof imp !== 'object') throw new Error('Invalid JSON object');
        userProgress.saves = Object.assign({}, userProgress.saves, imp.saves || {}, imp.likes || {});
        userProgress.finished_patches = Object.assign({}, userProgress.finished_patches, imp.finished_patches || {});
        userProgress.mistakes = Object.assign({}, userProgress.mistakes, imp.mistakes || {});
        userProgress.hidden = Object.assign({}, userProgress.hidden, imp.hidden || {});
        if (imp.srs) {
          Object.keys(imp.srs).forEach(id => {
            const cur = userProgress.srs[id];
            const inc = imp.srs[id];
            if (!cur || (inc.updated_at && inc.updated_at > (cur.updated_at || ''))) {
              userProgress.srs[id] = inc;
            }
          });
        }
        if (Array.isArray(imp.local_patches)) {
          const existingIds = new Set((userProgress.local_patches || []).map(p => p.batch_id));
          imp.local_patches.forEach(lp => {
            if (!existingIds.has(lp.batch_id)) userProgress.local_patches.push(lp);
          });
        }
        saveUserProgress();
        await loadAllPatches();
        populateCardSelector();
        renderFeed();
        alert('Progress imported and merged!');
        closeModal('settingsModal');
      } catch (err) {
        alert('Import error: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
