/**
 * Daily Feed — Core Application Logic
 */

(function () {
  'use strict';

  // State
  let appConfig = {
    app_name: 'Daily Feed',
    default_card_language: 'both',
    delete_password: '123',
    srs_intervals_days: [1, 2, 3, 7, 14, 30],
    max_reviews_per_day: 50,
    github: { owner: 'Matrix-abdelatty', repo: 'daily_feed', branch: 'main' }
  };

  let topics = [];
  let indexData = { files: [] };
  let numbersMap = {};
  let searchIndex = [];
  let repoDeletedIds = new Set();

  let loadedCardsMap = new Map(); // id -> card object
  let loadedFiles = new Set();
  let filesQueue = [];
  let isLoading = false;

  // View state
  let currentLang = 'both';
  let activeTab = 'all'; // all, saved, liked, due, mistakes
  let activeTopic = null;
  let currentSearch = '';

  // Local user progress storage
  const STORAGE_KEY = 'daily_feed_progress_v1';
  let userProgress = {
    likes: {},     // id -> timestamp
    saves: {},     // id -> timestamp
    srs: {},       // id -> { stage: 0, due: 'YYYY-MM-DD', updated_at: '...' }
    mistakes: {},  // id -> timestamp
    hidden: {},    // id -> timestamp (locally deleted)
    local_cards: [], // user-composed cards
    owner_token: '',
    delete_password: '123'
  };

  // Helper: today's date string YYYY-MM-DD
  function getTodayStr() {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }

  function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  // Load progress from localStorage
  function loadUserProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        userProgress = Object.assign(userProgress, parsed);
        // Load saved language preference
        if (parsed.lang_display) {
          currentLang = parsed.lang_display;
        }
      }
    } catch (e) {
      console.error('Failed to load user progress:', e);
    }
  }

  function saveUserProgress() {
    try {
      userProgress.lang_display = currentLang;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userProgress));
      updateCounts();
    } catch (e) {
      console.error('Failed to save user progress:', e);
    }
  }

  // Fetch JSON helper
  async function fetchJSON(url) {
    const resp = await fetch(url + '?_t=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.json();
  }

  // Initialize
  async function init() {
    loadUserProgress();

    // Setup language buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
      if (btn.dataset.lang === currentLang) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      btn.addEventListener('click', () => {
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentLang = btn.dataset.lang;
        saveUserProgress();
        renderCards();
      });
    });

    // Load configs and metadata
    try {
      const [cfg, top, idx, nums, deleted, search] = await Promise.all([
        fetchJSON('config/app.config.json').catch(() => appConfig),
        fetchJSON('config/topics.json').catch(() => []),
        fetchJSON('data/index.json').catch(() => ({ files: [] })),
        fetchJSON('data/numbers.json').catch(() => ({})),
        fetchJSON('data/deleted.json').catch(() => []),
        fetchJSON('data/search.json').catch(() => [])
      ]);

      appConfig = Object.assign(appConfig, cfg);
      topics = top;
      indexData = idx;
      numbersMap = nums;
      repoDeletedIds = new Set(deleted);
      searchIndex = search;

      filesQueue = (indexData.files || []).map(f => f.path);
    } catch (err) {
      console.error('Initial data fetch error:', err);
    }

    renderTopicChips();
    populateComposerTopics();
    setupEventListeners();

    // Inject any locally created cards into loadedCardsMap
    if (Array.isArray(userProgress.local_cards)) {
      userProgress.local_cards.forEach(card => {
        loadedCardsMap.set(card.id, card);
        if (!numbersMap[card.id]) {
          numbersMap[card.id] = (Object.values(numbersMap).reduce((a, b) => Math.max(a, b), 0) || 0) + 1;
        }
      });
    }

    // Load initial batch of card files
    await loadNextBatch();
    await loadNextBatch(); // load 2nd file if exists
    updateCounts();
  }

  // Render Topic chips in navigation
  function renderTopicChips() {
    const container = document.getElementById('topicChipsContainer');
    if (!container) return;
    container.innerHTML = '';

    const allChip = document.createElement('button');
    allChip.className = 'topic-chip' + (activeTopic === null ? ' active' : '');
    allChip.innerHTML = '✨ All Topics';
    allChip.addEventListener('click', () => {
      activeTopic = null;
      document.querySelectorAll('.topic-chip').forEach(c => c.classList.remove('active'));
      allChip.classList.add('active');
      renderCards();
    });
    container.appendChild(allChip);

    topics.forEach(t => {
      const chip = document.createElement('button');
      chip.className = 'topic-chip' + (activeTopic === t.id ? ' active' : '');
      chip.innerHTML = `${t.icon || '📌'} ${t.label}`;
      chip.addEventListener('click', () => {
        if (activeTopic === t.id) {
          activeTopic = null;
          chip.classList.remove('active');
          allChip.classList.add('active');
        } else {
          activeTopic = t.id;
          document.querySelectorAll('.topic-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
        }
        renderCards();
      });
      container.appendChild(chip);
    });
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

  // Load next file batch from index queue
  async function loadNextBatch() {
    if (isLoading || filesQueue.length === 0) return;
    isLoading = true;
    const feedStatus = document.getElementById('feedStatusText');
    if (feedStatus) feedStatus.textContent = 'Loading more cards...';

    const filePath = filesQueue.shift();
    if (loadedFiles.has(filePath)) {
      isLoading = false;
      return;
    }

    try {
      const batchData = await fetchJSON(filePath);
      loadedFiles.add(filePath);
      if (batchData && Array.isArray(batchData.cards)) {
        batchData.cards.forEach(card => {
          loadedCardsMap.set(card.id, card);
        });
      }
    } catch (e) {
      console.warn(`Could not load batch ${filePath}:`, e);
    }

    isLoading = false;
    renderCards();

    if (feedStatus) {
      feedStatus.textContent = filesQueue.length > 0 ? 'Scroll down for more' : 'All caught up! 🎉';
    }
  }

  // Check if a card is visible
  function isCardHidden(id) {
    return repoDeletedIds.has(id) || !!userProgress.hidden[id];
  }

  // Get active cards list based on current filters
  function getFilteredCards() {
    const today = getTodayStr();
    let cards = Array.from(loadedCardsMap.values());

    // Filter hidden
    cards = cards.filter(c => !isCardHidden(c.id));

    // Tab filter
    if (activeTab === 'saved') {
      cards = cards.filter(c => !!userProgress.saves[c.id]);
    } else if (activeTab === 'liked') {
      cards = cards.filter(c => !!userProgress.likes[c.id]);
    } else if (activeTab === 'due') {
      cards = cards.filter(c => {
        if (!userProgress.saves[c.id]) return false;
        const s = userProgress.srs[c.id];
        return !s || (s.due && s.due <= today);
      });
    } else if (activeTab === 'mistakes') {
      cards = cards.filter(c => !!userProgress.mistakes[c.id]);
    }

    // Topic filter
    if (activeTopic) {
      cards = cards.filter(c => c.topic === activeTopic);
    }

    // Search query
    if (currentSearch.trim()) {
      const q = currentSearch.toLowerCase().trim();
      cards = cards.filter(c => {
        const enTitle = (c.en && c.en.title) ? c.en.title.toLowerCase() : '';
        const arTitle = (c.ar && c.ar.title) ? c.ar.title.toLowerCase() : '';
        const enAction = (c.en && c.en.action) ? c.en.action.toLowerCase() : '';
        const arAction = (c.ar && c.ar.action) ? c.ar.action.toLowerCase() : '';
        const tags = (c.tags || []).join(' ').toLowerCase();
        return enTitle.includes(q) || arTitle.includes(q) || enAction.includes(q) || arAction.includes(q) || tags.includes(q);
      });
    }

    // Sort by card number descending (newest on top)
    cards.sort((a, b) => {
      const numA = numbersMap[a.id] || 0;
      const numB = numbersMap[b.id] || 0;
      return numB - numA;
    });

    return cards;
  }

  // Update badge counters
  function updateCounts() {
    const today = getTodayStr();
    let all = 0, saved = 0, liked = 0, due = 0, mistakes = 0;

    loadedCardsMap.forEach(c => {
      if (isCardHidden(c.id)) return;
      all++;
      if (userProgress.saves[c.id]) {
        saved++;
        const s = userProgress.srs[c.id];
        if (!s || (s.due && s.due <= today)) due++;
      }
      if (userProgress.likes[c.id]) liked++;
      if (userProgress.mistakes[c.id]) mistakes++;
    });

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('countAll', all);
    setTxt('countSaved', saved);
    setTxt('countLiked', liked);
    setTxt('countDue', due);
    setTxt('countMistakes', mistakes);
    setTxt('srsDueCount', due);

    setTxt('statSaved', saved);
    setTxt('statDue', due);
    setTxt('statMistakes', mistakes);

    // Count mastered
    let mastered = 0;
    Object.values(userProgress.srs).forEach(s => {
      if (s.stage >= 6) mastered++;
    });
    setTxt('statMastered', mastered);
  }

  // Render cards to DOM
  function renderCards() {
    const container = document.getElementById('cardsList');
    if (!container) return;

    const cards = getFilteredCards();

    // Check banner
    const banner = document.getElementById('filterBanner');
    const bannerText = document.getElementById('filterBannerText');
    if (banner && bannerText) {
      if (activeTopic || currentSearch || activeTab !== 'all') {
        banner.classList.remove('hidden');
        let txt = `Showing: ${activeTab.toUpperCase()}`;
        if (activeTopic) txt += ` · Topic: ${activeTopic}`;
        if (currentSearch) txt += ` · Search: "${currentSearch}"`;
        txt += ` (${cards.length} cards)`;
        bannerText.textContent = txt;
      } else {
        banner.classList.add('hidden');
      }
    }

    if (cards.length === 0) {
      container.innerHTML = `
        <div class="card-item" style="text-align: center; padding: 40px 20px;">
          <p style="font-size: 24px; margin-bottom: 8px;">🔍</p>
          <h3 style="font-size: 16px; margin-bottom: 6px;">No cards found</h3>
          <p style="color: var(--text-muted); font-size: 13px;">Try clearing filters or search terms.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    cards.forEach(card => {
      container.appendChild(createCardElement(card));
    });

    updateCounts();
  }

  // Create single card DOM element
  function createCardElement(card) {
    const el = document.createElement('article');
    el.className = 'card-item';
    el.id = `card-${card.id}`;

    const num = numbersMap[card.id] || '?';
    const isLiked = !!userProgress.likes[card.id];
    const isSaved = !!userProgress.saves[card.id];
    const topicObj = topics.find(t => t.id === card.topic) || { label: card.topic, icon: '📌' };

    // Header Row
    const headerRow = document.createElement('div');
    headerRow.className = 'card-header-row';

    const metaLeft = document.createElement('div');
    metaLeft.className = 'card-meta-left';
    metaLeft.innerHTML = `
      <span class="card-number-badge">#${num}</span>
      <span class="card-topic-badge">${topicObj.icon} ${topicObj.label}</span>
      <span class="card-level-badge ${card.level || 'beginner'}">${card.level || 'beginner'}</span>
      ${card.needs_completion ? '<span class="card-level-badge intermediate">Draft / Completing</span>' : ''}
    `;

    const actionsRight = document.createElement('div');
    actionsRight.className = 'card-actions-right';

    // Like button
    const likeBtn = document.createElement('button');
    likeBtn.className = 'card-action-btn' + (isLiked ? ' liked' : '');
    likeBtn.title = isLiked ? 'Unlike' : 'Like';
    likeBtn.innerHTML = isLiked ? '❤️' : '🤍';
    likeBtn.addEventListener('click', () => toggleLike(card.id, likeBtn));

    // Save button (enables SRS quiz)
    const saveBtn = document.createElement('button');
    saveBtn.className = 'card-action-btn' + (isSaved ? ' saved' : '');
    saveBtn.title = isSaved ? 'Saved in Quiz review queue' : 'Save to review with quiz';
    saveBtn.innerHTML = isSaved ? '⭐' : '☆';
    saveBtn.addEventListener('click', () => toggleSave(card.id, saveBtn));

    // Delete button (password guard)
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'card-action-btn delete-btn';
    deleteBtn.title = 'Delete this card';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.addEventListener('click', () => confirmDeleteCard(card.id));

    actionsRight.appendChild(likeBtn);
    actionsRight.appendChild(saveBtn);
    actionsRight.appendChild(deleteBtn);

    headerRow.appendChild(metaLeft);
    headerRow.appendChild(actionsRight);
    el.appendChild(headerRow);

    // English Block
    const showEn = (currentLang === 'both' || currentLang === 'en') && card.en;
    if (showEn) {
      const enBlock = document.createElement('div');
      enBlock.className = 'content-block';

      enBlock.innerHTML = `
        <h2 class="card-title">${card.en.title || ''}</h2>
        ${card.en.hook ? `<div class="card-hook">💡 ${card.en.hook}</div>` : ''}
        ${card.en.key_phrase ? `
          <div class="card-key-phrase">
            <span class="phrase-text">💬 "${card.en.key_phrase}"</span>
            <button class="copy-phrase-btn" title="Copy to clipboard">📋 Copy</button>
          </div>` : ''}
        
        <button class="card-details-toggle" data-target="details-en-${card.id}">
          <span>Read Details & Examples ▾</span>
        </button>

        <div class="card-details-body" id="details-en-${card.id}">
          <div class="detail-row"><strong>🎯 Do / Say:</strong> ${card.en.action || ''}</div>
          ${card.en.when ? `<div class="detail-row"><strong>⏱ When:</strong> ${card.en.when}</div>` : ''}
          ${card.en.why ? `<div class="detail-row"><strong>💡 Why:</strong> ${card.en.why}</div>` : ''}
          ${card.en.example ? `<div class="detail-row"><strong>📖 Example:</strong> ${card.en.example}</div>` : ''}
          ${card.en.mistake ? `<div class="detail-row"><strong>⚠️ Avoid:</strong> ${card.en.mistake}</div>` : ''}
        </div>
      `;

      // Copy phrase action
      const cpBtn = enBlock.querySelector('.copy-phrase-btn');
      if (cpBtn) {
        cpBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(card.en.key_phrase);
          cpBtn.textContent = '✓ Copied!';
          setTimeout(() => { cpBtn.textContent = '📋 Copy'; }, 2000);
        });
      }

      // Details toggle
      const dtToggle = enBlock.querySelector('.card-details-toggle');
      const dtBody = enBlock.querySelector('.card-details-body');
      dtToggle.addEventListener('click', () => {
        const isOpen = dtBody.classList.toggle('open');
        dtToggle.querySelector('span').textContent = isOpen ? 'Hide Details ▴' : 'Read Details & Examples ▾';
      });

      el.appendChild(enBlock);
    }

    // Divider if both
    if (currentLang === 'both' && card.en && card.ar) {
      const divider = document.createElement('div');
      divider.className = 'bilingual-divider';
      el.appendChild(divider);
    }

    // Arabic Block
    const showAr = (currentLang === 'both' || currentLang === 'ar') && card.ar;
    if (showAr) {
      const arBlock = document.createElement('div');
      arBlock.className = 'content-block rtl';
      arBlock.dir = 'rtl';

      arBlock.innerHTML = `
        <h2 class="card-title">${card.ar.title || ''}</h2>
        ${card.ar.hook ? `<div class="card-hook">💡 ${card.ar.hook}</div>` : ''}
        ${card.ar.key_phrase ? `
          <div class="card-key-phrase">
            <span class="phrase-text">💬 «${card.ar.key_phrase}»</span>
            <button class="copy-phrase-btn" title="نسخ">📋 نسخ</button>
          </div>` : ''}
        
        <button class="card-details-toggle" data-target="details-ar-${card.id}">
          <span>التفاصيل والأمثلة ▾</span>
        </button>

        <div class="card-details-body" id="details-ar-${card.id}">
          <div class="detail-row"><strong>🎯 الخطوة:</strong> ${card.ar.action || ''}</div>
          ${card.ar.when ? `<div class="detail-row"><strong>⏱ التوقيت:</strong> ${card.ar.when}</div>` : ''}
          ${card.ar.why ? `<div class="detail-row"><strong>💡 ليه بتشتغل:</strong> ${card.ar.why}</div>` : ''}
          ${card.ar.example ? `<div class="detail-row"><strong>📖 مثال عملي:</strong> ${card.ar.example}</div>` : ''}
          ${card.ar.mistake ? `<div class="detail-row"><strong>⚠️ الغلطة:</strong> ${card.ar.mistake}</div>` : ''}
        </div>
      `;

      // Copy phrase action
      const cpBtn = arBlock.querySelector('.copy-phrase-btn');
      if (cpBtn) {
        cpBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(card.ar.key_phrase);
          cpBtn.textContent = '✓ تم النسخ!';
          setTimeout(() => { cpBtn.textContent = '📋 نسخ'; }, 2000);
        });
      }

      // Details toggle
      const dtToggle = arBlock.querySelector('.card-details-toggle');
      const dtBody = arBlock.querySelector('.card-details-body');
      dtToggle.addEventListener('click', () => {
        const isOpen = dtBody.classList.toggle('open');
        dtToggle.querySelector('span').textContent = isOpen ? 'إخفاء التفاصيل ▴' : 'التفاصيل والأمثلة ▾';
      });

      el.appendChild(arBlock);
    }

    // Quiz Section
    if (card.quiz) {
      const quizSection = renderQuizSection(card);
      el.appendChild(quizSection);
    }

    return el;
  }

  // Render Interactive MCQ Quiz section for a card
  function renderQuizSection(card) {
    const wrap = document.createElement('div');
    wrap.className = 'quiz-section';

    const isQuizAr = currentLang === 'ar';
    const qData = (isQuizAr && card.quiz.ar) ? card.quiz.ar : card.quiz.en;
    if (!qData) return wrap;

    const srsState = userProgress.srs[card.id] || { stage: 0 };
    const stageDays = appConfig.srs_intervals_days || [1, 2, 3, 7, 14, 30];
    const nextInterval = stageDays[srsState.stage] || 30;

    wrap.innerHTML = `
      <div class="quiz-header">
        <span class="quiz-badge">🧠 Quiz Check</span>
        <span class="quiz-srs-status">Stage ${srsState.stage}/6 · Next review: ${nextInterval}d</span>
      </div>
      <p class="quiz-question">${qData.question}</p>
      <div class="quiz-options">
        ${(qData.options || []).map((opt, idx) => `
          <button class="quiz-opt-btn" data-idx="${idx}">${String.fromCharCode(65 + idx)}. ${opt}</button>
        `).join('')}
      </div>
      <div class="quiz-feedback"></div>
    `;

    const feedbackEl = wrap.querySelector('.quiz-feedback');
    const optionBtns = wrap.querySelectorAll('.quiz-opt-btn');

    optionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen = parseInt(btn.dataset.idx, 10);
        const correct = card.quiz.correct_index;

        optionBtns.forEach(b => b.disabled = true);

        if (chosen === correct) {
          btn.classList.add('correct');
          feedbackEl.className = 'quiz-feedback show success';
          feedbackEl.innerHTML = `
            <strong>✓ Correct!</strong> ${qData.explanation || ''}
            <div style="margin-top: 4px; font-size: 11px;">Advancing review interval to <strong>${nextInterval} days</strong>!</div>
          `;
          handleSrsAnswer(card.id, true);
        } else {
          btn.classList.add('wrong');
          if (optionBtns[correct]) optionBtns[correct].classList.add('correct');
          feedbackEl.className = 'quiz-feedback show fail';
          feedbackEl.innerHTML = `
            <strong>✕ Not quite.</strong> ${qData.explanation || ''}
            <div style="margin-top: 4px; font-size: 11px;">Moved to "Retry Mistakes" queue to master today.</div>
          `;
          handleSrsAnswer(card.id, false);
        }
      });
    });

    return wrap;
  }

  // Spaced repetition progression handler
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

  // Actions: Like
  function toggleLike(id, btnEl) {
    if (userProgress.likes[id]) {
      delete userProgress.likes[id];
      btnEl.classList.remove('liked');
      btnEl.innerHTML = '🤍';
    } else {
      userProgress.likes[id] = Date.now();
      btnEl.classList.add('liked');
      btnEl.innerHTML = '❤️';
    }
    saveUserProgress();
  }

  // Actions: Save (enters SRS queue)
  function toggleSave(id, btnEl) {
    if (userProgress.saves[id]) {
      delete userProgress.saves[id];
      btnEl.classList.remove('saved');
      btnEl.innerHTML = '☆';
    } else {
      userProgress.saves[id] = Date.now();
      btnEl.classList.add('saved');
      btnEl.innerHTML = '⭐';

      // Initialize in SRS queue
      if (!userProgress.srs[id]) {
        userProgress.srs[id] = {
          stage: 0,
          due: getTodayStr(),
          updated_at: new Date().toISOString()
        };
      }
    }
    saveUserProgress();
  }

  // Actions: Delete single card (password prompt)
  async function confirmDeleteCard(cardId) {
    const expectedPass = userProgress.delete_password || appConfig.delete_password || '123';
    const entered = window.prompt(`Delete Card Confirmation:\nEnter password (default is ${expectedPass}):`);

    if (entered === null) return; // User cancelled
    if (entered !== expectedPass) {
      alert('Incorrect password. Card was not deleted.');
      return;
    }

    // Soft delete locally
    userProgress.hidden[cardId] = Date.now();
    saveUserProgress();

    // If owner token is present, sync delete to GitHub repository
    if (userProgress.owner_token && appConfig.github) {
      try {
        await syncDeleteToGitHub(cardId);
        alert('Card deleted locally and synced to GitHub repository deleted.json!');
      } catch (err) {
        console.error('Owner GitHub delete sync error:', err);
        alert(`Card deleted locally! (GitHub sync notice: ${err.message})`);
      }
    } else {
      alert('Card hidden from your feed.');
    }

    renderCards();
  }

  // Sync delete to GitHub repository via Contents API
  async function syncDeleteToGitHub(cardId) {
    const { owner, repo, branch = 'main' } = appConfig.github;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/data/deleted.json`;
    const token = userProgress.owner_token;

    // 1. Get existing deleted.json and SHA
    const getResp = await fetch(url + `?ref=${branch}`, {
      headers: { Authorization: `token ${token}` }
    });
    if (!getResp.ok) throw new Error(`Could not fetch deleted.json from GitHub (${getResp.status})`);
    const fileData = await getResp.json();
    const existingList = JSON.parse(atob(fileData.content));

    if (!existingList.includes(cardId)) {
      existingList.push(cardId);
      const updatedContentBase64 = btoa(JSON.stringify(existingList, null, 2) + '\n');

      const putResp = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Soft delete card ${cardId}`,
          content: updatedContentBase64,
          sha: fileData.sha,
          branch
        })
      });
      if (!putResp.ok) throw new Error(`GitHub commit failed (${putResp.status})`);
    }
  }

  // Event Listeners Setup
  function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        if (clearSearchBtn) {
          clearSearchBtn.style.display = currentSearch ? 'block' : 'none';
        }
        renderCards();
      });
    }
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        currentSearch = '';
        clearSearchBtn.style.display = 'none';
        renderCards();
      });
    }

    // Reset filter banner button
    const resetFilterBtn = document.getElementById('resetFilterBtn');
    if (resetFilterBtn) {
      resetFilterBtn.addEventListener('click', () => {
        activeTab = 'all';
        activeTopic = null;
        currentSearch = '';
        if (searchInput) searchInput.value = '';
        if (clearSearchBtn) clearSearchBtn.style.display = 'none';
        document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.feed-tab[data-tab="all"]').classList.add('active');
        document.querySelectorAll('.topic-chip').forEach(c => c.classList.remove('active'));
        const allChip = document.querySelector('.topic-chip');
        if (allChip) allChip.classList.add('active');
        renderCards();
      });
    }

    // Feed Tabs
    document.querySelectorAll('.feed-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTab = tab.dataset.tab;
        renderCards();
      });
    });

    // Modals
    setupModal('btnComposer', 'composerModal');
    setupModal('btnSrsStats', 'srsModal');
    setupModal('btnSettings', 'settingsModal');

    // Review session button from SRS modal
    const startReviewBtn = document.getElementById('btnStartDueReview');
    if (startReviewBtn) {
      startReviewBtn.addEventListener('click', () => {
        closeModal('srsModal');
        activeTab = 'due';
        document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
        const dueTab = document.querySelector('.feed-tab[data-tab="due"]');
        if (dueTab) dueTab.classList.add('active');
        renderCards();
      });
    }

    // Composer Form Submit
    const compForm = document.getElementById('composerForm');
    if (compForm) {
      compForm.addEventListener('submit', handleComposerSubmit);
    }

    // Export Progress
    const btnExportProgress = document.getElementById('btnExportProgress');
    if (btnExportProgress) {
      btnExportProgress.addEventListener('click', exportProgressJSON);
    }

    // Export All Content
    const btnExportAllContent = document.getElementById('btnExportAllContent');
    if (btnExportAllContent) {
      btnExportAllContent.addEventListener('click', exportAllContentJSON);
    }

    // Import Progress
    const btnTriggerImport = document.getElementById('btnTriggerImport');
    const importFileInput = document.getElementById('importFileInput');
    if (btnTriggerImport && importFileInput) {
      btnTriggerImport.addEventListener('click', () => importFileInput.click());
      importFileInput.addEventListener('change', handleImportProgressFile);
    }

    // Save Settings
    const btnSaveSettings = document.getElementById('btnSaveSettings');
    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', () => {
        const pass = document.getElementById('settingDeletePassword').value.trim();
        const token = document.getElementById('settingOwnerToken').value.trim();
        if (pass) userProgress.delete_password = pass;
        userProgress.owner_token = token;
        saveUserProgress();
        alert('Settings saved successfully!');
        closeModal('settingsModal');
      });
    }

    // Restore hidden cards
    const btnRestoreHidden = document.getElementById('btnRestoreHidden');
    if (btnRestoreHidden) {
      btnRestoreHidden.addEventListener('click', () => {
        userProgress.hidden = {};
        saveUserProgress();
        alert('All locally hidden cards restored!');
        renderCards();
      });
    }

    // Infinite scroll
    window.addEventListener('scroll', () => {
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 400) {
        loadNextBatch();
      }
    });
  }

  function setupModal(triggerBtnId, modalId) {
    const trigger = document.getElementById(triggerBtnId);
    const modal = document.getElementById(modalId);
    if (!trigger || !modal) return;

    trigger.addEventListener('click', () => modal.classList.add('open'));
    modal.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => modal.classList.remove('open'));
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
  }

  // Handle composer submission
  async function handleComposerSubmit(e) {
    e.preventDefault();
    const today = getTodayStr();
    const topic = document.getElementById('compTopic').value;
    const level = document.getElementById('compLevel').value;
    const rawTags = document.getElementById('compTags').value;
    const tags = rawTags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    const enTitle = document.getElementById('compEnTitle').value.trim();
    const enHook = document.getElementById('compEnHook').value.trim();
    const enKeyPhrase = document.getElementById('compEnKeyPhrase').value.trim();
    const enAction = document.getElementById('compEnAction').value.trim();
    const enWhen = document.getElementById('compEnWhen').value.trim();
    const enWhy = document.getElementById('compEnWhy').value.trim();
    const enExample = document.getElementById('compEnExample').value.trim();
    const enMistake = document.getElementById('compEnMistake').value.trim();

    const arTitle = document.getElementById('compArTitle').value.trim();
    const arHook = document.getElementById('compArHook').value.trim();
    const arKeyPhrase = document.getElementById('compArKeyPhrase').value.trim();
    const arAction = document.getElementById('compArAction').value.trim();
    const arWhen = document.getElementById('compArWhen').value.trim();
    const arWhy = document.getElementById('compArWhy').value.trim();
    const arExample = document.getElementById('compArExample').value.trim();
    const arMistake = document.getElementById('compArMistake').value.trim();

    const slug = enTitle.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 30);
    const cardId = `${today}_${topic}_${slug || 'custom'}-${Date.now().toString().slice(-4)}`;

    const needsCompletion = !arTitle || !arAction;

    const newCard = {
      id: cardId,
      created_at: new Date().toISOString(),
      topic,
      tags: tags.length ? tags : [topic],
      level,
      needs_completion: needsCompletion,
      en: {
        title: enTitle,
        hook: enHook,
        key_phrase: enKeyPhrase,
        action: enAction,
        when: enWhen,
        why: enWhy,
        example: enExample,
        mistake: enMistake
      },
      ar: {
        title: arTitle || enTitle,
        hook: arHook || enHook,
        key_phrase: arKeyPhrase || enKeyPhrase,
        action: arAction || enAction,
        when: arWhen || enWhen,
        why: arWhy || enWhy,
        example: arExample || enExample,
        mistake: arMistake || enMistake
      },
      quiz: {
        type: 'mcq',
        correct_index: 0,
        en: {
          question: `What is the core takeaway of "${enTitle}"?`,
          options: [
            enAction.slice(0, 80) || 'Follow the recommended action.',
            'Wait for the other party to make the first move.',
            'Defend your position aggressively.',
            'Give an immediate concession.'
          ],
          explanation: enWhy || 'This technique aligns incentives and protects your position.'
        },
        ar: {
          question: `إيه هو الدرس الأساسي من «${arTitle || enTitle}»؟`,
          options: [
            arAction.slice(0, 80) || 'تنفيذ الإجراء الموصى به.',
            'الانتظار لحد ما الطرف التاني يبدأ.',
            'الدخول في جدال لإثبات وجهة النظر.',
            'التنازل الفوري بدون مقابل.'
          ],
          explanation: arWhy || 'الأسلوب ده بيحمي قيمتك وبيحقق نتيجة أفضل.'
        }
      }
    };

    // Assign temporary or permanent number
    const maxNum = Object.values(numbersMap).reduce((a, b) => Math.max(a, b), 0) || 0;
    numbersMap[newCard.id] = maxNum + 1;

    // Save locally
    if (!Array.isArray(userProgress.local_cards)) userProgress.local_cards = [];
    userProgress.local_cards.unshift(newCard);
    loadedCardsMap.set(newCard.id, newCard);
    saveUserProgress();

    closeModal('composerModal');
    e.target.reset();
    renderCards();

    alert(`Card published! Assigned number #${numbersMap[newCard.id]}.`);
  }

  // Export Progress JSON
  function exportProgressJSON() {
    const exportData = {
      schema_version: 1,
      exported_at: new Date().toISOString(),
      likes: userProgress.likes,
      saves: userProgress.saves,
      srs: userProgress.srs,
      mistakes: userProgress.mistakes,
      hidden: userProgress.hidden,
      local_cards: userProgress.local_cards || []
    };
    downloadJSON(exportData, `daily-feed-progress-${getTodayStr()}.json`);
  }

  // Export All Visible Content JSON
  function exportAllContentJSON() {
    const all = Array.from(loadedCardsMap.values()).map(c => {
      const copy = Object.assign({}, c);
      copy.permanent_number = numbersMap[c.id] || 0;
      return copy;
    });
    const exportData = {
      schema_version: 1,
      exported_at: new Date().toISOString(),
      total_cards: all.length,
      cards: all
    };
    downloadJSON(exportData, `daily-feed-all-cards-${getTodayStr()}.json`);
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

  // Handle Import Progress with Merge logic
  function handleImportProgressFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
      try {
        const imported = JSON.parse(event.target.result);
        if (!imported || typeof imported !== 'object') {
          throw new Error('Invalid JSON format');
        }

        // Merge logic: union items, preserve existing progress
        let addedLikes = 0, addedSaves = 0, addedSrs = 0;

        if (imported.likes) {
          Object.keys(imported.likes).forEach(id => {
            if (!userProgress.likes[id]) {
              userProgress.likes[id] = imported.likes[id];
              addedLikes++;
            }
          });
        }

        if (imported.saves) {
          Object.keys(imported.saves).forEach(id => {
            if (!userProgress.saves[id]) {
              userProgress.saves[id] = imported.saves[id];
              addedSaves++;
            }
          });
        }

        if (imported.srs) {
          Object.keys(imported.srs).forEach(id => {
            const existing = userProgress.srs[id];
            const incoming = imported.srs[id];
            if (!existing || (incoming.updated_at && incoming.updated_at > (existing.updated_at || ''))) {
              userProgress.srs[id] = incoming;
              addedSrs++;
            }
          });
        }

        if (imported.mistakes) {
          userProgress.mistakes = Object.assign({}, userProgress.mistakes, imported.mistakes);
        }

        if (imported.hidden) {
          userProgress.hidden = Object.assign({}, userProgress.hidden, imported.hidden);
        }

        if (Array.isArray(imported.local_cards)) {
          const currentIds = new Set((userProgress.local_cards || []).map(c => c.id));
          imported.local_cards.forEach(c => {
            if (!currentIds.has(c.id)) {
              userProgress.local_cards.push(c);
              loadedCardsMap.set(c.id, c);
            }
          });
        }

        saveUserProgress();
        renderCards();
        alert(`Progress imported & merged successfully!\n+${addedLikes} likes, +${addedSaves} saves, +${addedSrs} SRS updates.`);
        closeModal('settingsModal');
      } catch (err) {
        alert('Failed to import progress file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  }

  // Start app on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
