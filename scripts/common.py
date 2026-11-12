"""
Shared utilities for Daily Feed scripts.
"""

from __future__ import annotations

import difflib
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ALLOWED_TOPICS = {
    "sales", "negotiation", "pricing", "persuasion", "communication",
    "meetings", "psychology", "productivity", "business", "money",
    "leadership", "decision_making", "career", "learning",
}

ALLOWED_LEVELS = {"beginner", "intermediate", "advanced"}

REQUIRED_TEXT_FIELDS = [
    "title", "hook", "action", "when", "why", "example", "mistake"
]


def load_json(path: Path) -> Any:
    """Load JSON file safely with UTF-8 encoding."""
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: Any, indent: int = 2) -> None:
    """Save data to JSON file with UTF-8 encoding and clean indentation."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)
        f.write("\n")


def normalize_text(text: str) -> str:
    """Normalize text for similarity matching."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    return " ".join(text.split())


def calculate_similarity(text1: str, text2: str) -> float:
    """Calculate ratio similarity between two strings."""
    norm1 = normalize_text(text1)
    norm2 = normalize_text(text2)
    if not norm1 or not norm2:
        return 0.0
    return difflib.SequenceMatcher(None, norm1, norm2).ratio()


def validate_card(card: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """Validate a single card against schema v1."""
    if not isinstance(card, dict):
        return False, "Card is not a dictionary"

    card_id = card.get("id")
    if not card_id or not isinstance(card_id, str):
        return False, "Missing or invalid card 'id'"

    topic = card.get("topic")
    if topic not in ALLOWED_TOPICS:
        return False, f"Invalid topic '{topic}'. Must be one of {sorted(ALLOWED_TOPICS)}"

    level = card.get("level", "beginner")
    if level not in ALLOWED_LEVELS:
        return False, f"Invalid level '{level}'. Must be beginner, intermediate, or advanced"

    en = card.get("en")
    ar = card.get("ar")
    if not isinstance(en, dict):
        return False, "Missing 'en' dictionary"
    if not isinstance(ar, dict):
        return False, "Missing 'ar' dictionary"

    needs_completion = bool(card.get("needs_completion", False))

    if not needs_completion:
        # Check EN fields
        for field in REQUIRED_TEXT_FIELDS:
            val = en.get(field)
            if not val or not isinstance(val, str) or not val.strip():
                return False, f"Missing or empty en.{field}"

        # Check AR fields
        for field in REQUIRED_TEXT_FIELDS:
            val = ar.get(field)
            if not val or not isinstance(val, str) or not val.strip():
                return False, f"Missing or empty ar.{field}"

        # Check quiz
        quiz = card.get("quiz")
        if not isinstance(quiz, dict):
            return False, "Missing 'quiz' dictionary"

        c_idx = quiz.get("correct_index")
        if c_idx not in (0, 1, 2, 3):
            return False, f"Invalid quiz correct_index: {c_idx}"

        for lang in ("en", "ar"):
            lq = quiz.get(lang)
            if not isinstance(lq, dict):
                return False, f"Missing quiz.{lang}"
            if not lq.get("question") or not isinstance(lq["question"], str):
                return False, f"Missing quiz.{lang}.question"
            opts = lq.get("options")
            if not isinstance(opts, list) or len(opts) != 4 or not all(isinstance(o, str) and o.strip() for o in opts):
                return False, f"quiz.{lang}.options must be an array of exactly 4 non-empty strings"
            if not lq.get("explanation") or not isinstance(lq["explanation"], str):
                return False, f"Missing quiz.{lang}.explanation"

    return True, None
