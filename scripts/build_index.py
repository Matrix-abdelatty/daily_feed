"""
Build index, assign permanent card numbers & patch numbers, and generate search data for Daily Feed.
"""

from __future__ import annotations

import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

from common import (
    calculate_similarity,
    load_json,
    save_json,
    validate_card,
)

ROOT_DIR = Path(__file__).resolve().parent.parent
CARDS_DIR = ROOT_DIR / "cards"
DATA_DIR = ROOT_DIR / "data"
CONFIG_DIR = ROOT_DIR / "config"


def extract_date_str(batch_id: str, created_at: str, rel_path: str) -> str:
    """Extract YYYY-MM-DD from batch_id, created_at, or filename."""
    for candidate in (batch_id, created_at, rel_path):
        m = re.search(r"(\d{4}-\d{2}-\d{2})", str(candidate))
        if m:
            return m.group(1)
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _without_key(data: Any, key: str) -> Any:
    """Return a shallow copy of a dict excluding `key` for idempotent comparisons."""
    if isinstance(data, dict):
        return {k: v for k, v in data.items() if k != key}
    return data


def _preserve_timestamp_if_unchanged(
    path: Path,
    payload: Dict[str, Any],
    ts_key: str,
    force_update: bool = False,
) -> Tuple[Dict[str, Any], bool]:
    """Preserve existing timestamp if payload content (excluding ts_key) is unchanged."""
    existing = load_json(path)
    if (
        not force_update
        and isinstance(existing, dict)
        and isinstance(existing.get(ts_key), str)
        and existing.get(ts_key)
        and _without_key(existing, ts_key) == _without_key(payload, ts_key)
    ):
        updated = dict(payload)
        updated[ts_key] = existing[ts_key]
        return updated, False
    return payload, True


def build() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    generator_config = load_json(CONFIG_DIR / "generator.config.json") or {}
    sim_threshold = float(generator_config.get("similarity_threshold", 0.85))

    deleted_ids: Set[str] = set(load_json(DATA_DIR / "deleted.json") or [])
    numbers_map: Dict[str, int] = load_json(DATA_DIR / "numbers.json") or {}

    card_files = sorted(CARDS_DIR.glob("**/*.json"))
    if not card_files:
        print(f"[WARN] No card files found in {CARDS_DIR}")

    all_cards: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    accepted_by_topic: Dict[str, List[Tuple[str, str]]] = {}  # topic -> [(id, text)]
    skipped_cards: List[Dict[str, Any]] = []
    raw_file_entries: List[Dict[str, Any]] = []

    for file_path in card_files:
        rel_path = file_path.relative_to(ROOT_DIR).as_posix()
        batch_data = load_json(file_path)
        if not isinstance(batch_data, dict):
            skipped_cards.append({
                "file": rel_path,
                "card_id": "FILE_CORRUPT",
                "reason": "Root object is not a JSON dictionary",
            })
            continue

        raw_cards = batch_data.get("cards", [])
        if not isinstance(raw_cards, list):
            skipped_cards.append({
                "file": rel_path,
                "card_id": "FILE_CORRUPT",
                "reason": "'cards' field is not a list",
            })
            continue

        valid_in_file_ids: List[str] = []
        batch_created_at = batch_data.get("created_at") or datetime.now(timezone.utc).isoformat()
        batch_id = batch_data.get("batch_id") or file_path.stem
        source = batch_data.get("source") or "auto"
        date_str = extract_date_str(batch_id, batch_created_at, rel_path)

        for card in raw_cards:
            valid, err = validate_card(card)
            c_id = card.get("id") if isinstance(card, dict) else "UNKNOWN"

            if not valid:
                skipped_cards.append({
                    "file": rel_path,
                    "card_id": c_id,
                    "reason": f"Validation failed: {err}",
                })
                continue

            if c_id in seen_ids:
                skipped_cards.append({
                    "file": rel_path,
                    "card_id": c_id,
                    "reason": "Duplicate card ID already processed",
                })
                continue

            # Near-duplicate check within same topic
            topic = card["topic"]
            en_content = f"{card['en'].get('title', '')} {card['en'].get('action', '')}"
            is_dup = False
            for prev_id, prev_text in accepted_by_topic.get(topic, []):
                sim = calculate_similarity(en_content, prev_text)
                if sim >= sim_threshold:
                    skipped_cards.append({
                        "file": rel_path,
                        "card_id": c_id,
                        "reason": f"Too similar ({sim:.2f} >= {sim_threshold}) to '{prev_id}'",
                    })
                    is_dup = True
                    break

            if is_dup:
                continue

            seen_ids.add(c_id)
            accepted_by_topic.setdefault(topic, []).append((c_id, en_content))
            valid_in_file_ids.append(c_id)

            card_with_meta = dict(card)
            card_with_meta["_file"] = rel_path
            card_with_meta["_batch_id"] = batch_id
            all_cards.append(card_with_meta)

        raw_file_entries.append({
            "batch_id": batch_id,
            "path": rel_path,
            "date": date_str,
            "created_at": batch_created_at,
            "source": source,
            "card_count": len(valid_in_file_ids),
            "card_ids": valid_in_file_ids,
        })

    # Permanent Card Numbering:
    # Sort all valid cards chronologically by (created_at ascending, id ascending)
    all_cards_sorted = sorted(all_cards, key=lambda c: (c.get("created_at", ""), c.get("id", "")))

    current_max_number = max(numbers_map.values(), default=0)
    for card in all_cards_sorted:
        c_id = card["id"]
        if c_id not in numbers_map:
            current_max_number += 1
            numbers_map[c_id] = current_max_number

    # Save numbers.json
    save_json(DATA_DIR / "numbers.json", numbers_map)

    # Sort files chronologically (oldest first) to assign sequential Patch numbers (#1, #2, #3...)
    raw_file_entries.sort(key=lambda x: (x.get("created_at", ""), x.get("path", "")))
    file_summaries: List[Dict[str, Any]] = []
    for idx, entry in enumerate(raw_file_entries, start=1):
        c_nums = sorted([numbers_map[cid] for cid in entry["card_ids"] if cid in numbers_map])
        entry["patch_number"] = idx
        entry["card_numbers"] = c_nums
        entry["min_number"] = c_nums[0] if c_nums else 0
        entry["max_number"] = c_nums[-1] if c_nums else 0
        file_summaries.append(entry)

    # Sort patches descending by patch_number (newest patch on top)
    file_summaries.sort(key=lambda x: x["patch_number"], reverse=True)

    # Save index.json (patch listings)
    index_path = DATA_DIR / "index.json"
    index_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_files": len(file_summaries),
        "total_patches": len(file_summaries),
        "total_cards": len(all_cards),
        "batches_per_day_target": int(generator_config.get("batches_per_day", 3)),
        "batch_size_target": int(generator_config.get("batch_size", 5)),
        "files": file_summaries,
    }
    index_payload, index_changed = _preserve_timestamp_if_unchanged(
        index_path, index_payload, "generated_at"
    )
    save_json(index_path, index_payload)

    # Build search.json
    patch_by_file = {f["path"]: f["patch_number"] for f in file_summaries}
    search_records: List[Dict[str, Any]] = []
    for card in all_cards:
        c_id = card["id"]
        if c_id in deleted_ids:
            continue
        search_records.append({
            "id": c_id,
            "number": numbers_map.get(c_id, 0),
            "patch_number": patch_by_file.get(card.get("_file", ""), 0),
            "topic": card.get("topic"),
            "level": card.get("level", "beginner"),
            "tags": card.get("tags", []),
            "created_at": card.get("created_at"),
            "file": card.get("_file"),
            "en": {
                "title": card["en"].get("title", ""),
                "hook": card["en"].get("hook", ""),
                "key_phrase": card["en"].get("key_phrase", ""),
            },
            "ar": {
                "title": card["ar"].get("title", ""),
                "hook": card["ar"].get("hook", ""),
                "key_phrase": card["ar"].get("key_phrase", ""),
            },
        })

    # Sort search records by number descending (newest on top)
    search_records.sort(key=lambda r: r.get("number", 0), reverse=True)
    save_json(DATA_DIR / "search.json", search_records)

    # Save build report
    report_path = DATA_DIR / "build_report.json"
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_files_scanned": len(card_files),
        "total_patches": len(file_summaries),
        "total_valid_cards": len(all_cards),
        "total_active_search_cards": len(search_records),
        "deleted_cards_count": len(deleted_ids),
        "highest_card_number": current_max_number,
        "skipped_cards_count": len(skipped_cards),
        "skipped_details": skipped_cards,
    }
    report, _ = _preserve_timestamp_if_unchanged(
        report_path, report, "timestamp", force_update=index_changed
    )
    save_json(report_path, report)

    print(
        f"[OK] Build complete: {len(file_summaries)} patches ({len(all_cards)} cards) indexed, "
        f"highest card #{current_max_number}. Skipped {len(skipped_cards)}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(build())
