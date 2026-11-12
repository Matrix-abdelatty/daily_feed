/**
 * Daily Feed — Patch Loading, Grouping, Navigation & Feed Rendering
 * Module: js/patches.js (~260 lines)
 */
(function (global) {
  'use strict';

  const DailyFeed = global.DailyFeed = global.DailyFeed || {};
  const state = DailyFeed.state;

  DailyFeed.isPatchFinished = function (batchId) {
    return !!state.userProgress.finished_patches[batchId];
  };

  DailyFeed.loadAllPatches = async function () {
    state.isLoading = true;
    const statusEl = document.getElementById('feedStatusText');
    if (statusEl) statusEl.textContent = 'Loading patches...';

    const files = state.indexData.files || [];
    const loadedRepoPatches = [];

    await Promise.all(files.map(async (fileMeta) => {
      try {
        const batchData = await DailyFeed.fetchJSON(fileMeta.path);
        const cards = (batchData && Array.isArray(batchData.cards)) ? batchData.cards : [];
        cards.forEach(c => {
          c._patch_id = fileMeta.batch_id;
          c._patch_number = fileMeta.patch_number;
          state.loadedCardsMap.set(c.id, c);
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

    // Merge local uploaded patches
    const repoBatchIds = new Set(loadedRepoPatches.map(p => p.batch_id));
    let maxPatchNum = loadedRepoPatches.reduce((m, p) => Math.max(m, p.patch_number || 0), 0);
    let maxCardNum = Object.values(state.numbersMap).reduce((m, n) => Math.max(m, n || 0), 0);

    const localPatches = [];
    (state.userProgress.local_patches || []).forEach(lp => {
      if (repoBatchIds.has(lp.batch_id)) return;
      maxPatchNum += 1;
      const pNum = lp.patch_number || maxPatchNum;
      const cards = lp.cards || [];
      cards.forEach(c => {
        if (!state.numbersMap[c.id]) {
          maxCardNum += 1;
          state.numbersMap[c.id] = maxCardNum;
        }
        c._patch_id = lp.batch_id;
        c._patch_number = pNum;
        state.loadedCardsMap.set(c.id, c);
      });
      localPatches.push({
        patch_number: pNum,
        batch_id: lp.batch_id,
        path: 'local browser',
        date: lp.date || (lp.created_at || '').slice(0, 10) || DailyFeed.getTodayStr(),
        created_at: lp.created_at || new Date().toISOString(),
        source: lp.source || 'manual-ui',
        cards: cards
      });
    });

    state.patchesList = [...localPatches, ...loadedRepoPatches];
    state.patchesList.sort((a, b) => (b.patch_number || 0) - (a.patch_number || 0));

    state.isLoading = false;
    if (statusEl) {
      statusEl.textContent = `${state.patchesList.length} Patches (${state.loadedCardsMap.size} Cards) Loaded`;
    }
  };

  DailyFeed.updateCountsAndStatusBar = function () {
    const today = DailyFeed.getTodayStr();

    let newPatchesCount = 0;
    let seenPatchesCount = 0;
    let savedCardsCount = 0;
    let dueSrsCount = 0;
    let todayPatchesCount = 0;
    let todayCardsCount = 0;

    state.patchesList.forEach(p => {
      const visibleCards = p.cards.filter(c => !DailyFeed.isCardHidden(c.id));
      if (visibleCards.length === 0) return;

      if (DailyFeed.isPatchFinished(p.batch_id)) {
        seenPatchesCount++;
      } else {
        newPatchesCount++;
      }

      if (p.date === today) {
        todayPatchesCount++;
        todayCardsCount += visibleCards.length;
      }
    });

    state.loadedCardsMap.forEach(c => {
      if (DailyFeed.isCardHidden(c.id)) return;
      if (state.userProgress.saves[c.id]) {
        savedCardsCount++;
      }
    });

    if (typeof DailyFeed.getReviewPoolCards === 'function') {
      DailyFeed.getReviewPoolCards().forEach(c => {
        const s = state.userProgress.srs[c.id];
        if (!s || (s.due && s.due <= today)) {
          dueSrsCount++;
        }
      });
    }

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('countNew', newPatchesCount);
    setTxt('countSeen', seenPatchesCount);
    setTxt('countSaved', savedCardsCount);
    setTxt('srsDueCount', dueSrsCount);

    const dotEl = document.getElementById('todayStatusDot');
    const txtEl = document.getElementById('todayStatusText');
    const targetPatches = state.indexData.batches_per_day_target || 3;

    if (txtEl && dotEl) {
      const latestPatch = state.patchesList[0];
      const latestDate = latestPatch ? latestPatch.date : 'None';
      if (todayPatchesCount > 0) {
        dotEl.className = 'status-dot';
        txtEl.innerHTML = `<strong>Today (${today}):</strong> ${todayPatchesCount} Patch${todayPatchesCount > 1 ? 'es' : ''} Added (+${todayCardsCount} cards) · Total: ${state.patchesList.length} Patches`;
      } else {
        dotEl.className = 'status-dot pending';
        txtEl.innerHTML = `<strong>Today (${today}):</strong> 0/${targetPatches} Patches Added yet · Last added: ${latestDate} (${state.patchesList.length} Patches total)`;
      }
    }
  };

  DailyFeed.switchTab = function (tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('.feed-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });
    DailyFeed.renderFeed();
  };

  DailyFeed.renderFeed = function () {
    const container = document.getElementById('cardsList');
    if (!container) return;
    container.innerHTML = '';

    // Topic button indicator
    const topicBtn = document.getElementById('btnTopicsPicker');
    const topicLabel = document.getElementById('activeTopicLabel');
    if (topicBtn && topicLabel) {
      if (state.activeTopic) {
        const tObj = state.topics.find(t => t.id === state.activeTopic) || { label: state.activeTopic, icon: '🏷️' };
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
      if (state.activeTopic) {
        banner.classList.remove('hidden');
        bannerText.textContent = `Filtered by Topic: ${state.activeTopic}`;
      } else {
        banner.classList.add('hidden');
      }
    }

    if (state.activeTab === 'saved' || state.activeTopic) {
      DailyFeed.renderFilteredCardsView(container);
      return;
    }

    const targetPatches = state.patchesList.filter(p => {
      const visible = p.cards.filter(c => !DailyFeed.isCardHidden(c.id));
      if (visible.length === 0) return false;
      const done = DailyFeed.isPatchFinished(p.batch_id);
      return state.activeTab === 'seen' ? done : !done;
    });

    if (targetPatches.length === 0) {
      if (state.activeTab === 'new') {
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
        document.getElementById('emptyGoQuizBtn')?.addEventListener('click', () => DailyFeed.openQuizHubModal());
        document.getElementById('emptyGoSeenBtn')?.addEventListener('click', () => DailyFeed.switchTab('seen'));
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

    if (state.activeTab === 'new') {
      if (state.activePatchIdx >= targetPatches.length) state.activePatchIdx = 0;
      if (state.activePatchIdx < 0) state.activePatchIdx = 0;
      const currentPatch = targetPatches[state.activePatchIdx];
      container.appendChild(DailyFeed.createPatchGroupElement(currentPatch, state.activePatchIdx, targetPatches));
    } else {
      targetPatches.forEach(patch => {
        container.appendChild(DailyFeed.createPatchGroupElement(patch));
      });
    }
  };

  DailyFeed.renderFilteredCardsView = function (container) {
    let cards = Array.from(state.loadedCardsMap.values()).filter(c => !DailyFeed.isCardHidden(c.id));

    if (state.activeTab === 'saved') {
      cards = cards.filter(c => !!state.userProgress.saves[c.id]);
    }

    if (state.activeTopic) {
      cards = cards.filter(c => c.topic === state.activeTopic);
    }

    cards.sort((a, b) => (state.numbersMap[b.id] || 0) - (state.numbersMap[a.id] || 0));

    if (cards.length === 0) {
      container.innerHTML = `
        <div class="card-item" style="text-align: center; padding: 36px 18px;">
          <p style="font-size: 24px; margin-bottom: 8px;">🏷️</p>
          <h3 style="font-size: 16px; margin-bottom: 6px;">No matching cards</h3>
          <p style="color: var(--text-secondary); font-size: 13px;">
            ${state.activeTab === 'saved' ? 'Tap 🔖 Save on any card to bookmark it here.' : 'Try resetting your topic filter.'}
          </p>
        </div>
      `;
      return;
    }

    cards.forEach(card => {
      container.appendChild(DailyFeed.createCardElement(card));
    });
  };

  DailyFeed.createPatchGroupElement = function (patch, patchIdx, allPatches) {
    const visibleCards = patch.cards
      .filter(c => !DailyFeed.isCardHidden(c.id))
      .sort((a, b) => (state.numbersMap[a.id] || 0) - (state.numbersMap[b.id] || 0));

    const nums = visibleCards.map(c => state.numbersMap[c.id] || 0).filter(Boolean);
    const minNum = nums.length ? Math.min(...nums) : '?';
    const maxNum = nums.length ? Math.max(...nums) : '?';

    const doneInfo = state.userProgress.finished_patches[patch.batch_id];
    const isDone = !!doneInfo;
    const isCollapsed = isDone && !state.expandedPatches.has(patch.batch_id);

    const wrap = document.createElement('section');
    wrap.className = 'patch-group' + (isDone ? ' finished-patch' : '') + (isCollapsed ? ' collapsed' : '');
    wrap.id = `patch-${patch.batch_id}`;

    const scoreBadge = (doneInfo && typeof doneInfo.score === 'number')
      ? ` · Quiz: ${doneInfo.score}/${doneInfo.total}`
      : '';

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
        state.expandedPatches.delete(patch.batch_id);
      } else {
        state.expandedPatches.add(patch.batch_id);
      }
      const btn = header.querySelector('.patch-collapse-btn');
      if (btn) btn.textContent = nowCollapsed ? '▾ Expand' : '▴ Collapse';
    });

    wrap.appendChild(header);

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
      DailyFeed.startPatchQuizSession(patch, visibleCards);
    });
    collapsedBar.querySelector('.btn-unfinish-collapsed').addEventListener('click', (e) => {
      e.stopPropagation();
      DailyFeed.toggleFinishPatch(patch, visibleCards);
    });
    wrap.appendChild(collapsedBar);

    const cardsWrapper = document.createElement('div');
    cardsWrapper.className = 'patch-cards-wrapper';
    visibleCards.forEach(card => {
      cardsWrapper.appendChild(DailyFeed.createCardElement(card));
    });
    wrap.appendChild(cardsWrapper);

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
      DailyFeed.startPatchQuizSession(patch, visibleCards);
    });

    footer.querySelector('.finish-btn').addEventListener('click', () => {
      DailyFeed.toggleFinishPatch(patch, visibleCards);
    });

    if (state.activeTab === 'new' && allPatches && allPatches.length > 1 && typeof patchIdx === 'number') {
      const navBar = document.createElement('div');
      navBar.className = 'patch-nav-bar';

      const hasPrev = patchIdx < allPatches.length - 1;
      const hasNext = patchIdx > 0;

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
          state.activePatchIdx = patchIdx + 1;
          DailyFeed.renderFeed();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });

      navBar.querySelector('.next-btn')?.addEventListener('click', () => {
        if (hasNext) {
          state.activePatchIdx = patchIdx - 1;
          DailyFeed.renderFeed();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });

      footer.appendChild(navBar);
    }

    wrap.appendChild(footer);
    return wrap;
  };

  DailyFeed.toggleFinishPatch = function (patch, visibleCards, quizScoreObj) {
    const batchId = patch.batch_id;
    const today = DailyFeed.getTodayStr();

    if (state.userProgress.finished_patches[batchId] && !quizScoreObj) {
      delete state.userProgress.finished_patches[batchId];
      state.expandedPatches.delete(batchId);
      DailyFeed.saveUserProgress();
      DailyFeed.renderFeed();
      return;
    }

    state.userProgress.finished_patches[batchId] = {
      finished_at: new Date().toISOString(),
      score: quizScoreObj ? quizScoreObj.score : undefined,
      total: quizScoreObj ? quizScoreObj.total : visibleCards.length
    };

    visibleCards.forEach(c => {
      if (!state.userProgress.srs[c.id]) {
        state.userProgress.srs[c.id] = {
          stage: 0,
          due: today,
          updated_at: new Date().toISOString()
        };
      }
    });

    state.expandedPatches.delete(batchId);
    DailyFeed.saveUserProgress();
    DailyFeed.renderFeed();
  };

})(window);

