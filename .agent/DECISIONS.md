# DECISIONS
> Entries newest on top. All decided by owner on 2026-11-12 (planning discussion).

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

