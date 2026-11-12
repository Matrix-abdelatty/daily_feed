# DECISIONS
> Entries newest on top. All decided by owner on 2026-11-12 and 2026-11-13.

## 2026-11-13 01:25 +02:00 — Compact Jump-to-Card Selector
- D37. **Cards-Only Jump Selector:** The "Jump to Card" dropdown displays clean, compact card numbers only (`Card #1`, `Card #2`... / `كارت #1`, `كارت #2`...) rather than full card info headlines, keeping the control clean and mobile-friendly without information leaks.

## 2026-11-13 00:52 +02:00 — Modular Script Decomposition & Token Optimization
- D36. **Modular Script Split (`js/*.js`):** Monolithic `app.js` split into 8 focused single-responsibility scripts under `js/` sharing `window.DailyFeed`. This drastically reduces LLM token consumption by avoiding large file rereads, isolates concerns, and eliminates regression risks during future modifications.

## 2026-11-13 00:35 +02:00 — Single-Patch Feed, 5 Color Themes, Card Selector & Pure Single Language
- D29. **Remove "DL" Avatar & Series Title:** Undid the dark navy `#233746` avatar circle and "The Daily Lesson" title to give the card header a cleaner, content-first metadata layout (`#N`, `Patch #X`, topic pill).
- D30. **5 Reading Color Themes:** Settings modal features 5 theme choices (`ivory`, `midnight`, `paper`, `sepia`, `forest`) for personalized contrast and color preference.
- D31. **Home Feed Displays Latest Patch Only:** The `🆕 New Feed` tab displays exactly ONE 5-card patch at a time (the latest or user-selected patch), preventing scrolling overload and providing a focused 5-card micro-learning session with patch navigation (`Older / Newer`).
- D32. **Remove Like & Per-Card Quiz:** Removed `Like` button entirely (relying on `🔖 Save` bookmarks). Removed the individual `Quiz` button from each card footer; quizzing is conducted at the patch level (5 questions) or in the Combined Quiz Hub. Card actions are strictly `Save` and `Delete`.
- D33. **Card Selector Dropdown:** Replaced the free-text search bar with a quick-jump card picker (`<select id="cardSelectPicker">`) that automatically locates, scrolls to, and pulse-highlights any card.
- D34. **History Inside Settings:** Moved the `📜 History` button out of the main header into Section 3 inside Settings (⚙️).
- D35. **Single Language Only (No Dual Translation):** A card is rendered purely in ONE language (English or Egyptian Arabic), not translated or stacked. Quizzes are also presented in that single selected language.

## 2026-11-12 23:55 +02:00 — Editorial Card Styling & Navigation Reorganization
- D25. **Warm Editorial Card Aesthetic:** Adopted the reference publication card styling featuring warm paper background, dark navy slate "DL" avatar, sage green topic pills, bold Merriweather serif titles, warm terracotta "SAY THIS" callouts, and pine teal "The move" takeaways.
- D26. **Settings-Centric JSON Upload:** Moved "+ Add JSON Patch or Card" inside Settings (⚙️) to keep top header minimal and distraction-free.
- D27. **Status Bar Simplification:** Deleted redundant "View Log ▸" link from the patch status bar since the header has a dedicated "📜 History" button.
- D28. **Topics Modal Language Selector:** Positioned the Card Language switch (`Both | EN | عربي`) at the start inside the Topics modal.

## 2026-11-12 23:10 +02:00 — Patch-Based UX, Model Hierarchy & Mobile-First Upgrade
- D17. **Model Chain:** `gemini-3.8-flash` (Primary) → `gemini-3.5-flash` (Secondary) → Groq `openai/gpt-oss-120b` (Emergency backup only). Removed `3.5-flash-lite`.
- D18. **Daily Generation:** 15 cards/day in **3 separate Patches of 5 cards each** (`3 × 5`). Includes backoff retry on 503/429 and surgical single-card replacement.
- D19. **Patch Grouping (5 Cards/Patch):** Cards are grouped into 5-card Patches (`Patch #1` to `Patch #4`, 20 cards total: `#1–#20`). Each patch has an end-of-patch `🧠 Quiz This Patch (5 Qs)` button and a `✅ Mark Patch as Finished` button.
- D20. **3 Main Feed Tabs:** `🆕 New Feed` (unread patches), `✅ Seen` (finished patches, neatly collapsed with green badge), and `⭐ Saved` (bookmarked individual cards; removed ❤️ Like).
- D21. **Single Topics Button (`🏷️ Topics ▾`):** All 14 topics grouped inside one modal/bottom-sheet button for a clean mobile-first UI.
- D22. **Manual JSON Patch Input in UI (`+ Add JSON`):** Supports both **📂 Upload `.json` file** and **📋 Paste JSON text** directly from the UI with live validation and GitHub sync.
- D23. **Patch Status Bar & History (`📜 History`):** Top status bar shows today's added patches count; History modal lists all patches, card ranges, dates, sources, and status.
- D24. **Combined Quizzes:** Finished patches feed into a Combined Review Quiz pool with Spaced Repetition (`1, 2, 3, 7, 14, 30` days), 5/10-card mixed quizzes, and Retry Mistakes.

## 2026-11-12 21:10 +02:00
- D1. UI English; cards English + **Egyptian Arabic** (عامية مصرية).
- D2. Feed shows **all** cards, **newest on top**; no timed release/buffer.
- D3. Every card has a permanent number `#N`, assigned by build step (not by AI). Gaps allowed after delete.
- D4. One unified card shape; engaging "interesting post" style (title + hook + key phrase, expandable details).
- D5. Cards stored as many small JSON files in `cards/` folder; auto-built `data/index.json`.
- D6. Auto-generate **10 cards/day** (config value).
- D7. Likes and saves private per browser (no backend).
- D8. Quiz + spaced repetition **only for saved cards**; intervals **1, 2, 3, 7, 14, 30** days → mastered.
- D9. Delete = single card, soft delete via `data/deleted.json`; password `123` as confirm guard;
      owner GitHub token (one-time per device) makes it global. Keep it simple.
- D10. Owner composer cards go public; visitors' stay local. Missing language/quiz filled by daily job (`needs_completion`).
- D11. "Fresh tips" button removed.
- D12. Export/Import progress JSON; import = **merge**, newest `updated_at` wins. Content export JSON.
- D13. All settings in separate config files (`config/`), secrets in GitHub Secrets / owner device only.
- D14. Hosting: GitHub Pages, **public repo** (free Pages requires public on free plan).
- D15. Quality first: concrete what/when/why/example, no vague motivation, no invented stats, dedupe.
- D16. Topics: sales, negotiation, pricing, persuasion, communication, meetings, psychology, productivity,
       business, money, leadership, decision_making, career, learning.

