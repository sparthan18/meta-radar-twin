"""Model-backed risk decisions with Muse Spark (SPEC §5.0).

One request carries the three single-letter multiple-choice questions (motion
pattern, risk level, inspection); it is sampled ``K_VOTES`` times at
temperature 1 and the per-field vote shares are the probabilities. The probe
(README "Muse Spark notes") found ``logprobs`` and ``n > 1`` rejected by the
API, so votes from sequential ``n = 1`` calls are the only supported method.
The per-field majority vote is the answer; a tie goes to the tied option that
appeared first across the samples (fixed rule, decided before any run).

The model sees the §3.6 features and §4 flags only: never the rubric verdict
(it would copy it) and never the owner condition (it stays an external
overlay). The input builder whitelists exactly those keys, so callers passing
richer rows cannot leak verdict-derived fields. Responses are cached on disk
under ``out/cache/`` keyed by a hash of the request plus the sample index (the
index is part of the key so the five votes stay distinct and re-runs reproduce
them at zero cost); every element of the key is a constant, so keys are stable
across processes. Transient API errors are retried; a persistent failure is
recorded in the row's ``error`` field, never silently replaced by the rubric.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import threading
import time
from collections.abc import Mapping
from pathlib import Path

import pandas as pd
from openai import (
    APIConnectionError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    InternalServerError,
    RateLimitError,
)

from radartwin.agents.llm import get_client, model_name

MODEL = "muse-spark-1.3"
K_VOTES = 5
SPARE_SAMPLES = 3  # extra sample indices drawn only to replace unparseable replies
TEMPERATURE_VOTES = 1
# Reasoning effort: SPEC §5.0 orders the lowest setting the API offers when
# reasoning tokens dominate, and they do (~360 of ~1120 tokens per call).
# "minimal" is that setting: the probe confirmed the API accepts it, and every
# attempt at "none" either 400d or behaved identically with reasoning
# continuing. The effort is a CONSTANT on purpose: resolving it lazily per
# process made cache keys unstable across processes (a fresh process hashes
# "none" while entries were stored under "minimal"), silently re-drawing
# cached samples. Never put a runtime-resolved value in the cache key.
REASONING_EFFORT = "minimal"
MAX_TOKENS = 1000  # completion budget: reasoning plus the three-letter answer
MAX_ATTEMPTS = 3  # per sample, on transient errors


def reasoning_effort() -> str:
    """Reasoning effort used for every call (constant by design, see above)."""
    return REASONING_EFFORT

ROOT = Path(__file__).resolve().parent.parent.parent
CACHE_DIR = ROOT / "out" / "cache"

PATTERN_OPTIONS = (
    ("A", "stable", "No meaningful motion; velocities within the noise floor."),
    ("B", "uniform_settlement", "The whole asset moves together at a steady rate; low strain."),
    ("C", "differential", "Parts of the asset move at clearly different rates; induces strain."),
    ("D", "accelerating", "Motion is speeding up compared with the asset's longer-term behaviour."),
    ("E", "unreliable", "Too few points or tracks to judge."),
)
RISK_OPTIONS = (
    ("A", "none", "Routine monitoring only."),
    ("B", "watch", "Keep on the watchlist; re-evaluate at the next data update."),
    ("C", "elevated", "Schedule a targeted review of the flagged spans within the year."),
    ("D", "high", "Schedule a field inspection within the quarter."),
)
INSPECT_OPTIONS = (
    ("A", True, "yes"),
    ("B", False, "no"),
)
INSPECT_QUESTION = "Should a field inspection be scheduled within the next quarter?"

PATTERN_BY_LETTER = {letter: value for letter, value, _ in PATTERN_OPTIONS}
RISK_BY_LETTER = {letter: value for letter, value, _ in RISK_OPTIONS}
INSPECT_BY_LETTER = {letter: value for letter, value, _ in INSPECT_OPTIONS}

ANSWER_RE = re.compile(r"\s*([A-E])\s+([A-D])\s+([A-B])\s*")

SYSTEM_PROMPT = """You are a structural-health screening assistant. Judge each \
asset only from its radar features and flags, never from identity or \
outside knowledge of particular structures or events.

Principles: bulk motion below the noise floor is scatter; unusualness is \
judged against same-instrument peers, not fixed numbers; differential motion \
strains, uniform settlement rarely concerns; exceeding its own record \
deserves attention; a record exceedance at one end is the strongest warning; \
only a live warning is top risk, past warnings linger lower then become \
evidence; thin or blind measurement caps at the watchlist, never inspection; \
owner grades are outside your verdict.

Answer with exactly three uppercase letters separated by single spaces: \
pattern, risk, inspection. Nothing else."""

# Fixed anonymised ids, assigned once by OSM asset id order (dresden_bridges.csv
# sorted by asset_id), never by risk. The order is a constant so cache keys are
# stable across processes.
_ANON_ORDER = (
    "Albertbrücke",
    "Bismarckbrücke",
    "Budapester Straße",
    "Carolabrücke",
    "Dienstgehsteig",
    "Löbtauer Brücke",
    "Löbtauer Straße",
    "Marienbrücke",
    "Marienbrücke II",
    "Nossener Brücke",
    "Pieschener Mole",
    "Pieschener Molenbrücke",
    "Prießnitztalviadukt",
    "Schlachthofbrücke",
    "Schlachthofstraße",
    "Stadtbahnstrecke Löbtau-Südvorstadt-Strehlen",
    "Stauffenbergallee",
    "Waldschlößchenbrücke",
    "Waltherstraße",
)
ANON_BY_ASSET = {name: f"bridge {idx:02d}" for idx, name in enumerate(_ANON_ORDER, start=1)}
ANON_UNKNOWN = "bridge 00"


def anonymised_asset(asset: str) -> str:
    """Stable id revealing nothing; fixed OSM-id order, never risk order."""
    return ANON_BY_ASSET.get(asset, ANON_UNKNOWN)


# Exactly the SPEC §3.6 feature keys the model may see: the full COLUMNS list
# from features.py minus the owner condition and its source. This is a
# WHITELIST on purpose: callers pass rows that also carry flags, the rubric
# verdict and metadata, and a blacklist silently let rubric-derived fields
# (owner_condition_alert, source, reason) and duplicated flags into the model
# input while splitting the cache between callers with different row shapes.
MODEL_FEATURE_KEYS = frozenset({
    "asset",
    "cutoff",
    "scatterers",
    "tracks",
    "spans",
    "long_term_velocity_mm_yr",
    "max_span_velocity_change_mm_yr",
    "span_to_span_spread_mm_yr",
    "anomaly_score",
    "score_vs_own_history_z",
    "rank_in_city",
    "bridges_in_city",
    "city_p80_velocity_change_mm_yr",
    "city_p80_spread_mm_yr",
    "escalations_12m",
    "months_since_esc",
    "points_per_ha",
    "bright_fraction",
    "radar_coverage",
})

_usage = {"prompt_tokens": 0, "completion_tokens": 0, "calls": 0, "cached": 0}
_usage_lock = threading.Lock()


def reset_usage() -> None:
    """Zero the session token counters (cached hits never touch them)."""
    with _usage_lock:
        for key in _usage:
            _usage[key] = 0


def get_usage() -> dict:
    """Copy of the session token counters for fresh API calls only."""
    with _usage_lock:
        return dict(_usage)


def _clean(value):
    """JSON-canonical scalar: NaN -> None, numpy -> builtin, integral float -> int.

    The int canonicalization is load-bearing for the cache: the decisions
    table upcasts integer columns with NaN rows (e.g. rank_in_city, NaN for
    not-monitored bridges) to float, while the feature table keeps them int.
    ``1.0 == 1`` in Python but they serialize differently, so without this
    the two paths hash the same asset to different keys.
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, float) and not math.isfinite(value):
        return None
    try:
        import numpy as np

        if isinstance(value, (np.floating,)) and not math.isfinite(float(value)):
            return None
        if isinstance(value, (np.integer,)):
            return int(value)
        if isinstance(value, (np.bool_,)):
            return bool(value)
        if isinstance(value, (np.floating,)):
            value = float(value)
    except ImportError:
        pass
    if isinstance(value, float):
        value = round(value, 3)
        if value.is_integer():
            return int(value)
        return value
    return value


def build_model_input(
    features: Mapping | pd.Series, flag_values: Mapping, anonymous: bool = False,
) -> dict:
    """Compact §3.6 features + §4 flags, minus rubric verdict and owner condition.

    With ``anonymous=True``, ``asset`` becomes the stable "bridge NN" id and
    ``cutoff`` is removed; everything else is identical. Named is the default,
    so existing cache keys and results are unchanged.
    """
    feats = dict(features) if isinstance(features, Mapping) else features.to_dict()
    payload = {key: _clean(feats[key]) for key in sorted(MODEL_FEATURE_KEYS) if key in feats}
    if anonymous:
        if "asset" in payload:
            payload["asset"] = anonymised_asset(str(feats.get("asset", "")))
        payload.pop("cutoff", None)
    payload["flags"] = {name: bool(flag_values.get(name, False)) for name in (
        "moving", "accelerating", "differential", "outlier",
        "low_quality", "low_coverage", "escalate",
    )}
    return payload


def build_user_prompt(model_input: dict) -> str:
    """The three single-letter multiple-choice questions over one asset."""
    body = json.dumps(model_input, separators=(",", ":"), sort_keys=True)
    pattern_opts = " ".join(f"{letter}. {value}: {text}" for letter, value, text in PATTERN_OPTIONS)
    risk_opts = " ".join(f"{letter}. {value}: {text}" for letter, value, text in RISK_OPTIONS)
    return (
        f"Radar features and flags for one asset, mm/yr:\n{body}\n"
        f"Motion pattern: {pattern_opts} "
        f"Risk level: {risk_opts} "
        f"Inspection (A. yes / B. no): {INSPECT_QUESTION} "
        "Reply: three uppercase letters, single-spaced, nothing else."
    )


def _cache_key(model_input: dict, sample: int | str) -> str:
    blob = json.dumps({
        "model": MODEL,
        "system": SYSTEM_PROMPT,
        "input": model_input,
        "temperature": TEMPERATURE_VOTES,
        "max_tokens": MAX_TOKENS,
        "reasoning_effort": reasoning_effort(),
        "sample": sample,
    }, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.json"


def _record_cached() -> None:
    with _usage_lock:
        _usage["cached"] += 1


def _record_call(prompt_tokens: int, completion_tokens: int) -> None:
    with _usage_lock:
        _usage["prompt_tokens"] += prompt_tokens
        _usage["completion_tokens"] += completion_tokens
        _usage["calls"] += 1


def _attempt(messages: list[dict], effort: str):
    client = get_client()
    model = model_name()
    return client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=TEMPERATURE_VOTES,
        max_tokens=MAX_TOKENS,
        n=1,
        reasoning_effort=effort,
    )


def _call_model(messages: list[dict]) -> tuple[str | None, dict, str | None]:
    """One Chat Completion; returns (text, usage, error). Retries transient errors."""
    last_error: str | None = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            resp = _attempt(messages, REASONING_EFFORT)
        except AuthenticationError as exc:
            raise RuntimeError(
                "Meta API returned 401: MODEL_API_KEY is bad or expired. "
                "Regenerate it and update .env; nothing further was spent."
            ) from exc
        except BadRequestError as exc:
            return None, {}, f"bad request: {exc}"
        except (RateLimitError, APITimeoutError, APIConnectionError,
                InternalServerError) as exc:
            last_error = f"{type(exc).__name__}: {exc}"
            time.sleep(2 ** attempt)
            continue
        usage = {}
        if resp.usage is not None:
            usage = {
                "prompt_tokens": resp.usage.prompt_tokens or 0,
                "completion_tokens": resp.usage.completion_tokens or 0,
            }
            _record_call(usage["prompt_tokens"], usage["completion_tokens"])
        if not resp.choices:
            return None, usage, "empty response: no choices"
        msg = resp.choices[0].message
        if resp.choices[0].finish_reason == "length":
            return None, usage, "cut off by max_tokens"
        return (msg.content or "").strip(), usage, None
    return None, {}, f"transient error persisted after {MAX_ATTEMPTS} attempts: {last_error}"


def _parse_answer(text: str | None) -> tuple[str, str, bool] | None:
    if not text:
        return None
    match = ANSWER_RE.fullmatch(text)
    if not match:
        return None
    return (
        PATTERN_BY_LETTER[match.group(1)],
        RISK_BY_LETTER[match.group(2)],
        INSPECT_BY_LETTER[match.group(3)],
    )


def _sample_votes(
    model_input: dict, start_sample: int = 0,
) -> tuple[list[tuple[str, str, bool]], str | None]:
    """Draw up to K_VOTES parsed samples, using cached responses when present.

    ``start_sample`` shifts the sample indices so an independent second draw
    (noise baseline) never hits the first draw's cache entries.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_user_prompt(model_input)},
    ]
    samples: list[tuple[str, str, bool]] = []
    problems: list[str] = []
    sample_idx = start_sample
    while len(samples) < K_VOTES and sample_idx < start_sample + K_VOTES + SPARE_SAMPLES:
        key = _cache_key(model_input, sample_idx)
        path = _cache_path(key)
        if path.exists():
            entry = json.loads(path.read_text())
            _record_cached()
            text, error = entry.get("text"), entry.get("error")
        else:
            text, usage, error = _call_model(messages)
            if error is None:
                # Cache genuine responses only (even unparseable ones, so
                # re-runs reproduce the same draws); transport failures are
                # retried fresh on the next run instead of poisoning the cache.
                entry = {"key": key, "sample": sample_idx, "text": text,
                         "usage": usage, "error": error,
                         "effort": reasoning_effort()}
                tmp = path.with_suffix(".tmp")
                tmp.write_text(json.dumps(entry))
                tmp.rename(path)
        parsed = _parse_answer(text) if error is None else None
        if parsed is None:
            problems.append(f"sample {sample_idx}: {error or f'unparseable {text!r}'}")
        else:
            samples.append(parsed)
        sample_idx += 1
    error = None
    if not samples:
        error = "; ".join(problems) or "no samples"
    elif len(samples) < K_VOTES:
        error = f"only {len(samples)}/{K_VOTES} samples parsed: " + "; ".join(problems)
    return samples, error


def _majority(values: list) -> tuple:
    """Most-voted value and its share; ties go to the first-appearing option."""
    counts: dict = {}
    first_at: dict = {}
    for idx, value in enumerate(values):
        counts[value] = counts.get(value, 0) + 1
        first_at.setdefault(value, idx)
    best = max(counts, key=lambda v: (counts[v], -first_at[v]))
    return best, counts[best] / len(values)


def decide_with_model(
    features: Mapping | pd.Series, flag_values: Mapping,
    anonymous: bool = False, start_sample: int = 0,
) -> dict:
    """Ask Muse Spark the three decision questions; return values + probabilities."""
    model_input = build_model_input(features, flag_values, anonymous=anonymous)
    samples, error = _sample_votes(model_input, start_sample=start_sample)
    if not samples:
        return {
            "pattern": None, "risk_level": None, "needs_inspection": None,
            "p_pattern": None, "p_risk": None, "p_inspect": None,
            "prob_method": "votes", "source": MODEL, "error": error,
        }
    pattern, p_pattern = _majority([s[0] for s in samples])
    risk, p_risk = _majority([s[1] for s in samples])
    inspect, p_inspect = _majority([s[2] for s in samples])
    return {
        "pattern": pattern,
        "risk_level": risk,
        "needs_inspection": bool(inspect),
        "p_pattern": round(p_pattern, 3),
        "p_risk": round(p_risk, 3),
        "p_inspect": round(p_inspect, 3),
        "prob_method": "votes",
        "source": MODEL,
        "error": error,
    }


def is_cached(
    features: Mapping | pd.Series, flag_values: Mapping,
    anonymous: bool = False, start_sample: int = 0,
) -> bool:
    """True when all K_VOTES samples for this asset are already on disk."""
    model_input = build_model_input(features, flag_values, anonymous=anonymous)
    return all(_cache_path(_cache_key(model_input, i)).exists()
               for i in range(start_sample, start_sample + K_VOTES))


def vote_shares(
    features: Mapping | pd.Series, flag_values: Mapping,
    anonymous: bool = False, start_sample: int = 0,
) -> dict:
    """Full per-option vote shares (reads the same cache; costs nothing extra)."""
    model_input = build_model_input(features, flag_values, anonymous=anonymous)
    samples, error = _sample_votes(model_input, start_sample=start_sample)
    n = len(samples) or 1
    counts_p: dict = {}
    counts_r: dict = {}
    counts_i: dict = {}
    for sample in samples:
        counts_p[sample[0]] = counts_p.get(sample[0], 0) + 1
        counts_r[sample[1]] = counts_r.get(sample[1], 0) + 1
        counts_i[sample[2]] = counts_i.get(sample[2], 0) + 1
    return {
        "pattern": {v: round(counts_p.get(v, 0) / n, 3) for _, v, _ in PATTERN_OPTIONS},
        "risk": {v: round(counts_r.get(v, 0) / n, 3) for _, v, _ in RISK_OPTIONS},
        "inspect": {"yes": round(counts_i.get(True, 0) / n, 3),
                    "no": round(counts_i.get(False, 0) / n, 3)},
        "n": len(samples),
        "error": error,
    }
