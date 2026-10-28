"""Situation report: run the audit agent, write memo + hazard layer (SPEC §6.2)."""
from __future__ import annotations

import json
import pickle
from pathlib import Path

from radartwin.agents.audit import run_audit, write_hazard_layer_file

ROOT = Path(__file__).resolve().parent.parent.parent
STATE_PATH = ROOT / "out" / "dresden_state.pkl"
CHIP_PATH = ROOT / "data" / "carola" / "s1_rtc_vv.tif"


def run_sitrep(cutoff: str, out_dir: str | Path = ROOT / "out") -> dict:
    """Run the audit agent for ``cutoff``; write memo, tool log, hazard layer."""
    out_dir = Path(out_dir)
    with open(STATE_PATH, "rb") as fh:
        state = pickle.load(fh)
    if cutoff not in state["cutoffs"]:
        raise KeyError(f"cutoff {cutoff} not in state")
    chip = CHIP_PATH if CHIP_PATH.exists() else None
    result = run_audit(cutoff, state, out_dir, s1_rtc_vv=chip)
    memo_path = out_dir / f"memo_{cutoff}.md"
    memo_path.write_text(f"# RadarTwin audit memo — {cutoff}\n\n{result['memo'].strip()}\n")
    tools_path = out_dir / f"audit_{cutoff}_tools.json"
    tools_path.write_text(json.dumps(
        {"cutoff": cutoff, "usage": result["usage"], "calls": result["tool_log"]}, indent=1))
    hazard_path = result["hazard_path"]
    if hazard_path is None or not Path(hazard_path).exists():
        from radartwin.decide.coverage import not_monitored_bridges

        analysed = sorted(state["bridges"]["name"].tolist())
        dropped = sorted(not_monitored_bridges()["asset"].tolist())
        assets = sorted(analysed + dropped)
        hazard_path = write_hazard_layer_file(
            state, cutoff, assets, out_dir / f"hazards_{cutoff}.geojson", s1_rtc_vv=chip)
    return {"memo": memo_path, "tools": tools_path, "hazard": Path(hazard_path),
            "usage": result["usage"], "n_calls": len(result["tool_log"])}
