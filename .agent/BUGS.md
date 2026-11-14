# BUGS
> Entries newest on top.

## 2026-11-14 05:56 +02:00 — Resolved: GitHub Actions `build.yml` Step 5 Exit Code 1 & Deprecation Annotations
- **Symptom:** Run `#1` (`43293335657` on commit `e615b63`) failed at Step 5 (`Commit build artifacts if changed`) with exit code `1`; runs also emitted `Node.js 20 is deprecated` warning (`checkout@v4`, `setup-python@v5`, `configure-pages@v5`, `upload-artifact@v4`, `deploy-pages@v4`) and `"ubuntu-latest label will migrate to Ubuntu 26"` notice.
- **Root Cause:** `scripts/build_index.py` wrote new `generated_at` / `timestamp` values on every run even with identical data, causing `git pull --rebase origin main` in `build.yml` Step 5 to hit unresolvable merge conflicts in `data/index.json` / `data/build_report.json` whenever `origin/main` had advanced (e.g., on workflow re-runs or concurrent pushes).
- **Fix:** Made `scripts/build_index.py` preserve unchanged timestamps, hardened git sync/push steps in `.github/workflows/build.yml` and `.github/workflows/daily.yml`, pinned `runs-on: ubuntu-24.04`, and upgraded actions to native Node 24 tags (`checkout@v7`, `setup-python@v7`, `configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5`).

## 2026-11-12 21:10 +02:00
- None (no code yet).

