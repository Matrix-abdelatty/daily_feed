# CHANGELOG
> Entries newest on top. Only implemented changes.

## 2026-11-13 00:52 +02:00
- **Modular Codebase Split & Token Optimization:** Split the 1,850+ line monolithic `app.js` into 8 cleanly decoupled modules under `js/` sharing `window.DailyFeed`:
  * `js/state.js` (~70 lines): Reactive state, topics, numbers map, date & JSON fetch helpers.
  * `js/storage.js` (~130 lines): Progress loading, saving, backup JSON export and import merge.
  * `js/theme.js` (~35 lines): 5 reading color themes with instant CSS property application.
  * `js/cards.js` (~215 lines): Single-language card renderer, save bookmarking, password-guarded delete, card selector jump.
  * `js/patches.js` (~260 lines): 5-card patch loader, single-patch home feed, older/newer navigation, patch finish toggle.
  * `js/quiz.js` (~220 lines): Patch quiz session, Combined Review Quiz hub, spaced repetition progression.
  * `js/modals.js` (~260 lines): Topic picker modal, history log modal, JSON patch validator, GitHub direct sync.
  * `js/main.js` (~150 lines): Application bootstrapping and event wiring.
  * `app.js`: Replaced with a 40-line lightweight backward-compatibility fallback loader.
- Updated `index.html` to load modular scripts in sequence.
- Updated `.github/workflows/build.yml` paths to watch `js/**`.

## 2026-11-13 00:35 +02:00
- **Removed "DL" Avatar & Title:** Completely undid the dark navy `#233746` circle with "DL" and "The Daily Lesson" title, replacing it with clean card metadata (`#N`, `Patch #X`, uppercase topic pill).
- **Added 5 Reading Color Themes:** Integrated 5 theme modes in Settings (⚙️) with CSS custom properties: `Ivory Cream` (default warm editorial), `Midnight Dark` (true night mode), `Minimal Paper` (clean white), `Warm Sepia` (vintage book), and `Sage Forest` (calm green).
- **Single-Patch Home Feed:** Configured `🆕 New Feed` to show only the latest 5-card patch (with `Older / Newer Patch` navigation, 5-question patch quiz, and finish toggle) for bite-sized daily focus.
- **Removed Like & Per-Card Quiz:** Removed `Like` button completely (using `🔖 Save` bookmarks only). Removed individual `Quiz` buttons from card footers; card footer contains only `🔖 Save` and `🗑️ Delete`.
- **Card Selector Dropdown:** Replaced the search input with a card jump dropdown (`<select id="cardSelectPicker">`). Selecting a card navigates to the patch, smoothly scrolls to the card, and pulses a golden highlight.
- **Moved History inside Settings:** Replaced top header `📜 History` button with a dedicated section inside Settings (⚙️).
- **Single Language per Card:** Removed dual-language stacked translation and dividers; cards render strictly in either English or Egyptian Arabic based on user selection. Quizzes also render strictly in the chosen language.

## 2026-11-12 23:55 +02:00
- Transformed card design into the warm editorial style from the reference image:
  * Dark navy slate avatar circle with "DL" and "The Daily Lesson" title + card number.
  * Sage green topic pill badge (`#e2ede7` / `#235347`) on the top right.
  * High-contrast bold serif headline (`Merriweather`, 22px bold) for book-like typography.
  * Hook paragraph with expandable "See more" link revealing detailed examples, rationale, and pitfalls.
  * Terracotta callout box (`#fbf3ea` with `3.5px solid #b85414` border) for "SAY THIS" / "قول كدة" with 1-tap copy button.
  * Pine teal "The move:" / "الخلاصة:" actionable takeaway.
  * Refined card footer with `♡ Like` / `❤️ Liked`, `🧠 Quiz`, `🔖 Save` / `🔖 Saved`, and subtle `🗑️` delete.
  * Bilingual Egyptian Arabic support with Cairo font and mirror RTL layouts.
- Reorganized Settings & Navigation per user requirements:
  * Moved "+ Add JSON Patch or Card" into a dedicated top section inside Settings (⚙️), keeping header uncluttered.
  * Removed redundant "View Log ▸" button from status bar (history is accessed via "📜 History").
  * Added the Card Language toggle (`Both (EN & عربي) | EN Only | عربي فقط`) directly inside "Topics" at the start before the category list.

## 2026-11-12 23:10 +02:00
- Added 4 new cards (`#17–#20`) and organized all 20 cards into 4 Patches of 5 cards (`cards/2026/2026-11-12_patch_01.json` through `patch_04.json`).
- Updated `config/generator.config.json` and `scripts/generate_daily.py` to use `gemini-3.8-flash` → `gemini-3.5-flash` → Groq (`openai/gpt-oss-120b`), generating 3 patches of 5 cards/day (15 cards/day) with 503 backoff and surgical card replacement.
- Updated `scripts/build_index.py` to index sequential `patch_number` and card number ranges (`min_number`, `max_number`) in `data/index.json`.
- Redesigned `index.html`, `styles.css`, and `app.js` for mobile-first Patch workflow:
  * Grouped 5 cards per Patch with end-of-patch 5-question quiz and `Mark Patch as Finished`.
  * Added 3 tabs: `🆕 New Feed`, `✅ Seen` (collapsed finished patches), and `⭐ Saved` (removed Like button).
  * Consolidated all 14 topics into a single `🏷️ Topics ▾` modal picker.
  * Added `📥 + Add JSON` modal with `📂 Upload .json File` and `📋 Paste JSON Text`.
  * Added Top Daily Patch Status Bar and `📜 History` modal.
  * Added Combined Quiz Hub for reviewing finished patches (SRS Due Today, Mix 5/10, Retry Mistakes).

## 2026-11-12 21:50 +02:00
- Implemented full Daily Feed web application and automated backend.
- Converted 6 seed cards with Egyptian Arabic and scenario quizzes (#1 to #6).
- Generated initial 10-card daily batch via AI generator (#7 to #16).
- Built client-side UI: unified card design, language toggles, likes, saves, spaced repetition quizzes, topic filters, search, composer, and progress export/import.
- Built automated scripts: `build_index.py` and `generate_daily.py`.
- Created GitHub repository `Matrix-abdelatty/daily_feed`.
- Configured encrypted GitHub Actions secrets `GEMINI_API_KEY` and `GROQ_API_KEY`.
- Deployed live on GitHub Pages: `https://matrix-abdelatty.github.io/daily_feed/`.

## 2026-11-12 21:10 +02:00
- Created `.agent/` project memory and planning docs (PLAN.md, CARD_PROMPT.md, SEED_NOTES.md). No application code.

