/**
 * Daily Feed — Patch Quiz & Combined Review Quiz Engine (Spaced Repetition)
 * Module: js/quiz.js (~220 lines)
 */
(function (global) {
  'use strict';

  const DailyFeed = global.DailyFeed = global.DailyFeed || {};
  const state = DailyFeed.state;

  DailyFeed.getReviewPoolCards = function () {
    const poolMap = new Map();
    state.patchesList.forEach(p => {
      if (DailyFeed.isPatchFinished(p.batch_id)) {
        p.cards.forEach(c => {
          if (!DailyFeed.isCardHidden(c.id)) poolMap.set(c.id, c);
        });
      }
    });
    state.loadedCardsMap.forEach(c => {
      if (!DailyFeed.isCardHidden(c.id) && state.userProgress.saves[c.id]) {
        poolMap.set(c.id, c);
      }
    });
    return Array.from(poolMap.values());
  };

  DailyFeed.openQuizHubModal = function () {
    const modal = document.getElementById('quizModal');
    const titleEl = document.getElementById('quizModalTitle');
    const bodyEl = document.getElementById('quizModalBody');
    if (!modal || !bodyEl) return;

    titleEl.textContent = '🧠 Combined Quiz & Review Hub';

    const today = DailyFeed.getTodayStr();
    const poolCards = DailyFeed.getReviewPoolCards();
    const dueCards = poolCards.filter(c => {
      const s = state.userProgress.srs[c.id];
      return !s || (s.due && s.due <= today);
    });
    const mistakeCards = Array.from(state.loadedCardsMap.values()).filter(
      c => !DailyFeed.isCardHidden(c.id) && !!state.userProgress.mistakes[c.id]
    );
    let masteredCount = 0;
    Object.values(state.userProgress.srs).forEach(s => {
      if (s && s.stage >= 6) masteredCount++;
    });

    const finishedPatchesCount = Object.keys(state.userProgress.finished_patches).length;

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
      DailyFeed.runInteractiveQuizSession('⏰ Due Today (Spaced Repetition)', dueCards.slice(0, 15), null);
    });

    bodyEl.querySelector('#btnStartCombined5')?.addEventListener('click', () => {
      DailyFeed.runInteractiveQuizSession('🔀 Combined Review (5 Finished Cards)', shuffle(poolCards).slice(0, 5), null);
    });

    bodyEl.querySelector('#btnStartCombined10')?.addEventListener('click', () => {
      DailyFeed.runInteractiveQuizSession('🔀 Combined Review (10 Finished Cards)', shuffle(poolCards).slice(0, 10), null);
    });

    bodyEl.querySelector('#btnStartMistakes')?.addEventListener('click', () => {
      DailyFeed.runInteractiveQuizSession('🔄 Retry Mistakes', mistakeCards, null);
    });

    bodyEl.querySelector('#btnStartAllRandom')?.addEventListener('click', () => {
      const allVisible = Array.from(state.loadedCardsMap.values()).filter(c => !DailyFeed.isCardHidden(c.id));
      DailyFeed.runInteractiveQuizSession('⚡ Quick 5-Card Mix', shuffle(allVisible).slice(0, 5), null);
    });

    modal.classList.add('open');
  };

  DailyFeed.startPatchQuizSession = function (patch, visibleCards) {
    const modal = document.getElementById('quizModal');
    if (modal) modal.classList.add('open');
    DailyFeed.runInteractiveQuizSession(
      `📦 Patch #${patch.patch_number} Quiz (${visibleCards.length} Questions)`,
      visibleCards,
      patch
    );
  };

  DailyFeed.runInteractiveQuizSession = function (sessionTitle, cardsQueue, associatedPatch) {
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
        const pct = Math.round((correctCount / validCards.length) * 100);
        if (associatedPatch) {
          DailyFeed.toggleFinishPatch(associatedPatch, validCards, {
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
          DailyFeed.closeModal('quizModal');
        });
        return;
      }

      const card = validCards[currentIdx];
      const num = state.numbersMap[card.id] || '?';
      const isQuizAr = (state.currentLang === 'ar' && card.quiz.ar) || (!card.quiz.en && card.quiz.ar);
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

          DailyFeed.handleSrsAnswer(card.id, isRight);

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
  };

  DailyFeed.handleSrsAnswer = function (cardId, isCorrect) {
    const today = DailyFeed.getTodayStr();
    const intervals = state.appConfig.srs_intervals_days || [1, 2, 3, 7, 14, 30];
    if (!state.userProgress.srs[cardId]) {
      state.userProgress.srs[cardId] = { stage: 0, due: today, updated_at: new Date().toISOString() };
    }
    const s = state.userProgress.srs[cardId];
    if (isCorrect) {
      delete state.userProgress.mistakes[cardId];
      const nextDays = intervals[s.stage] || 30;
      s.stage = Math.min(s.stage + 1, intervals.length);
      s.due = DailyFeed.addDays(today, nextDays);
    } else {
      state.userProgress.mistakes[cardId] = Date.now();
      s.stage = 0;
      s.due = today;
    }
    s.updated_at = new Date().toISOString();
    DailyFeed.saveUserProgress();
  };

})(window);

