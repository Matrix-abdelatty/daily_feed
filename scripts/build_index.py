"""
Build index, assign permanent numbers, and generate search data for Daily Feed.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Set

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
    file_summaries: List[Dict[str, Any]] = []

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
            all_cards.append(card_with_meta)

        file_summaries.append({
            "path": rel_path,
            "created_at": batch_created_at,
            "card_count": len(valid_in_file_ids),
            "card_ids": valid_in_file_ids,
        })

    # Sort files by created_at descending (newest on top)
    file_summaries.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    # Permanent Numbering:
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

    # Save index.json (file listings)
    save_json(DATA_DIR / "index.json", {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_files": len(file_summaries),
        "total_cards": len(all_cards),
        "files": file_summaries,
    })

    # Build search.json
    search_records: List[Dict[str, Any]] = []
    for card in all_cards:
        c_id = card["id"]
        if c_id in deleted_ids:
            continue
        search_records.append({
            "id": c_id,
            "number": numbers_map.get(c_id, 0),
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
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_files_scanned": len(card_files),
        "total_valid_cards": len(all_cards),
        "total_active_search_cards": len(search_records),
        "deleted_cards_count": len(deleted_ids),
        "highest_card_number": current_max_number,
        "skipped_cards_count": len(skipped_cards),
        "skipped_details": skipped_cards,
    }
    save_json(DATA_DIR / "build_report.json", report)

    print(f"[OK] Build complete: {len(all_cards)} cards indexed, highest number #{current_max_number}. Skipped {len(skipped_cards)}.")
    return 0


if __name__ == "__main__":
    sys.exit(build())
