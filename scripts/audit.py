#!/usr/bin/env python3
"""Run the Muse Spark audit agent for one cutoff (phase 3).

Usage::

    uv run python scripts/audit.py <cutoff>

Writes ``out/memo_<cutoff>.md``, ``out/audit_<cutoff>_tools.json`` and
``out/hazards_<cutoff>.geojson``. Stops without spending when MODEL_API_KEY
is missing or the API returns 401.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from radartwin.agents.sitrep import run_sitrep  # noqa: E402


def main(cutoff: str) -> int:
    try:
        result = run_sitrep(cutoff)
    except RuntimeError as exc:
        print(f"audit stopped: {exc}")
        return 1
    print(f"memo:    {result['memo']}")
    print(f"tools:   {result['tools']} ({result['n_calls']} calls)")
    print(f"hazards: {result['hazard']}")
    print(f"usage:   {result['usage']}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))
