#!/usr/bin/env python3
"""Verify an audit memo traces back to tool results and keeps owner inputs out.

Usage::

    uv run python scripts/check_memo.py <cutoff> [cutoff ...]
    uv run python scripts/check_memo.py --self-test [cutoff]

Extracts every number from ``out/memo_<cutoff>.md`` and confirms it traces
back to ``out/audit_<cutoff>_tools.json`` (tool arguments + results): a memo
number with decimals must equal a whole number token in the tool log, or be
a correct rounding of one (within half a unit of the memo number's last
decimal place); a memo number without a decimal point must equal a tool-log
number token or the integer part of an integer-valued tool number, never by
rounding. Also confirms words that appear in a ``condition_source`` in the
tool results but nowhere else in them stay inside the memo's Owner condition
section. Prints violations; exits 1 when one is found. ``--self-test``
plants fake and real numbers plus an owner-input phrase into a copy of the
memo text and asserts the fakes are caught and the real ones pass.
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NUMBER = re.compile(r"-?\d+(?:\.\d+)?")
WORD = re.compile(r"[A-Za-z]+")
OWNER_HEADING = re.compile(r"^#+\s*owner condition\s*$", re.IGNORECASE | re.MULTILINE)
ANY_HEADING = re.compile(r"^#+", re.MULTILINE)

SELF_TEST_FAKE = ["42", "8.88", "12.5"]
SELF_TEST_OWNER_PLANT = "prioritise the tram section"

# Function words and the "no input" marker: never treated as owner-only even
# when they appear only inside a condition_source.
OWNER_STOPWORDS = frozenset({
    "this", "that", "these", "those", "with", "from", "have", "will",
    "would", "should", "could", "about", "after", "before", "such",
    "into", "over", "under", "also", "there", "their", "they", "them",
    "then", "than", "when", "where", "which", "while", "here", "more",
    "most", "some", "each", "other", "only", "just", "very", "none",
})
OWNER_MIN_LEN = 4


def numbers(text: str) -> list[str]:
    return NUMBER.findall(text)


def _decimals(memo_num: str) -> int:
    if "." in memo_num:
        return len(memo_num.split(".")[1])
    return 0


def traces(memo_num: str, tool_tokens: set[str], tool_floats: list[float]) -> bool:
    """A memo number traces back iff it equals a whole tool-log number token;
    failing that, a number with decimals may be a correct rounding of a tool
    value (within half a unit of its last place), while a whole number must
    be the integer part of an integer-valued tool number (61 matches 61.0
    but not 61.4) and never matches by rounding."""
    if memo_num in tool_tokens:
        return True
    try:
        value = float(memo_num)
    except ValueError:
        return False
    if "." not in memo_num:
        try:
            ival = int(memo_num)
        except ValueError:
            return False
        return any(t.is_integer() and int(t) == ival for t in tool_floats)
    tol = 0.5 * 10 ** (-_decimals(memo_num))
    return any(abs(value - t) <= tol + 1e-12 for t in tool_floats)


def _condition_sources(calls) -> list[str]:
    """Non-empty condition_source strings from the tool log ("none" marks the
    absence of an owner input, not an input)."""
    out: list[str] = []

    def walk(node) -> None:
        if isinstance(node, dict):
            for key, val in node.items():
                if key == "condition_source" and isinstance(val, str):
                    if val.strip().lower() != "none":
                        out.append(val)
                else:
                    walk(val)
        elif isinstance(node, list):
            for val in node:
                walk(val)

    walk(calls)
    return out


def owner_only_words(calls) -> set[str]:
    """Lowercase words appearing in a condition_source but nowhere else in
    the tool results, minus short tokens and function words."""
    sources = _condition_sources(calls)
    cond_words = {w.lower() for src in sources for w in WORD.findall(src)}
    rest_text = json.dumps(calls, ensure_ascii=False)
    for src in sources:
        rest_text = rest_text.replace(src, " ")
    rest_words = {w.lower() for w in WORD.findall(rest_text)}
    return {w for w in cond_words - rest_words
            if len(w) >= OWNER_MIN_LEN and w not in OWNER_STOPWORDS}


def split_owner_section(memo: str) -> tuple[str, str]:
    """Split memo into (outside, inside) the Owner condition section: the
    inside spans from its heading to the next heading or the memo end."""
    match = OWNER_HEADING.search(memo)
    if match is None:
        return memo, ""
    start = match.end()
    nxt = ANY_HEADING.search(memo, start)
    end = nxt.start() if nxt else len(memo)
    return memo[:match.start()] + memo[end:], memo[start:end]


def owner_violations(memo: str, calls) -> list[str]:
    """Owner-only words appearing in the memo outside its Owner section."""
    outside, _ = split_owner_section(memo)
    words = {w.lower() for w in WORD.findall(outside)}
    return sorted(owner_only_words(calls) & words)


def check(cutoff: str) -> int:
    memo = (ROOT / "out" / f"memo_{cutoff}.md").read_text()
    log = json.loads((ROOT / "out" / f"audit_{cutoff}_tools.json").read_text())
    tool_text = json.dumps(log["calls"], ensure_ascii=False)
    tool_tokens = set(numbers(tool_text))
    tool_floats = [float(n) for n in numbers(tool_text)]
    found = numbers(memo)
    bad = [n for n in found if not traces(n, tool_tokens, tool_floats)]
    print(f"{cutoff}: {len(found)} numbers checked, "
          f"{len(found) - len(bad)} traceable, {len(bad)} untraceable")
    for n in bad:
        print(f"  UNTRACEABLE: {n}")
    only = owner_only_words(log["calls"])
    viol = owner_violations(memo, log["calls"])
    print(f"{cutoff}: {len(only)} owner-only words, "
          f"{len(viol)} outside the Owner condition section")
    for w in viol:
        print(f"  OWNER-INPUT: {w}")
    return 1 if (bad or viol) else 0


def _integer_probe(tool_tokens: set[str], tool_floats: list[float]) -> str | None:
    """An integer within 0.5 of a tool value that equals no tool integer:
    the old rounding rule would pass it, the exact rule must catch it."""
    tool_ints = {int(t) for t in tool_floats if t.is_integer()}
    for t in sorted(set(tool_floats)):
        if t.is_integer():
            continue
        cand = math.floor(t + 0.5)
        if (abs(cand - t) <= 0.5 + 1e-12
                and str(cand) not in tool_tokens and cand not in tool_ints):
            return str(cand)
    return None


def self_test(cutoff: str = "2024-09-01") -> int:
    """Plant fake and real numbers into a copy of the memo; assert the fakes
    are caught and the real ones pass. Also plants an owner-input phrase in
    the Action list and an integer near (but unequal to) a tool value."""
    memo = (ROOT / "out" / f"memo_{cutoff}.md").read_text()
    log = json.loads((ROOT / "out" / f"audit_{cutoff}_tools.json").read_text())
    tool_text = json.dumps(log["calls"], ensure_ascii=False)
    tool_tokens = set(numbers(tool_text))
    tool_floats = [float(n) for n in numbers(tool_text)]
    for n in SELF_TEST_FAKE:
        if traces(n, tool_tokens, tool_floats):
            print(f"SELF-TEST PREMISE BROKEN: fake number {n} traces to the "
                  f"{cutoff} tool log; pick another fake")
            return 1
    int_probe = _integer_probe(tool_tokens, tool_floats)
    if int_probe is None:
        print("SELF-TEST PREMISE BROKEN: no integer within 0.5 of a tool "
              f"value that equals none in the {cutoff} tool log")
        return 1
    if traces(int_probe, tool_tokens, tool_floats):
        print(f"SELF-TEST PREMISE BROKEN: integer probe {int_probe} traces")
        return 1
    if "4.241" in tool_tokens:
        real = ["4.241", "4.24"]
    else:
        cands = sorted(t for t in tool_tokens
                       if "." in t and len(t.split(".")[1]) >= 3)
        if not cands:
            print("SELF-TEST PREMISE BROKEN: no 3-decimal token in the tool log")
            return 1
        real = [cands[0], str(round(float(cands[0]), 2))]
    probe = (memo + "\nself-test plants: "
             + " ".join(SELF_TEST_FAKE + [int_probe] + real) + "\n")
    bad = {n for n in numbers(probe) if not traces(n, tool_tokens, tool_floats)}
    ok = True
    for n in SELF_TEST_FAKE:
        if n not in bad:
            print(f"SELF-TEST FAIL: planted fake {n} was not caught")
            ok = False
    if int_probe not in bad:
        print(f"SELF-TEST FAIL: planted integer {int_probe} was not caught")
        ok = False
    for n in real:
        if n in bad:
            print(f"SELF-TEST FAIL: real number {n} was wrongly flagged")
            ok = False
    only = owner_only_words(log["calls"])
    for w in ("tram", "section"):
        if w not in only:
            print(f"SELF-TEST PREMISE BROKEN: {w!r} is not an owner-only "
                  f"word in the {cutoff} tool log")
            return 1
    action_at = memo.find("Action list")
    if action_at < 0:
        print("SELF-TEST PREMISE BROKEN: no Action list in the memo")
        return 1
    plant_at = memo.find("\n", action_at) + 1
    owner_probe = (memo[:plant_at] + SELF_TEST_OWNER_PLANT + "\n"
                   + memo[plant_at:])
    viol = owner_violations(owner_probe, log["calls"])
    for w in ("tram", "section"):
        if w not in viol:
            print(f"SELF-TEST FAIL: planted owner phrase "
                  f"{SELF_TEST_OWNER_PLANT!r} was not caught (missing {w!r})")
            ok = False
    inside_probe = ("# self-test\n\n## Owner condition\n\n"
                    + " ".join(sorted(only)) + "\n")
    if owner_violations(inside_probe, log["calls"]):
        print("SELF-TEST FAIL: owner-only words inside the Owner condition "
              "section were wrongly flagged")
        ok = False
    if ok:
        print(f"self-test ({cutoff}): planted {SELF_TEST_FAKE} caught, "
              f"integer {int_probe} caught, real {real} passed, owner phrase "
              f"{SELF_TEST_OWNER_PLANT!r} caught")
    return 0 if ok else 1


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        rest = [a for a in argv if a != "--self-test"]
        return self_test(rest[0] if rest else "2024-09-01")
    return max((check(c) for c in argv), default=0)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1:]))
