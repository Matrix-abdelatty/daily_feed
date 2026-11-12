"""
Daily card generation script for Daily Feed.
Generates 3 patches of 5 cards per day (15 cards total) using:
  1. gemini-3.8-flash (Primary)
  2. gemini-3.5-flash (Secondary)
  3. Groq openai/gpt-oss-120b (Emergency backup only)
Includes backoff retries for 503/429 and surgical single-card replacement if any card in a 5-card batch is rejected.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

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

    env_file = ROOT_DIR / ".env"
    if env_file.exists():
        with env_file.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("GEMINI_API_KEY=") and not gemini_key:
                    gemini_key = line.split("=", 1)[1].strip().strip("\"'")
                elif line.startswith("GROQ_API_KEY=") and not groq_key:
                    groq_key = line.split("=", 1)[1].strip().strip("\"'")

    return gemini_key, groq_key


def pick_topics_for_batches(batches_count: int = 3, batch_size: int = 5) -> List[List[str]]:
    """
    Pick `batches_count` groups of `batch_size` distinct topics.
    Ensures every batch of 5 has 5 DIFFERENT topics, rotating least-recent first.
    """
    search_data = load_json(DATA_DIR / "search.json") or []
    topic_counts: Dict[str, int] = {t: 0 for t in ALLOWED_TOPICS}
    for item in search_data[:60]:
        t = item.get("topic")
        if t in topic_counts:
            topic_counts[t] += 1

    all_batches: List[List[str]] = []
    for _ in range(batches_count):
        sorted_topics = sorted(topic_counts.keys(), key=lambda t: (topic_counts[t], t))
        chosen = sorted_topics[:batch_size]
        for t in chosen:
            topic_counts[t] += 1
        all_batches.append(chosen)

    return all_batches


def clean_json_text(raw_text: str) -> str:
    """Strip markdown fences and trim whitespace."""
    raw_text = raw_text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw_text)
    if match:
        return match.group(1).strip()
    return raw_text


def call_gemini_with_retry(
    api_key: str,
    model_name: str,
    prompt: str,
    backoff_seconds: Tuple[int, ...] = (15, 35, 60),
) -> Optional[str]:
    """Call Google Gemini API with automatic backoff on 503/429 spikes."""
    clean_model = model_name.replace("models/", "")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "responseMimeType": "application/json",
        },
    }
    data_bytes = json.dumps(payload).encode("utf-8")

    attempts = len(backoff_seconds) + 1
    for attempt in range(attempts):
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={"Content-Type": "application/json", "User-Agent": "DailyFeed/2.0"},
        )
        try:
            with urllib.request.urlopen(req, timeout=110) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts and parts[0].get("text"):
                        return parts[0].get("text")
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < len(backoff_seconds):
                wait_s = backoff_seconds[attempt]
                print(f"[WARN] {clean_model} HTTP {e.code} (demand spike). Waiting {wait_s}s before retry {attempt + 1}...")
                time.sleep(wait_s)
                continue
            print(f"[WARN] Gemini {clean_model} failed with HTTP {e.code}")
            break
        except Exception as e:
            print(f"[WARN] Gemini {clean_model} error: {e}")
            if attempt < len(backoff_seconds):
                time.sleep(backoff_seconds[attempt])
                continue
            break
    return None


def call_groq(api_key: str, model_name: str, prompt: str) -> Optional[str]:
    """Call Groq chat completion API as emergency backup."""
    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "system",
                "content": "You are an elite bilingual (English + Egyptian Arabic) practical skills coach. Output ONLY valid JSON.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.65,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "DailyFeed/2.0",
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


def call_model_chain(
    prompt: str,
    gemini_key: Optional[str],
    groq_key: Optional[str],
    gemini_models: List[str],
    groq_model: str,
) -> Tuple[Optional[str], str]:
    """Try gemini-3.8-flash -> gemini-3.5-flash -> groq emergency backup."""
    if gemini_key:
        for gm in gemini_models:
            print(f"[INFO] Requesting batch from {gm}...")
            res = call_gemini_with_retry(gemini_key, gm, prompt)
            if res:
                return res, gm

    if groq_key:
        print(f"[INFO] Falling back to emergency backup Groq ({groq_model})...")
        res = call_groq(groq_key, groq_model, prompt)
        if res:
            return res, f"groq:{groq_model}"

    return None, "none"


def is_card_unique_and_deep(
    card: Dict[str, Any],
    existing_texts: List[str],
    seen_ids: Set[str],
    sim_threshold: float,
) -> Tuple[bool, Optional[str]]:
    """Verify schema, minimum depth, and deduplication against existing cards."""
    ok, err = validate_card(card)
    if not ok:
        return False, err

    c_id = card["id"]
    if c_id in seen_ids:
        return False, f"Duplicate id {c_id}"

    en_title = card["en"].get("title", "")
    en_action = card["en"].get("action", "")
    en_example = card["en"].get("example", "")
    ar_title = card["ar"].get("title", "")

    if len(en_action.strip()) < 30 or len(en_example.strip()) < 35 or len(ar_title.strip()) < 8:
        return False, "Card content too shallow/short"

    candidate_text = f"{en_title} {en_action}"
    for prev in existing_texts:
        if calculate_similarity(candidate_text, prev) >= sim_threshold:
            return False, f"Too similar to existing card: {en_title}"

    return True, None


def generate_daily_cards(max_batches: Optional[int] = None) -> int:
    gemini_key, groq_key = get_api_keys()
    if not gemini_key and not groq_key:
        print("[ERROR] Neither GEMINI_API_KEY nor GROQ_API_KEY found. Exiting.")
        return 1

    gen_config = load_json(CONFIG_DIR / "generator.config.json") or {}
    batch_size = int(gen_config.get("batch_size", 5))
    batches_per_day = int(gen_config.get("batches_per_day", 3))
    sim_threshold = float(gen_config.get("similarity_threshold", 0.85))
    gemini_models = gen_config.get("gemini_models") or ["gemini-3.8-flash", "gemini-3.5-flash"]
    groq_model = gen_config.get("groq_model", "openai/gpt-oss-120b")

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    year_str = datetime.now(timezone.utc).strftime("%Y")
    output_dir = CARDS_DIR / year_str
    output_dir.mkdir(parents=True, exist_ok=True)

    # Check how many auto batches already exist today
    existing_today_files = sorted(output_dir.glob(f"{today_str}_auto_*.json"))
    start_batch_idx = len(existing_today_files) + 1
    if max_batches is None and start_batch_idx > batches_per_day:
        print(f"[INFO] Today ({today_str}) already has {len(existing_today_files)} auto patches. Nothing to generate.")
        run_build_index()
        return 0

    prompt_path = ROOT_DIR / gen_config.get("prompt_file", "prompts/card_prompt.md")
    if not prompt_path.exists():
        print(f"[ERROR] Prompt file not found: {prompt_path}")
        return 1
    prompt_template = prompt_path.read_text(encoding="utf-8")

    # Load existing cards for deduplication
    search_data = load_json(DATA_DIR / "search.json") or []
    seen_ids: Set[str] = {item.get("id", "") for item in search_data}
    existing_texts: List[str] = [
        f"{item.get('en', {}).get('title', '')} {item.get('en', {}).get('hook', '')}"
        for item in search_data
    ]
    recent_titles: List[str] = [
        f"- [{item.get('topic')}] {item.get('en', {}).get('title')}"
        for item in search_data[: int(gen_config.get("recent_titles_limit", 150))]
    ]

    batches_to_generate = max_batches if max_batches is not None else max(1, batches_per_day - len(existing_today_files))
    topic_batches = pick_topics_for_batches(batches_to_generate, batch_size)

    patches_created = 0

    for b_offset, batch_topics in enumerate(topic_batches):
        batch_num = start_batch_idx + b_offset
        batch_id = f"{today_str}_auto_{batch_num:02d}"
        now_iso = datetime.now(timezone.utc).isoformat()
        existing_titles_str = "\n".join(recent_titles[:150]) if recent_titles else "None yet."

        prompt = (
            prompt_template.replace("{{MODE}}", "GENERATE")
            .replace("{{N}}", str(batch_size))
            .replace("{{TOPICS}}", ", ".join(batch_topics))
            .replace("{{BATCH_ID}}", batch_id)
            .replace("{{CREATED_AT}}", now_iso)
            .replace("{{SOURCE}}", "gemini-3.8-flash")
            .replace("{{DATE}}", today_str)
            .replace("{{EXISTING_TITLES}}", existing_titles_str)
            .replace("{{RAW_NOTES}}", "None")
        )

        raw_resp, source_used = call_model_chain(prompt, gemini_key, groq_key, gemini_models, groq_model)
        if not raw_resp:
            print(f"[ERROR] Could not generate batch {batch_id}. Stopping.")
            break

        accepted_cards: List[Dict[str, Any]] = []
        try:
            parsed = json.loads(clean_json_text(raw_resp))
            candidate_cards = parsed.get("cards", [])
        except Exception as e:
            print(f"[WARN] Failed to parse JSON for {batch_id}: {e}")
            candidate_cards = []

        for idx, card in enumerate(candidate_cards):
            if not isinstance(card, dict):
                continue
            # Ensure unique ID prefix with batch_num
            raw_id = str(card.get("id", f"{today_str}_{card.get('topic', 'skill')}_{idx+1}"))
            if raw_id in seen_ids:
                raw_id = f"{raw_id}-{batch_num}{idx+1}"
            card["id"] = raw_id
            card["created_at"] = now_iso

            ok, reason = is_card_unique_and_deep(card, existing_texts, seen_ids, sim_threshold)
            if ok:
                accepted_cards.append(card)
                seen_ids.add(card["id"])
                existing_texts.append(f"{card['en'].get('title', '')} {card['en'].get('action', '')}")
                recent_titles.insert(0, f"- [{card.get('topic')}] {card['en'].get('title')}")
            else:
                print(f"[WARN] Rejected card in {batch_id}: {reason}")

        # Surgical single-call repair if 1 or 2 cards were rejected so patch still has 5 cards
        missing_count = batch_size - len(accepted_cards)
        if 0 < missing_count <= batch_size:
            print(f"[INFO] Surgical repair: generating {missing_count} replacement card(s) for {batch_id}...")
            repair_topics = batch_topics[-missing_count:]
            repair_prompt = (
                prompt_template.replace("{{MODE}}", "GENERATE")
                .replace("{{N}}", str(missing_count))
                .replace("{{TOPICS}}", ", ".join(repair_topics))
                .replace("{{BATCH_ID}}", f"{batch_id}_repair")
                .replace("{{CREATED_AT}}", now_iso)
                .replace("{{SOURCE}}", source_used)
                .replace("{{DATE}}", today_str)
                .replace("{{EXISTING_TITLES}}", "\n".join(recent_titles[:150]))
                .replace("{{RAW_NOTES}}", "None")
            )
            rep_resp, _ = call_model_chain(repair_prompt, gemini_key, groq_key, gemini_models, groq_model)
            if rep_resp:
                try:
                    rep_cards = json.loads(clean_json_text(rep_resp)).get("cards", [])
                    for r_idx, r_card in enumerate(rep_cards):
                        if len(accepted_cards) >= batch_size:
                            break
                        if not isinstance(r_card, dict):
                            continue
                        r_id = str(r_card.get("id", f"{today_str}_repair_{batch_num}_{r_idx}"))
                        if r_id in seen_ids:
                            r_id = f"{r_id}-r{r_idx}"
                        r_card["id"] = r_id
                        r_card["created_at"] = now_iso
                        ok, _ = is_card_unique_and_deep(r_card, existing_texts, seen_ids, sim_threshold)
                        if ok:
                            accepted_cards.append(r_card)
                            seen_ids.add(r_card["id"])
                            existing_texts.append(f"{r_card['en'].get('title', '')} {r_card['en'].get('action', '')}")
                            recent_titles.insert(0, f"- [{r_card.get('topic')}] {r_card['en'].get('title')}")
                except Exception as e:
                    print(f"[WARN] Surgical repair parse error: {e}")

        if accepted_cards:
            out_file = output_dir / f"{batch_id}.json"
            save_json(
                out_file,
                {
                    "schema_version": 1,
                    "batch_id": batch_id,
                    "created_at": now_iso,
                    "source": source_used,
                    "cards": accepted_cards[:batch_size],
                },
            )
            patches_created += 1
            print(f"[OK] Saved Patch {batch_id} ({len(accepted_cards[:batch_size])} cards) via {source_used}")

        # Pause between batches to respect per-minute rate limits
        if b_offset < len(topic_batches) - 1:
            time.sleep(8)

    run_build_index()
    return 0 if patches_created > 0 else 1


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generate daily cards")
    parser.add_argument("--batches", "-b", type=int, default=None, help="Number of batches (cards) to generate")
    args = parser.parse_args()
    sys.exit(generate_daily_cards(max_batches=args.batches))
