/**
 * Daily Feed — Global State & Shared Utilities
 * Module: js/state.js (~85 lines)
 */
(function (global) {
  'use strict';

  const DailyFeed = global.DailyFeed = global.DailyFeed || {};

  DailyFeed.state = {
    // App Config & Topics
    appConfig: {
      app_name: 'Daily Feed',
      default_card_language: 'both',
      delete_password: '123',
      srs_intervals_days: [1, 2, 3, 7, 14, 30],
      max_reviews_per_day: 50,
      github: { owner: 'Matrix-abdelatty', repo: 'daily_feed', branch: 'main' }
    },
    topics: [],
    indexData: { files: [], batches_per_day_target: 3, batch_size_target: 5 },
    numbersMap: {},
    repoDeletedIds: new Set(),
    buildReport: { skipped_details: [] },

    // Loaded Patches & Cards
    patchesList: [],
    loadedCardsMap: new Map(),
    isLoading: false,

    // UI View State
    currentLang: 'en', // 'en' | 'ar' (Single language only)
    activeTab: 'new',  // 'new' | 'seen' | 'saved'
    activeTopic: null,
    activePatchIdx: 0,
    expandedPatches: new Set(),

    // User Progress & Storage State
    userProgress: {
      theme: 'ivory',
      saves: {},
      finished_patches: {},
      srs: {},
      mistakes: {},
      hidden: {},
      local_patches: [],
      owner_token: '',
      delete_password: '123',
      lang_display: 'en'
    }
  };

  // Date Helpers
  DailyFeed.getTodayStr = function () {
    const d = new Date();
    return d.toISOString().split('T')[0];
  };

  DailyFeed.addDays = function (dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  DailyFeed.fetchJSON = async function (url) {
    const resp = await fetch(url + '?_t=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return await resp.json();
  };

})(window);

