# TODO
> Entries newest on top.

## 2026-11-12 21:50 +02:00
### Completed
- [x] Public GitHub repo created: `Matrix-abdelatty/daily_feed`
- [x] Secrets configured in GitHub Actions: `GEMINI_API_KEY`, `GROQ_API_KEY`
- [x] All 6 original seed cards converted with high-quality English + Egyptian Arabic + scenario quizzes
- [x] Folder layout, config files (`config/`), topics list (`topics.json`), unified card schema v1
- [x] Permanent numbering engine (`scripts/build_index.py`), auto-indexing, search indexing
- [x] Automated daily generator (`scripts/generate_daily.py`) with Gemini & Groq fallback
- [x] Modern responsive UI (`index.html`, `styles.css`, `app.js`):
  - Unified card design (title, hook, key phrase, expandable details)
  - English & Egyptian Arabic toggle (`Both | EN | AR`)
  - Like, Save, and Delete (password `123` guard)
  - Interactive scenario quizzes with Spaced Repetition (1, 2, 3, 7, 14, 30 days -> Mastered)
  - Topic filters (14 topics) and instant search
  - Local composer for new cards
  - Export & Import progress JSON with merge logic
- [x] GitHub Actions automated pipelines:
  - `build.yml` (continuous build & deployment to Pages)
  - `daily.yml` (scheduled morning 10-card generation at 08:00 Cairo time)
- [x] Live GitHub Pages deployed and tested: `https://matrix-abdelatty.github.io/daily_feed/`

### Future / Optional Enhancements (Phase 3)
- [ ] PWA service worker for full offline reading
- [ ] Export directly to Anki deck package (.apkg)
- [ ] Optional fine-grained PAT setting in app UI for multi-device sync

