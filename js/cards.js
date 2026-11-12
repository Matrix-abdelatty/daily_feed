/**
 * Daily Feed — Card Rendering, Saving, Deleting & Selector Jump
 * Module: js/cards.js (~220 lines)
 */
(function (global) {
  'use strict';

  const DailyFeed = global.DailyFeed = global.DailyFeed || {};
  const state = DailyFeed.state;

  DailyFeed.isCardHidden = function (cardId) {
    return state.repoDeletedIds.has(cardId) || !!state.userProgress.hidden[cardId];
  };

  DailyFeed.populateCardSelector = function () {
    const picker = document.getElementById('cardSelectPicker');
    if (!picker) return;

    const isAr = state.currentLang === 'ar';
    picker.innerHTML = isAr
      ? '<option value="">🎯 انتقال إلى كارت...</option>'
      : '<option value="">🎯 Jump to Card...</option>';

    const allCards = Array.from(state.loadedCardsMap.values()).filter(c => !DailyFeed.isCardHidden(c.id));
    allCards.sort((a, b) => (state.numbersMap[a.id] || 0) - (state.numbersMap[b.id] || 0));

    allCards.forEach(c => {
      const num = state.numbersMap[c.id] || '?';
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = isAr ? `كارت #${num}` : `Card #${num}`;
      picker.appendChild(opt);
    });
  };

  DailyFeed.jumpToCard = function (cardId) {
    if (!cardId) return;
    const card = state.loadedCardsMap.get(cardId);
    if (!card) return;

    if (state.activeTopic && card.topic !== state.activeTopic) {
      state.activeTopic = null;
    }

    const batchId = card._patch_id;
    const patchIsDone = DailyFeed.isPatchFinished(batchId);

    if (state.activeTab === 'saved' && !state.userProgress.saves[cardId]) {
      DailyFeed.switchTab(patchIsDone ? 'seen' : 'new');
    }

    if (state.activeTab === 'seen' || patchIsDone) {
      if (state.activeTab !== 'seen') {
        DailyFeed.switchTab('seen');
      }
      state.expandedPatches.add(batchId);
      DailyFeed.renderFeed();
    } else {
      if (state.activeTab !== 'new') {
        DailyFeed.switchTab('new');
      }
      const targetPatches = state.patchesList.filter(p => {
        const visible = p.cards.filter(c => !DailyFeed.isCardHidden(c.id));
        return visible.length > 0 && !DailyFeed.isPatchFinished(p.batch_id);
      });
      const foundIdx = targetPatches.findIndex(p => p.batch_id === batchId);
      if (foundIdx !== -1) {
        state.activePatchIdx = foundIdx;
      }
      DailyFeed.renderFeed();
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
  };

  // Create Single Card Element (Clean, Authentic Single-Language, Save & Delete Only)
  DailyFeed.createCardElement = function (card) {
    const el = document.createElement('article');
    el.className = 'card-item';
    el.id = `card-${card.id}`;

    const num = state.numbersMap[card.id] || '?';
    const isSaved = !!state.userProgress.saves[card.id];
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
    const isAr = (state.currentLang === 'ar' && card.ar) || (!card.en && card.ar);
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

    // 3. Card Footer Divider & Actions (Only Save & Delete)
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
    saveBtn.addEventListener('click', () => DailyFeed.toggleSave(card.id, saveBtn));
    rightActions.appendChild(saveBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'card-footer-btn delete-btn';
    deleteBtn.title = 'Delete card (Password protected)';
    deleteBtn.innerHTML = `<span class="icon">🗑️</span>`;
    deleteBtn.addEventListener('click', () => DailyFeed.confirmDeleteCard(card.id));
    rightActions.appendChild(deleteBtn);

    footer.appendChild(rightActions);
    el.appendChild(footer);

    return el;
  };

  DailyFeed.toggleSave = function (cardId, btnEl) {
    const isNowSaved = !state.userProgress.saves[cardId];
    if (isNowSaved) {
      state.userProgress.saves[cardId] = Date.now();
      btnEl.classList.add('saved');
      btnEl.querySelector('.bookmark-icon')?.setAttribute('fill', 'currentColor');
      btnEl.querySelector('.btn-text').textContent = 'Saved';
      if (!state.userProgress.srs[cardId]) {
        state.userProgress.srs[cardId] = {
          stage: 0,
          due: DailyFeed.getTodayStr(),
          updated_at: new Date().toISOString()
        };
      }
    } else {
      delete state.userProgress.saves[cardId];
      btnEl.classList.remove('saved');
      btnEl.querySelector('.bookmark-icon')?.setAttribute('fill', 'none');
      btnEl.querySelector('.btn-text').textContent = 'Save';
    }
    DailyFeed.saveUserProgress();
    if (state.activeTab === 'saved') DailyFeed.renderFeed();
  };

  DailyFeed.confirmDeleteCard = async function (cardId) {
    const expectedPass = state.userProgress.delete_password || state.appConfig.delete_password || '123';
    const num = state.numbersMap[cardId] || '';
    const entered = window.prompt(`Delete Single Card (#${num}):\nEnter password (default: ${expectedPass}):`);
    if (entered === null) return;
    if (entered !== expectedPass) {
      alert('Incorrect password. Card was not deleted.');
      return;
    }

    state.userProgress.hidden[cardId] = Date.now();
    DailyFeed.saveUserProgress();
    DailyFeed.populateCardSelector();
    DailyFeed.renderFeed();
  };

})(window);

