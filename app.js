/**
 * Daily Feed — Architecture Note & Compatibility Loader
 *
 * NOTE: The monolithic app.js (1,850+ lines) has been split into modular scripts in `js/`
 * to avoid rereading large files, reduce token usage, and prevent editing mistakes:
 *
 *   📁 js/state.js    (~70 lines)   Shared reactive state, metadata & date helpers
 *   📁 js/storage.js  (~130 lines)  localStorage persistence, JSON export & import merge
 *   📁 js/theme.js    (~35 lines)   5 UI & reading color themes (Ivory, Midnight, Paper, Sepia, Forest)
 *   📁 js/cards.js    (~215 lines)  Card rendering, bookmarks, deletes, jump selector
 *   📁 js/patches.js  (~260 lines)  5-Card patch grouping, navigation & feed rendering
 *   📁 js/quiz.js     (~220 lines)  Patch quizzes & Combined Spaced Repetition review hub
 *   📁 js/modals.js   (~260 lines)  Topic picker, history log, JSON upload & GitHub sync
 *   📁 js/main.js     (~150 lines)  Application initialization & event listeners
 *
 * Each module is under 260 lines and can be inspected or edited independently.
 */

(function () {
  'use strict';
  // If app.js was included directly without the modular scripts, dynamically load them in order:
  if (!window.DailyFeed || !window.DailyFeed.init) {
    const modules = [
      'js/state.js',
      'js/storage.js',
      'js/theme.js',
      'js/cards.js',
      'js/patches.js',
      'js/quiz.js',
      'js/modals.js',
      'js/main.js'
    ];

    function loadNext(idx) {
      if (idx >= modules.length) return;
      const s = document.createElement('script');
      s.src = modules[idx];
      s.onload = () => loadNext(idx + 1);
      document.head.appendChild(s);
    }

    loadNext(0);
  }
})();
