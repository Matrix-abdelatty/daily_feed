# CHANGELOG
> Entries newest on top. Only implemented changes.

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

