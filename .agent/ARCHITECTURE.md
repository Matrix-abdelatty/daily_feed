# ARCHITECTURE
> Entries newest on top. Planned architecture — not implemented yet. Full detail in PLAN.md §3–§9.

## 2026-11-12 21:10 +02:00
```mermaid
flowchart LR
  A["Other AI tools / owner"] -->|"add JSON files"| C["cards/ folder"]
  D["daily.yml (cron) + Gemini"] -->|"10 cards/day"| C
  C --> B["build.yml: validate, number, index"]
  X["data/deleted.json"] --> B
  B --> P["GitHub Pages (static site)"]
  P --> U["Browser: feed, like, save, quiz"]
  U -->|"progress"| L["localStorage / IndexedDB"]
  U -->|"owner token: delete / compose"| C
  U -->|"owner token"| X
```
- Content (repo JSON) and progress (browser) are fully separate; linked only by card `id`.
- Config in `config/`; prompt in `prompts/card_prompt.md`; secrets outside the repo.

