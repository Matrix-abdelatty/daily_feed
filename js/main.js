/**
 * Daily Feed — Application Entry Point & Event Wiring
 * Module: js/main.js (~130 lines)
 */
(function (global) {
  'use strict';

  const DailyFeed = global.DailyFeed = global.DailyFeed || {};
  const state = DailyFeed.state;

  DailyFeed.init = async function () {
    DailyFeed.loadUserProgress();
    DailyFeed.initThemeSelector();

    // Language toggle buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === state.currentLang);
      btn.addEventListener('click', () => {
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentLang = btn.dataset.lang;
        DailyFeed.saveUserProgress();
        DailyFeed.populateCardSelector();
        DailyFeed.renderFeed();
      });
    });

    try {
      const [cfg, top, idx, nums, deleted, report] = await Promise.all([
        DailyFeed.fetchJSON('config/app.config.json').catch(() => state.appConfig),
        DailyFeed.fetchJSON('config/topics.json').catch(() => []),
        DailyFeed.fetchJSON('data/index.json').catch(() => ({ files: [] })),
        DailyFeed.fetchJSON('data/numbers.json').catch(() => ({})),
        DailyFeed.fetchJSON('data/deleted.json').catch(() => []),
        DailyFeed.fetchJSON('data/build_report.json').catch(() => ({ skipped_details: [] }))
      ]);

      state.appConfig = Object.assign(state.appConfig, cfg);
      state.topics = top;
      state.indexData = idx;
      state.numbersMap = nums;
      state.repoDeletedIds = new Set(deleted);
      state.buildReport = report;
    } catch (e) {
      console.error('Metadata load error:', e);
    }

    DailyFeed.populateComposerTopics();
    DailyFeed.setupEventListeners();
    await DailyFeed.loadAllPatches();
    DailyFeed.populateCardSelector();
    DailyFeed.updateCountsAndStatusBar();
    DailyFeed.renderFeed();
  };

  DailyFeed.setupEventListeners = function () {
    // 3 Main Feed Tabs
    document.querySelectorAll('.feed-tab').forEach(tab => {
      tab.addEventListener('click', () => DailyFeed.switchTab(tab.dataset.tab));
    });

    // Card Selector Dropdown
    const cardPicker = document.getElementById('cardSelectPicker');
    if (cardPicker) {
      cardPicker.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        if (selectedId) {
          DailyFeed.jumpToCard(selectedId);
          e.target.value = '';
        }
      });
    }

    // Reset Filter Banner
    document.getElementById('resetFilterBtn')?.addEventListener('click', () => {
      state.activeTopic = null;
      DailyFeed.renderFeed();
    });

    // Single Grouped Topics Button
    document.getElementById('btnTopicsPicker')?.addEventListener('click', DailyFeed.openTopicsModal);

    // Header Buttons
    DailyFeed.setupModal('btnSettings', 'settingsModal');
    document.getElementById('btnCombinedQuiz')?.addEventListener('click', DailyFeed.openQuizHubModal);

    // Open History modal from inside Settings
    document.getElementById('btnOpenHistoryFromSettings')?.addEventListener('click', () => {
      DailyFeed.closeModal('settingsModal');
      DailyFeed.openHistoryModal();
    });

    // Open Add Patch modal from inside Settings
    document.getElementById('btnOpenAddPatchFromSettings')?.addEventListener('click', () => {
      DailyFeed.closeModal('settingsModal');
      DailyFeed.openModal('addPatchModal');
    });

    // Prepopulate settings fields when opening Settings
    document.getElementById('btnSettings')?.addEventListener('click', () => {
      const passInput = document.getElementById('settingDeletePassword');
      const tokenInput = document.getElementById('settingOwnerToken');
      if (passInput) passInput.value = state.userProgress.delete_password || '';
      if (tokenInput) tokenInput.value = state.userProgress.owner_token || '';
      DailyFeed.applyTheme(state.userProgress.theme || 'ivory');
    });

    // Close modal buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => DailyFeed.closeModal(btn.dataset.close));
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
            DailyFeed.showJsonPreview();
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      });
    }

    // Live JSON Check & Publish
    document.getElementById('btnValidateJson')?.addEventListener('click', DailyFeed.showJsonPreview);
    document.getElementById('jsonPatchTextarea')?.addEventListener('input', DailyFeed.showJsonPreview);
    document.getElementById('btnPublishJsonPatch')?.addEventListener('click', DailyFeed.publishValidatedJsonPatch);

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
    document.getElementById('composerForm')?.addEventListener('submit', DailyFeed.handleSingleCardSubmit);

    // Export / Import / Settings
    document.getElementById('btnExportProgress')?.addEventListener('click', DailyFeed.exportProgressJSON);
    document.getElementById('btnExportAllContent')?.addEventListener('click', DailyFeed.exportAllContentJSON);

    const btnTriggerImport = document.getElementById('btnTriggerImport');
    const importFileInput = document.getElementById('importFileInput');
    if (btnTriggerImport && importFileInput) {
      btnTriggerImport.addEventListener('click', () => importFileInput.click());
      importFileInput.addEventListener('change', DailyFeed.handleImportProgressFile);
    }

    document.getElementById('btnSaveSettings')?.addEventListener('click', () => {
      const pass = document.getElementById('settingDeletePassword').value.trim();
      const token = document.getElementById('settingOwnerToken').value.trim();
      if (pass) state.userProgress.delete_password = pass;
      if (token) state.userProgress.owner_token = token;
      DailyFeed.saveUserProgress();
      alert('Settings saved!');
      DailyFeed.closeModal('settingsModal');
    });

    document.getElementById('btnRestoreHidden')?.addEventListener('click', () => {
      state.userProgress.hidden = {};
      DailyFeed.saveUserProgress();
      DailyFeed.renderFeed();
      alert('All locally hidden cards restored!');
    });
  };

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', DailyFeed.init);
  } else {
    DailyFeed.init();
  }

})(window);
