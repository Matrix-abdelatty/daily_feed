/**
 * Daily Feed — UI & Reading Color Theme Manager (5 Options)
 * Module: js/theme.js (~45 lines)
 */
(function (global) {
  'use strict';

  const DailyFeed = global.DailyFeed = global.DailyFeed || {};
  const state = DailyFeed.state;

  const VALID_THEMES = ['ivory', 'midnight', 'paper', 'sepia', 'forest'];

  DailyFeed.applyTheme = function (themeName) {
    const theme = VALID_THEMES.includes(themeName) ? themeName : 'ivory';
    document.documentElement.setAttribute('data-theme', theme);
    state.userProgress.theme = theme;
    document.querySelectorAll('.theme-picker-btn').forEach(btn => {
      const btnTheme = btn.dataset.themeName || btn.dataset.theme;
      btn.classList.toggle('active', btnTheme === theme);
    });
  };

  DailyFeed.initThemeSelector = function () {
    document.querySelectorAll('.theme-picker-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const selectedTheme = btn.dataset.themeName || btn.dataset.theme;
        DailyFeed.applyTheme(selectedTheme);
        DailyFeed.saveUserProgress();
      });
    });
    DailyFeed.applyTheme(state.userProgress.theme || 'ivory');
  };

})(window);

