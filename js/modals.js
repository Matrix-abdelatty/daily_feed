/**
 * Daily Feed — Modals, Topic Picker, History Log & JSON Patch Uploader
 * Module: js/modals.js (~260 lines)
 */
(function (global) {
  'use strict';

  const DailyFeed = global.DailyFeed = global.DailyFeed || {};
  const state = DailyFeed.state;

  DailyFeed.openModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('open');
  };

  DailyFeed.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
  };

  DailyFeed.setupModal = function (triggerId, modalId) {
    const trigger = document.getElementById(triggerId);
    const modal = document.getElementById(modalId);
    if (!trigger || !modal) return;
    trigger.addEventListener('click', () => DailyFeed.openModal(modalId));
  };

  // 1. Topic Picker Modal
  DailyFeed.openTopicsModal = function () {
    const modal = document.getElementById('topicsModal');
    const grid = document.getElementById('topicsGridContainer');
    if (!modal || !grid) return;

    const counts = {};
    let totalVisible = 0;
    state.loadedCardsMap.forEach(c => {
      if (DailyFeed.isCardHidden(c.id)) return;
      totalVisible++;
      counts[c.topic] = (counts[c.topic] || 0) + 1;
    });

    grid.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'topic-grid-btn full-span' + (state.activeTopic === null ? ' active' : '');
    allBtn.innerHTML = `
      <span>✨ All Topics (Show Patches)</span>
      <span class="topic-count-pill">${totalVisible} cards</span>
    `;
    allBtn.addEventListener('click', () => {
      state.activeTopic = null;
      DailyFeed.closeModal('topicsModal');
      DailyFeed.renderFeed();
    });
    grid.appendChild(allBtn);

    state.topics.forEach(t => {
      const cCount = counts[t.id] || 0;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'topic-grid-btn' + (state.activeTopic === t.id ? ' active' : '');
      btn.innerHTML = `
        <span>${t.icon || '📌'} ${t.label}</span>
        <span class="topic-count-pill">${cCount}</span>
      `;
      btn.addEventListener('click', () => {
        state.activeTopic = (state.activeTopic === t.id) ? null : t.id;
        DailyFeed.closeModal('topicsModal');
        DailyFeed.renderFeed();
      });
      grid.appendChild(btn);
    });

    modal.classList.add('open');
  };

  // 2. Patch Status & History Log Modal
  DailyFeed.openHistoryModal = function () {
    const modal = document.getElementById('historyModal');
    const body = document.getElementById('historyModalBody');
    if (!modal || !body) return;

    const today = DailyFeed.getTodayStr();
    const todayPatches = state.patchesList.filter(p => p.date === today);

    let html = `
      <div class="history-summary-box">
        <div><strong>Today's Date:</strong> ${today}</div>
        <div><strong>Added Today:</strong> ${todayPatches.length} Patch(es) (Target: 3 patches / 15 cards per day)</div>
        <div><strong>Total in Library:</strong> ${state.patchesList.length} Patches (${state.loadedCardsMap.size} Cards)</div>
      </div>
      <h3 style="font-size: 14px; margin-bottom: 8px;">All Patches (Newest First)</h3>
      <div class="history-list">
    `;

    state.patchesList.forEach(p => {
      const visible = p.cards.filter(c => !DailyFeed.isCardHidden(c.id));
      const nums = visible.map(c => state.numbersMap[c.id] || 0).filter(Boolean);
      const minN = nums.length ? Math.min(...nums) : '?';
      const maxN = nums.length ? Math.max(...nums) : '?';
      const done = DailyFeed.isPatchFinished(p.batch_id);

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

    if (state.buildReport && Array.isArray(state.buildReport.skipped_details) && state.buildReport.skipped_details.length > 0) {
      html += `
        <h3 style="font-size: 14px; margin: 16px 0 6px; color: var(--color-warning);">⚠️ Skipped / Invalid Cards Report</h3>
        <div style="font-size: 12px; color: var(--text-secondary);">
          ${state.buildReport.skipped_details.map(s => `<div>• ${s.file} (${s.card_id}): ${s.reason}</div>`).join('')}
        </div>
      `;
    }

    body.innerHTML = html;

    body.querySelectorAll('[data-quiz-patch]').forEach(btn => {
      btn.addEventListener('click', () => {
        const bId = btn.dataset.quizPatch;
        const found = state.patchesList.find(p => p.batch_id === bId);
        if (found) {
          DailyFeed.closeModal('historyModal');
          const vis = found.cards.filter(c => !DailyFeed.isCardHidden(c.id));
          DailyFeed.startPatchQuizSession(found, vis);
        }
      });
    });

    modal.classList.add('open');
  };

  DailyFeed.populateComposerTopics = function () {
    const select = document.getElementById('compTopic');
    if (!select) return;
    select.innerHTML = '';
    state.topics.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.icon || ''} ${t.label}`;
      select.appendChild(opt);
    });
  };

  // 3. JSON Patch Parser & Validator
  DailyFeed.parseAndValidateJsonPatchText = function (rawText) {
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
    const today = DailyFeed.getTodayStr();

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
  };

  DailyFeed.showJsonPreview = function () {
    const textarea = document.getElementById('jsonPatchTextarea');
    const previewEl = document.getElementById('jsonValidationPreview');
    if (!textarea || !previewEl) return;

    if (!textarea.value.trim()) {
      previewEl.className = 'validation-preview hidden';
      return;
    }

    const res = DailyFeed.parseAndValidateJsonPatchText(textarea.value);
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
  };

  DailyFeed.publishValidatedJsonPatch = async function () {
    const textarea = document.getElementById('jsonPatchTextarea');
    const previewEl = document.getElementById('jsonValidationPreview');
    const res = DailyFeed.parseAndValidateJsonPatchText(textarea ? textarea.value : '');

    if (!res.valid) {
      if (previewEl) {
        previewEl.className = 'validation-preview invalid';
        previewEl.textContent = '❌ ' + res.error;
      }
      return;
    }

    const expectedPass = state.userProgress.delete_password || state.appConfig.delete_password || '123';
    const entered = window.prompt(`Confirm publishing ${res.cards.length}-card JSON Patch:\nEnter password (default: ${expectedPass}):`);
    if (entered === null) return;
    if (entered !== expectedPass) {
      alert('Incorrect password.');
      return;
    }

    const today = DailyFeed.getTodayStr();
    const maxPatchNum = state.patchesList.reduce((m, p) => Math.max(m, p.patch_number || 0), 0);
    let maxCardNum = Object.values(state.numbersMap).reduce((m, n) => Math.max(m, n || 0), 0);

    const newPatchNum = maxPatchNum + 1;
    res.cards.forEach(c => {
      if (!state.numbersMap[c.id]) {
        maxCardNum += 1;
        state.numbersMap[c.id] = maxCardNum;
      }
      c._patch_id = res.batch_id;
      c._patch_number = newPatchNum;
      state.loadedCardsMap.set(c.id, c);
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

    if (!Array.isArray(state.userProgress.local_patches)) state.userProgress.local_patches = [];
    state.userProgress.local_patches.unshift(newPatchObj);
    state.patchesList.unshift(newPatchObj);
    DailyFeed.saveUserProgress();
    DailyFeed.populateCardSelector();

    let githubMsg = 'Saved immediately to your feed!';
    if (state.userProgress.owner_token && state.appConfig.github) {
      try {
        await DailyFeed.pushPatchFileToGitHub(newPatchObj);
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

    DailyFeed.closeModal('addPatchModal');
    DailyFeed.switchTab('new');
    alert(`✅ Patch #${newPatchNum} (${res.cards.length} cards) added!\n${githubMsg}`);
  };

  DailyFeed.pushPatchFileToGitHub = async function (patchObj) {
    const { owner, repo, branch = 'main' } = state.appConfig.github;
    const year = (patchObj.date || DailyFeed.getTodayStr()).slice(0, 4);
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
        Authorization: `token ${state.userProgress.owner_token}`,
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
  };

  DailyFeed.handleSingleCardSubmit = function (e) {
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
      batch_id: `${DailyFeed.getTodayStr()}_single_${Date.now().toString().slice(-4)}`,
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
    DailyFeed.publishValidatedJsonPatch();
  };

})(window);
