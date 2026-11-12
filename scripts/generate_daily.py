"""
Daily card generation script for Daily Feed using Gemini and Groq APIs.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from build_index import build as run_build_index
from common import (
    ALLOWED_TOPICS,
    calculate_similarity,
    load_json,
    save_json,
    validate_card,
)

ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT_DIR / "config"
DATA_DIR = ROOT_DIR / "data"
CARDS_DIR = ROOT_DIR / "cards"
PROMPTS_DIR = ROOT_DIR / "prompts"


def get_api_keys() -> Tuple[Optional[str], Optional[str]]:
    """Read API keys from environment or local .env if available."""
    gemini_key = os.environ.get("GEMINI_API_KEY")
    groq_key = os.environ.get("GROQ_API_KEY")

    # Optional local .env fallback for local manual runs
    env_file = ROOT_DIR / ".env"
    if env_file.exists():
        with env_file.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("GEMINI_API_KEY=") and not gemini_key:
                    gemini_key = line.split("=", 1)[1].strip().strip('"\'')
                elif line.startswith("GROQ_API_KEY=") and not groq_key:
                    groq_key = line.split("=", 1)[1].strip().strip('"\'')

    return gemini_key, groq_key


def pick_target_topics(count: int = 10) -> List[str]:
    """Rotate topics to balance variety."""
    search_data = load_json(DATA_DIR / "search.json") or []
    topic_counts: Dict[str, int] = {t: 0 for t in ALLOWED_TOPICS}
    for item in search_data[:50]:  # Look at recent cards
        t = item.get("topic")
        if t in topic_counts:
            topic_counts[t] += 1

    # Sort topics by least frequently seen recently
    sorted_topics = sorted(topic_counts.keys(), key=lambda t: (topic_counts[t], t))
    return sorted_topics[:count]


def clean_json_text(raw_text: str) -> str:
    """Strip markdown fences and trim whitespace."""
    raw_text = raw_text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw_text)
    if match:
        return match.group(1).strip()
    return raw_text


def call_gemini(api_key: str, model_name: str, prompt: str) -> Optional[str]:
    """Call Google Gemini Generative Language API."""
    clean_model = model_name.replace("models/", "")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "responseMimeType": "application/json",
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "DailyFeed/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text")
    except Exception as e:
        print(f"[WARN] Gemini API call failed: {e}")
    return None


def call_groq(api_key: str, model_name: str, prompt: str) -> Optional[str]:
    """Call Groq chat completion API as fallback."""
    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "system",
                "content": "You are a bilingual skills generator that outputs ONLY valid JSON.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.6,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "DailyFeed/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            choices = data.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content")
    except Exception as e:
        print(f"[WARN] Groq API call failed: {e}")
    return None


def generate_daily_cards() -> int:
    gemini_key, groq_key = get_api_keys()
    if not gemini_key and not groq_key:
        print("[ERROR] Neither GEMINI_API_KEY nor GROQ_API_KEY found. Exiting.")
        return 1

    gen_config = load_json(CONFIG_DIR / "generator.config.json") or {}
    cards_per_day = int(gen_config.get("cards_per_day", 10))
    gemini_model = gen_config.get("gemini_model", "gemini-2.5-flash")
    groq_model = gen_config.get("groq_model", "llama-3.3-70b-versatile")
    preferred_provider = gen_config.get("provider", "gemini")

    chosen_topics = pick_target_topics(cards_per_day)

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    year_str = datetime.now(timezone.utc).strftime("%Y")
    now_iso = datetime.now(timezone.utc).isoformat()

    # Load prompt template
    prompt_path = ROOT_DIR / gen_config.get("prompt_file", "prompts/card_prompt.md")
    if not prompt_path.exists():
        print(f"[ERROR] Prompt file not found: {prompt_path}")
        return 1
    with prompt_path.open("r", encoding="utf-8") as f:
        prompt_template = f.read()

    # Load recent titles to avoid repetition
    search_data = load_json(DATA_DIR / "search.json") or []
    recent_titles = [
        f"- [{item.get('topic')}] {item.get('en', {}).get('title')}"
        for item in search_data[: int(gen_config.get("recent_titles_limit", 100))]
    ]
    existing_titles_str = "\n".join(recent_titles) if recent_titles else "None yet."

    batch_id = f"{today_str}_auto_01"
    prompt = (
        prompt_template.replace("{{MODE}}", "GENERATE")
        .replace("{{N}}", str(cards_per_day))
        .replace("{{TOPICS}}", ", ".join(chosen_topics))
        .replace("{{BATCH_ID}}", batch_id)
        .replace("{{CREATED_AT}}", now_iso)
        .replace("{{SOURCE}}", "auto")
        .replace("{{DATE}}", today_str)
        .replace("{{EXISTING_TITLES}}", existing_titles_str)
        .replace("{{RAW_NOTES}}", "None")
    )

    raw_response: Optional[str] = None
    source_used = "unknown"

    if preferred_provider == "gemini" and gemini_key:
        print(f"[INFO] Calling Gemini ({gemini_model})...")
        raw_response = call_gemini(gemini_key, gemini_model, prompt)
        source_used = "gemini"

    if not raw_response and groq_key:
        print(f"[INFO] Calling Groq ({groq_model}) as fallback...")
        raw_response = call_groq(groq_key, groq_model, prompt)
        source_used = "groq"

    if not raw_response and gemini_key and preferred_provider != "gemini":
        print(f"[INFO] Calling Gemini ({gemini_model}) as fallback...")
        raw_response = call_gemini(gemini_key, gemini_model, prompt)
        source_used = "gemini"

    if not raw_response:
        print("[ERROR] All AI generation providers failed. Keeping existing cards intact.")
        return 1

    cleaned_text = clean_json_text(raw_response)
    try:
        parsed_batch = json.loads(cleaned_text)
    except Exception as e:
        print(f"[ERROR] Failed to parse AI JSON response: {e}")
        return 1

    raw_cards = parsed_batch.get("cards", [])
    if not isinstance(raw_cards, list) or not raw_cards:
        print("[ERROR] AI response contains no 'cards' array.")
        return 1

    valid_cards: List[Dict[str, Any]] = []
    for card in raw_cards:
        is_valid, err = validate_card(card)
        if is_valid:
            valid_cards.append(card)
        else:
            print(f"[WARN] Skipped invalid card from AI: {err}")

    if not valid_cards:
        print("[ERROR] None of the generated cards passed validation.")
        return 1

    output_dir = CARDS_DIR / year_str
    output_dir.mkdir(parents=True, exist_ok=True)
    out_file = output_dir / f"{batch_id}.json"

    batch_payload = {
        "schema_version": 1,
        "batch_id": batch_id,
        "created_at": now_iso,
        "source": source_used,
        "cards": valid_cards,
    }
    save_json(out_file, batch_payload)
    print(f"[OK] Saved {len(valid_cards)} new cards to {out_file.relative_to(ROOT_DIR)}")

    # Update index and search
    run_build_index()
    return 0


if __name__ == "__main__":
    sys.exit(generate_daily_cards())
