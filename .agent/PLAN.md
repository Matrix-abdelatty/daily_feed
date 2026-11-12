# Daily Feed — Implementation Plan (for the implementing AI)

> Status: APPROVED PLAN — NOTHING IMPLEMENTED YET (2026-11-12 21:10 +02:00)
> Read this whole file before writing code. Read DECISIONS.md and CARD_PROMPT.md too.
> If anything here is unclear, ASK the owner. Do not assume.

---

## 1. Goal (one paragraph)
A free, public, no-sign-in web app that replaces mindless Facebook scrolling with short,
practical, engaging **bilingual cards (English + Egyptian Arabic)**. App UI is **English only**.
All cards are shown in one feed, **newest on top**, each with a **permanent number (#N)**.
10 new cards are generated automatically every day. Saved cards get a quiz with spaced repetition.
Free forever: no ads, no subscription, no locked features.

---

## 2. Hard requirements
| # | Requirement |
|---|---|
| R1 | UI language: English. Card content: English + Egyptian Arabic (عامية مصرية) on every card. |
| R2 | Feed shows ALL cards, newest first, infinite scroll (lazy load by file). |
| R3 | Every card shows a permanent number `#N`. Numbers never change; deleted cards leave gaps. |
| R4 | One unified card shape for every card (Section 5). Engaging, "interesting post" style. |
| R5 | Auto-generate **10 cards/day** (value from config, not hardcoded). |
| R6 | Quality first: concrete what/when/why/example; no vague motivation; no duplicates; no invented stats. |
| R7 | Like (private per browser), Save (private per browser), filter by topic, search. |
| R8 | Quiz + spaced repetition **only for saved cards**. Intervals `1, 2, 3, 7, 14, 30` days → then "mastered". |
| R9 | Delete a **single card** (never a whole file). Easy: click 🗑 → type password (`123`) → gone. |
| R10 | Composer: owner's cards go public; visitors' cards stay in their browser. |
| R11 | Export/Import progress JSON (import = **merge**, newest change wins). Export all content as JSON. |
| R12 | Public link, no sign-in, same functions for everyone. 100% free hosting & automation. |
| R13 | All changeable settings live in separate config files, not in code (Section 9). |
| R14 | No "Fresh tips" button (removed by owner decision). |

---

## 3. Platform (all free)
- **Hosting:** GitHub Pages, **public repo** (Pages on private repos requires a paid GitHub plan).
- **Automation:** GitHub Actions (free/unlimited for public repos).
- **AI generation:** Gemini API free tier. Key stored as GitHub secret `GEMINI_API_KEY`. Never in code.
- **User data:** browser storage (localStorage or IndexedDB). No backend, no accounts.
- **Front-end:** plain HTML/CSS/JS, no framework, no build step (keep it simple, no new deps).
- **Scripts (Actions):** Python 3, standard library preferred (`urllib`, `json`, `difflib`, `pathlib`).
- **Later (Phase 3):** PWA (installable + offline). Android app may reuse the same JSON.

---

## 4. Folder layout
```
/
├─ index.html, app.js, styles.css      (or /app/... — implementer's choice, keep flat & simple)
├─ config/
│   ├─ app.config.json                 UI + SRS + owner settings (Section 9)
│   ├─ generator.config.json           daily AI job settings (Section 9)
│   └─ topics.json                     topic ids + English labels
├─ prompts/
│   └─ card_prompt.md                  copy of .agent/CARD_PROMPT.md (used by daily job)
├─ cards/                              ALL card JSON files live here (any number of small files)
│   └─ 2026/
│       ├─ 2026-11-12_seed_01.json
│       ├─ 2026-11-13_auto_01.json
│       └─ 2026-11-13_manual_01.json
├─ data/                               AUTO-GENERATED (except deleted.json) — never hand-edit others
│   ├─ index.json                      list of card files, newest first, with card counts
│   ├─ numbers.json                    permanent map: card id → number
│   ├─ search.json                     light search index: number, id, topic, titles, tags
│   ├─ deleted.json                    list of deleted card ids (soft delete)
│   └─ build_report.json               skipped/invalid cards from last build
├─ scripts/
│   ├─ build_index.py                  validate + number + build index/search
│   ├─ generate_daily.py               call AI, review, dedupe, write daily file
│   └─ common.py                       shared helpers (schema validation, similarity, io)
└─ .github/workflows/
    ├─ build.yml                       on push (cards/**, data/deleted.json, config/**) → build + deploy
    └─ daily.yml                       cron daily → generate → build → commit → deploy
```
File naming: `cards/YYYY/YYYY-MM-DD_<source>_<NN>.json` where source ∈ `seed|auto|manual|gemini|chatgpt|claude|other`.

---

## 5. Unified card (data + display)

### 5.1 Card JSON schema v1 (one batch file)
```json
{
  "schema_version": 1,
  "batch_id": "2026-11-12_seed_01",
  "created_at": "2026-11-12T08:00:00+02:00",
  "source": "seed",
  "cards": [
    {
      "id": "2026-11-12_pricing_three-options-not-one-price",
      "created_at": "2026-11-12T08:00:00+02:00",
      "topic": "pricing",
      "tags": ["price", "options"],
      "level": "beginner",
      "needs_completion": false,
      "en": {
        "title": "", "hook": "", "action": "", "key_phrase": "",
        "when": "", "why": "", "example": "", "mistake": ""
      },
      "ar": { "same 8 fields in Egyptian Arabic": "" },
      "quiz": {
        "type": "mcq",
        "correct_index": 1,
        "en": { "question": "", "options": ["", "", "", ""], "explanation": "" },
        "ar": { "question": "", "options": ["", "", "", ""], "explanation": "" }
      }
    }
  ]
}
```
Rules:
- **No `number` field in card files.** Numbers come only from `data/numbers.json`.
- `id`: `YYYY-MM-DD_<topic>_<english-slug>`, lowercase, hyphens, globally unique, never changes.
- `topic` must exist in `config/topics.json`. `level` ∈ beginner|intermediate|advanced.
- Length limits: title ≤ 70, hook ≤ 160, key_phrase ≤ 160, action/when/why/mistake ≤ 300, example ≤ 450 chars.
- All fields required except `key_phrase` (may be ""). Exception: `needs_completion: true` cards (Section 8.4).
- Quiz: exactly 4 options, one correct, same order in en/ar.

### 5.2 Display order (identical for every card)
```
┌───────────────────────────────────────────────┐
│ #123 · NEGOTIATION · beginner        ♡  ☆  🗑 │
│ TITLE (bold)                                  │
│ Hook (1–2 engaging lines)                     │
│ 💬 "Key phrase"                               │
│ ── Read more ▾ (expands) ──                   │
│ ▸ Do / Say:   action                          │
│ ⏱ When:      when                            │
│ 💡 Why:       why                             │
│ 📖 Example:   example                         │
│ ⚠ Avoid:     mistake                          │
│ [Arabic block — same order, RTL, Arabic font] │
│ [Quiz me] (only when saved)                   │
└───────────────────────────────────────────────┘
```
- Collapsed by default (number, title, hook, key phrase) → scroll-friendly like a social feed.
- Display toggle in settings: `EN | AR | Both` (default from config). Labels stay English.
- Arabic block: `dir="rtl"`, good Arabic web font (e.g. Cairo / Noto Naskh Arabic).

---

## 6. Build pipeline (`scripts/build_index.py`, workflow `build.yml`)
Runs on every push touching `cards/**`, `data/deleted.json`, or `config/**`. Also called by daily job.
1. Load every `cards/**/*.json`. Validate each card against schema v1.
2. Invalid card → **skip that card only**, record reason in `data/build_report.json`. Never fail the whole site.
3. Duplicate `id` → keep the earliest, skip later ones (report).
4. Near-duplicate check: same topic + `difflib.SequenceMatcher` ratio on normalized `en.title + en.action`
   ≥ `similarity_threshold` (config) → skip later one (report).
5. Numbering: load `data/numbers.json`; new ids sorted by (`created_at`, `id`) get `max + 1`.
   **Never renumber, never reuse a number** (deleted ids keep their number in the map).
6. Write `data/index.json` (files newest first + counts) and `data/search.json`.
7. Commit changes, then deploy Pages **in the same workflow** (`actions/deploy-pages`).
   Note: commits made with `GITHUB_TOKEN` do not trigger other workflows — so each workflow must
   build + deploy itself.

---

## 7. Daily generation (`scripts/generate_daily.py`, workflow `daily.yml`)
- Cron `0 6 * * *` UTC (≈ 08:00–09:00 Cairo; GitHub cron can be late — acceptable).
- Steps:
  1. Read `config/generator.config.json` and `prompts/card_prompt.md`.
  2. Pick topics by rotation (least recently used topics first) for `cards_per_day` (10).
  3. Build prompt in GENERATE mode with recent same-topic titles (limit from config) as "EXISTING TITLES".
  4. Call Gemini (model name from config). Parse JSON. Validate schema.
  5. **Review pass:** second AI call scores each card 1–10 for concreteness/usefulness/Arabic quality.
     Keep score ≥ `min_review_score`.
  6. Dedupe against all existing cards (same as build step 4).
  7. If fewer than target, retry up to `max_retries`. If still short, commit what passed (never junk).
  8. Complete owner cards with `needs_completion: true` (fill missing language/quiz, set flag false).
  9. Write `cards/YYYY/YYYY-MM-DD_auto_01.json`, run build, commit, deploy.
- On API failure: job exits cleanly with a log message; site keeps working with existing cards.
- Must also support `workflow_dispatch` (manual "Run now" button in GitHub).

---

## 8. Front-end features

### 8.1 Feed
- Load `config/*`, `data/index.json`, `data/numbers.json`, `data/deleted.json`.
- Load card files newest first, page by page on scroll. Hide ids in `deleted.json` and local hidden list.
- Sort: newest first (highest number on top).
- Filter by topic (chips from `topics.json`), filter "Saved", "Liked". Search uses `data/search.json`
  (searches EN + AR titles/tags; loads needed files on result click).

### 8.2 Like / Save (private, per browser)
Stored in progress store. Saving a card adds it to SRS (stage 0, due today).

### 8.3 Delete a single card (simple)
- Click 🗑 → prompt for password (from `app.config.json`, default `123`) → card hidden immediately.
- **If owner GitHub token is set on this device** (Settings → "Owner token", stored in localStorage only):
  app appends the id to `data/deleted.json` via GitHub Contents API (GET sha → PUT). Gone for everyone
  after the build (~1 min).
- **No token** → hidden in this browser only.
- Undo: Settings → "Deleted cards" list → restore (removes id locally / from deleted.json if owner).
- Never edit or delete the original card file.
- Note: password `123` is only an "are you sure" guard (visible in source). The token is the real protection.
  Token = GitHub fine-grained PAT, access: this repo only, permission Contents: read & write.

### 8.4 Composer
- Fields: topic, level, tags, and both EN + AR blocks (8 fields each), quiz (optional).
- Minimum to submit: title + action in **at least one** language.
- If any required field is empty → card gets `needs_completion: true`; the daily job fills the missing
  language and quiz next morning. Card is shown immediately with a small "being completed" badge.
- Owner (token set) → app creates new file `cards/YYYY/YYYY-MM-DD_manual_NN.json` via GitHub API → public.
- Visitor (no token) → card saved in browser only (`local_cards`), shown only to them, included in export.

### 8.5 Quiz + spaced repetition (saved cards only)
- Intervals from config: `[1, 2, 3, 7, 14, 30]` days; passing the 30-day review → `mastered` (no more reviews).
- Correct → stage + 1, `due = today + intervals[stage]`.
- Wrong → show correct answer + explanation; stage = 0; re-queue in same session after
  `session_retry_gap` cards (config, e.g. 3); `due = tomorrow`; add to "Retry mistakes" list.
- Lists: **Review today** (due ≤ today), **Retry mistakes**, **Mastered**.
- Daily review cap: `max_reviews_per_day` (config). Overdue cards beyond cap roll to next day.
- Unsaving a card pauses its SRS (state kept, excluded from lists). Deleted cards are excluded.
- Quiz language follows display toggle (Both → EN question with AR below).

### 8.6 Export / Import
- **Export progress** → `daily-feed-progress-YYYY-MM-DD.json`:
  `{ schema_version, exported_at, likes, saves, srs, mistakes, hidden, local_cards }`
  each item has `updated_at`.
- **Import progress** → **merge**: union of all items; on conflict, newer `updated_at` wins.
  Validate file first; show summary (added/updated/skipped) before applying.
- **Export content** → one JSON with all visible cards (+ numbers). CSV/Markdown export = Phase 3.
- Content import = add files to `cards/` folder (owner, via GitHub). No in-app content import in v1.

---

## 9. Config files (changeable without touching code)

### `config/app.config.json`
```json
{
  "app_name": "Daily Feed",
  "ui_language": "en",
  "default_card_language": "both",
  "delete_password": "123",
  "srs_intervals_days": [1, 2, 3, 7, 14, 30],
  "max_reviews_per_day": 50,
  "session_retry_gap": 3,
  "files_per_page": 3,
  "github": { "owner": "<github-username>", "repo": "<repo-name>", "branch": "main" }
}
```
### `config/generator.config.json`
```json
{
  "provider": "gemini",
  "model": "<current free Gemini Flash model name>",
  "cards_per_day": 10,
  "min_review_score": 7,
  "max_retries": 2,
  "similarity_threshold": 0.85,
  "recent_titles_limit": 150,
  "arabic_style": "egyptian",
  "timezone": "Africa/Cairo",
  "prompt_file": "prompts/card_prompt.md"
}
```
### `config/topics.json`
`sales, negotiation, pricing, persuasion, communication, meetings, psychology, productivity,
business, money, leadership, decision_making, career, learning` — each `{ "id": "...", "label": "..." }`.

### Secrets (never in repo)
- `GEMINI_API_KEY` → GitHub repo → Settings → Secrets → Actions.
- Owner PAT → pasted in app Settings on owner's own devices only (localStorage).

---

## 10. Seed content
Convert the 6 notes in `.agent/SEED_NOTES.md` using `CARD_PROMPT.md` in **CONVERT** mode into
`cards/2026/2026-11-12_seed_01.json`. They must become **#1–#6** (earliest `created_at`).
Owner should review them before go-live.

---

## 11. Phases
- **Phase 1 (MVP):** folder + configs + schema + seed cards + build script/workflow + feed UI
  (unified card, numbers, filter, search, like, save, EN/AR toggle) + delete + export/import progress.
- **Phase 2:** daily AI generation workflow + review pass + composer (owner publish + needs_completion) + quiz/SRS.
- **Phase 3:** PWA/offline, CSV/Markdown export, provider fallback (Groq/OpenRouter), polish.

## 12. Acceptance checks
- Dropping a new valid file in `cards/` → appears on site, numbered, newest on top, within minutes.
- Dropping a file with 1 bad card → other cards appear; bad one listed in `build_report.json`.
- Delete with token → disappears for everyone; without token → only locally; restore works.
- Numbers never change after rebuilds, deletes, or new files.
- Export → clear browser → import → identical likes/saves/quiz state. Import twice → no duplicates.
- Daily job with missing/invalid API key → fails cleanly, site unaffected.

## 13. Known risks
- Gemini free tier may change → config-driven provider; fallback in Phase 3.
- AI Arabic may drift to فصحى → prompt rules + review score.
- Password `123` is not security (accepted by owner; token is real protection).
- Browser storage can be cleared by user → remind to export progress (Settings).

