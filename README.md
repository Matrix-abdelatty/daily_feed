# ⚡ Daily Feed (ديلي فيد)

> **Replace mindless social media scrolling with short, high-leverage micro-lessons.**
> Written bilingually in English and Egyptian Arabic (عامية مصرية), with spaced repetition quizzes, permanent numbering, and 100% free automated updates.

🌐 **Live Demo & Feed:** Hosted directly on GitHub Pages!

---

## ✨ Features

- 🃏 **Unified Card Format**: Every card delivers a punchy Title, Hook, Key Phrase ("What to say"), Action steps, When to use, Why it works, Real dialogue example, and What to avoid.
- 🗣️ **English & Egyptian Arabic**: Every card is bilingual. Egyptian colloquial Arabic (عامية مصرية) written naturally like an experienced peer sharing a proven technique.
- 🔢 **Permanent Card Numbering (#N)**: Cards receive a permanent sequential number that never changes, even across file additions or deletions.
- 🧠 **Quiz & Spaced Repetition (SRS)**: Saved cards automatically enter an interactive review queue with optimal retention intervals: **1 → 2 → 3 → 7 → 14 → 30 days → Mastered**.
- 🔍 **Instant Search & Topic Filtering**: Fast client-side search across English and Arabic text, plus filters for 14 curated skill topics (Sales, Negotiation, Pricing, Persuasion, Meetings, etc.).
- 🗑️ **One-Card Soft Delete**: Easy delete confirmation guarded by password (`123` by default). Synced globally to `data/deleted.json` if owner token is present.
- 📥 **100% Portable Data**: Export and import your personal progress (likes, saves, quiz SRS memory, custom cards) via JSON merge.
- 🤖 **Automated Daily Updates**: GitHub Actions runs automatically every morning at 08:00 Cairo time to generate 10 new, concrete, high-quality cards using Google Gemini with Groq fallback.

---

## 🛠️ Architecture

```
/
├── index.html                   # Clean, responsive single-page web app
├── styles.css                   # Modern dark UI with Cairo & Inter typography
├── app.js                       # Client-side state, SRS logic, infinite scroll & import/export
├── config/
│   ├── app.config.json          # App UI, intervals, and repo configuration
│   ├── generator.config.json    # AI model targets, review criteria & topic rotation
│   └── topics.json              # 14 curated skill topics with icons & Arabic titles
├── cards/                       # Small, portable JSON card batches
│   └── 2026/
│       └── 2026-11-12_seed_01.json # Cards #1 to #6
├── data/                        # Auto-generated indexes
│   ├── index.json               # Batch files list (newest first)
│   ├── numbers.json             # Permanent card ID -> #N map
│   ├── search.json              # Fast search index
│   └── deleted.json             # Soft-deleted card IDs
├── scripts/
│   ├── common.py                # Card validation & similarity algorithms
│   ├── build_index.py           # Validates cards, assigns #N, builds index
│   └── generate_daily.py        # Automated 10-card generator (Gemini + Groq)
└── .github/workflows/
    ├── build.yml                # Automatic build & deploy on push
    └── daily.yml                # Scheduled morning generation & deploy
```

---

## 🚀 Running Locally

You don't need any complex frameworks or package managers. Simply start any static HTTP server:

```bash
# Python built-in server:
python -m http.server 8000
```

Open `http://localhost:8000` in your browser.

To re-index or build search data:
```bash
python scripts/build_index.py
```

To run daily card generation manually:
```bash
export GEMINI_API_KEY="your-key"
export GROQ_API_KEY="your-key"
python scripts/generate_daily.py
```

---

## 🔒 Security & Secrets

- **Zero hardcoded credentials**: All API keys are stored exclusively as GitHub Actions Secrets (`GEMINI_API_KEY`, `GROQ_API_KEY`).
- **Owner Token**: Stored strictly in your browser's `localStorage` on your private devices. Never committed to git.
- **Client data**: Likes, saves, and quiz progress stay in your browser. No trackers, no accounts.
