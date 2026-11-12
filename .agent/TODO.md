# TODO (planned — not implemented)
> Entries newest on top.

## 2026-11-12 21:10 +02:00
### Owner
- [ ] GitHub account + public repo; fill `config/app.config.json` github owner/repo.
- [ ] Gemini API key → repo secret `GEMINI_API_KEY`.
- [ ] Fine-grained PAT for owner device(s).
- [ ] Review seed cards #1–#6 after conversion.

### Phase 1 (MVP)
- [ ] Folder layout, config files, topics.json, schema v1.
- [ ] Seed cards from SEED_NOTES.md (CONVERT mode).
- [ ] `build_index.py` + `build.yml` (validate, skip bad cards, numbering, index/search, deploy).
- [ ] Feed UI: unified card, #numbers, newest first, lazy load, topic filter, search, EN/AR/Both toggle.
- [ ] Like / Save (local). Delete single card (password + optional owner token). Restore.
- [ ] Export / import progress (merge). Export content JSON.

### Phase 2
- [ ] `generate_daily.py` + `daily.yml` (10/day, review pass, dedupe, retries, workflow_dispatch).
- [ ] Composer (owner publish via GitHub API; visitor local; needs_completion).
- [ ] Quiz + SRS (1,2,3,7,14,30 → mastered), Review today, Retry mistakes, daily cap.

### Phase 3
- [ ] PWA/offline. CSV/Markdown export. AI provider fallback. Polish.

