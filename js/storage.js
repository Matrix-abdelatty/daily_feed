/**
 * Daily Feed — Local Storage, Export & Import Manager
 * Module: js/storage.js (~130 lines)
 */
(function (global) {
  'use strict';

  const DailyFeed = global.DailyFeed = global.DailyFeed || {};
  const state = DailyFeed.state;

  const STORAGE_KEY = 'daily_feed_progress_v2';
  const LEGACY_KEY = 'daily_feed_progress_v1';

  DailyFeed.loadUserProgress = function () {
    try {
      const rawV2 = localStorage.getItem(STORAGE_KEY);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        state.userProgress = Object.assign(state.userProgress, parsed);
        state.userProgress.saves = state.userProgress.saves || {};
        state.userProgress.theme = state.userProgress.theme || 'ivory';
        if (state.userProgress.lang_display === 'both') state.userProgress.lang_display = 'en';
      } else {
        // Migrate from legacy v1 if present
        const rawV1 = localStorage.getItem(LEGACY_KEY);
        if (rawV1) {
          const v1 = JSON.parse(rawV1);
          state.userProgress.saves = Object.assign({}, v1.saves || {}, v1.likes || {});
          state.userProgress.srs = v1.srs || {};
          state.userProgress.mistakes = v1.mistakes || {};
          state.userProgress.hidden = v1.hidden || {};
          state.userProgress.owner_token = v1.owner_token || '';
          state.userProgress.delete_password = v1.delete_password || '123';
          if (Array.isArray(v1.local_cards) && v1.local_cards.length > 0) {
            state.userProgress.local_patches = [{
              batch_id: 'local_custom_01',
              date: DailyFeed.getTodayStr(),
              created_at: new Date().toISOString(),
              source: 'manual',
              cards: v1.local_cards
            }];
          }
        }
      }
      if (state.userProgress.lang_display) {
        state.currentLang = state.userProgress.lang_display;
      }
    } catch (e) {
      console.error('Failed to load user progress:', e);
    }
  };

  DailyFeed.saveUserProgress = function () {
    try {
      state.userProgress.lang_display = state.currentLang;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.userProgress));
      if (typeof DailyFeed.updateCountsAndStatusBar === 'function') {
        DailyFeed.updateCountsAndStatusBar();
      }
    } catch (e) {
      console.error('Failed to save user progress:', e);
    }
  };

  DailyFeed.downloadJSON = function (data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  DailyFeed.exportProgressJSON = function () {
    const data = {
      schema_version: 2,
      exported_at: new Date().toISOString(),
      saves: state.userProgress.saves,
      finished_patches: state.userProgress.finished_patches,
      srs: state.userProgress.srs,
      mistakes: state.userProgress.mistakes,
      hidden: state.userProgress.hidden,
      local_patches: state.userProgress.local_patches || []
    };
    DailyFeed.downloadJSON(data, `daily-feed-progress-${DailyFeed.getTodayStr()}.json`);
  };

  DailyFeed.exportAllContentJSON = function () {
    const allPatches = state.patchesList.map(p => ({
      patch_number: p.patch_number,
      batch_id: p.batch_id,
      date: p.date,
      source: p.source,
      cards: p.cards.map(c => Object.assign({ permanent_number: state.numbersMap[c.id] || 0 }, c))
    }));
    DailyFeed.downloadJSON({
      schema_version: 2,
      exported_at: new Date().toISOString(),
      total_patches: allPatches.length,
      total_cards: state.loadedCardsMap.size,
      patches: allPatches
    }, `daily-feed-all-patches-${DailyFeed.getTodayStr()}.json`);
  };

  DailyFeed.handleImportProgressFile = function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const imp = JSON.parse(ev.target.result);
        if (!imp || typeof imp !== 'object') throw new Error('Invalid JSON object');
        state.userProgress.saves = Object.assign({}, state.userProgress.saves, imp.saves || {}, imp.likes || {});
        state.userProgress.finished_patches = Object.assign({}, state.userProgress.finished_patches, imp.finished_patches || {});
        state.userProgress.mistakes = Object.assign({}, state.userProgress.mistakes, imp.mistakes || {});
        state.userProgress.hidden = Object.assign({}, state.userProgress.hidden, imp.hidden || {});
        if (imp.srs) {
          Object.keys(imp.srs).forEach(id => {
            const cur = state.userProgress.srs[id];
            const inc = imp.srs[id];
            if (!cur || (inc.updated_at && inc.updated_at > (cur.updated_at || ''))) {
              state.userProgress.srs[id] = inc;
            }
          });
        }
        if (Array.isArray(imp.local_patches)) {
          const existingIds = new Set((state.userProgress.local_patches || []).map(p => p.batch_id));
          imp.local_patches.forEach(lp => {
            if (!existingIds.has(lp.batch_id)) state.userProgress.local_patches.push(lp);
          });
        }
        DailyFeed.saveUserProgress();
        if (typeof DailyFeed.loadAllPatches === 'function') await DailyFeed.loadAllPatches();
        if (typeof DailyFeed.populateCardSelector === 'function') DailyFeed.populateCardSelector();
        if (typeof DailyFeed.renderFeed === 'function') DailyFeed.renderFeed();
        alert('Progress imported and merged!');
        if (typeof DailyFeed.closeModal === 'function') DailyFeed.closeModal('settingsModal');
      } catch (err) {
        alert('Import error: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

})(window);
