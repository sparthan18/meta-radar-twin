"""Muse Spark tool-calling audit agent (SPEC §6.2).

The agent narrates evidence from deterministic tools only; it never computes
or invents numbers. Every number in the memo must come from a tool result.
Tool loop is capped at 25 calls; when the cap is hit the agent is asked to
write the memo with what it has.
"""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import pandas as pd
from openai import AuthenticationError

from radartwin.agents import fidelity as fidelity_mod
from radartwin.agents.llm import get_client, model_name
from radartwin.decide import model as model_mod
from radartwin.decide.coverage import not_monitored_bridges
from radartwin.decide.features import asset_features
from radartwin.decide.rubric import decide, flags

MAX_TOOL_CALLS = 25
MAX_TOKENS = 32000  # completion budget includes reasoning tokens

SYSTEM_PROMPT = """You are the RadarTwin audit engineer writing the engineering memo for one cutoff date. \
You narrate evidence; you never compute, estimate, or invent numbers.

Grounding (hard rules — violating them fails the audit):
- Every number (anything with digits) in the memo MUST be copied exactly from a tool result \
received in this run. No arithmetic, no totals, no counts across assets, no percentages, \
no probabilities, no thresholds from memory. Say "only", "no other", or "none" instead of counting.
- Describe methods and rules in words, never with digits: "above the city-wide level for this \
cutoff", "exceeds anything in this asset's history", "motion concentrated at one end". \
Do not state numeric thresholds.
- Do not use numbered section headings or numbered lists (their digits cannot be grounded). \
Use named headings and bulleted lists.
- Do not name model or sensor versions with digits (no "Sentinel-1", "SAM 3.1", "L2b", or similar); \
say "the radar mission", "EGMS", "the segmentation model".
- Do not mention token counts, prices, context windows, or the tool-call budget.
- Write in plain engineer-facing English. Never write phrasing like "flag X present", \
"needs inspection absent", or "flag differential present". Say what the bridge is doing \
and what to do about it.
- Never write raw field names (points_per_ha, escalations_12m, months_since_esc, \
score_vs_own_history_z, or similar). Write them as plain words with units, for example \
"3.6 radar points per hectare", "escalated 3 times in the past 12 months, most recently \
this month", "4.24 times its own usual variation". Numbers still come from tool results \
unchanged or correctly rounded.
- Radar evidence only outside the Owner condition section: the Verdict, the Action list \
(both the "why" and the "what to do" columns) and the Evidence section MUST use only \
radar-derived tool results (flags, decisions, features, spans, visibility). Owner inputs \
(the condition grade and its source text) appear ONLY in the Owner condition section, \
always labelled as an external input with their source quoted. Do not name sections, \
materials or components that appear only in owner-supplied text anywhere outside that \
section, and do not reuse owner-source wording (such as tram, section, renovation, \
schedule, record) there.
- The "what to do" column may point inspectors at a part of the bridge only from span \
evidence: name the end or span and quote its span-series value from get_span_series, \
for example "focus on the span at the end moving up against its neighbours" with that \
span's mm/yr value quoted from this run's span series.
- When the months-since-escalation value is 0, write "escalated this month", never \
"0.0 months ago". Format all month counts as whole numbers (for example "2 months ago", \
not "2.0 months ago").
- The Action list and Watch list follow the MODEL decision: the Action list holds \
bridges the model rates high, the Watch list holds bridges the model rates elevated \
or watch. The "why" column still cites radar evidence (flags, features, spans) in a \
few words, never probabilities.
- Quote model probabilities exactly as shown in the tool results (for example 0.6), \
as decimals, never as percent. Probabilities appear only in the Model and rubric \
section.
- If a model decision carries an error instead of a verdict, say so in the Model and \
rubric section and place that bridge by its rubric risk, labelled as the rubric's.

Work plan (be economical with tool calls):
- Start with list_assets, then get_decisions once to survey every bridge in a single call.
- Then pull get_asset_features and get_span_series only for bridges that need action or discussion.
- Finish by calling write_hazard_layer once with the full asset list from list_assets.

Memo structure, in this order, with named headings (no numbers):
- Verdict: two or three sentences naming the bridges that need action now and why, from \
radar evidence only; never mention the owner condition here. The bridges that need action \
are the ones the model rates high.
- Action list: a Markdown table with columns bridge, risk, why in a few words, what to do. \
Only bridges the model rates high. Both the "why" and the "what to do" columns cite radar \
evidence only, pointing at bridge parts only from span evidence.
- Watch list: one line per bridge the model rates elevated or watch, saying what is \
being watched.
- Model and rubric: a short section listing every bridge where the model and the rubric \
give different risk levels, with the model's probability in plain words. If they agree \
everywhere, write one line saying so, without counts.
- Not monitored by radar: one line per bridge, with its point count, saying it needs another \
inspection method and that this is not a sign it is safe.
- Evidence for each bridge the model rates high: the key numbers with units, and the \
escalation history (how many times it escalated in the past 12 months and how many months \
since the most recent escalation, in plain words; "escalated this month" when that count \
is 0, month counts as whole numbers). Quote the feature values behind each verdict. Radar \
evidence only; never repeat owner-supplied words here.
- Owner condition: the ONLY section where owner inputs appear. Give the overlay result \
and its source, labelled as an external input with the source quoted.
- Caveats: EGMS latency (about a year), model decisions with probabilities, data-quality \
limits. State that EGMS releases lag the present by about a year, so a cutoff reflects \
earlier conditions and a real operator at the time would have seen older data. Say plainly \
that today's decisions come from the Muse Spark model with probabilities (the share of \
five repeated judgments), checked against an independent deterministic rubric applied to \
the same features. State data-quality limits: thinly measured assets carry wide uncertainty.
- For EVERY asset whose features show low radar coverage, write all three: radar sees little of \
that structure, so it needs another inspection method, and this is not a sign the bridge is safe.

You have at most 25 tool calls; be economical. Start with list_assets."""

TOOLS = [
    {"type": "function", "function": {
        "name": "list_assets",
        "description": "List the analysed and not-monitored bridge assets at a cutoff.",
        "parameters": {"type": "object", "properties": {
            "cutoff": {"type": "string", "description": "Cutoff date YYYY-MM-DD."}},
            "required": ["cutoff"]}}},
    {"type": "function", "function": {
        "name": "get_asset_features",
        "description": "Pre-computed trend features for one asset at a cutoff.",
        "parameters": {"type": "object", "properties": {
            "asset": {"type": "string"}, "cutoff": {"type": "string"}},
            "required": ["asset", "cutoff"]}}},
    {"type": "function", "function": {
        "name": "get_span_series",
        "description": "Per-span vertical anomaly history (mm/yr) for one asset at cutoffs up to and including this run's cutoff.",
        "parameters": {"type": "object", "properties": {
            "asset": {"type": "string"}}, "required": ["asset"]}}},
    {"type": "function", "function": {
        "name": "get_decision",
        "description": "Deterministic flags, Muse Spark decision with probabilities (model_decision, decides the Action and Watch lists), and rubric decision (decision, independent check) for one asset at a cutoff.",
        "parameters": {"type": "object", "properties": {
            "asset": {"type": "string"}, "cutoff": {"type": "string"}},
            "required": ["asset", "cutoff"]}}},
    {"type": "function", "function": {
        "name": "get_decisions",
        "description": "Flags, model decisions with probabilities and rubric decisions for every bridge at a cutoff, including not-monitored ones, in one call. Action and Watch membership follow the model decision.",
        "parameters": {"type": "object", "properties": {
            "cutoff": {"type": "string", "description": "Cutoff date YYYY-MM-DD."}},
            "required": ["cutoff"]}}},
    {"type": "function", "function": {
        "name": "radar_visibility",
        "description": "Radar coverage for one asset: scatterer density, bright fraction, ok/low.",
        "parameters": {"type": "object", "properties": {
            "asset": {"type": "string"}}, "required": ["asset"]}}},
    {"type": "function", "function": {
        "name": "write_hazard_layer",
        "description": "Write the GeoJSON hazard layer for the given assets at this cutoff.",
        "parameters": {"type": "object", "properties": {
            "assets": {"type": "array", "items": {"type": "string"}}},
            "required": ["assets"]}}},
]


def _round(value):
    if isinstance(value, float):
        return round(value, 3)
    if isinstance(value, dict):
        return {k: _round(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_round(v) for v in value]
    return value


def _jsonable(value):
    if isinstance(value, float) and (value != value):
        return None
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    try:
        import numpy as np

        if isinstance(value, (np.integer,)):
            return int(value)
        if isinstance(value, (np.floating,)):
            return _jsonable(float(value))
        if isinstance(value, (np.bool_,)):
            return bool(value)
    except ImportError:
        pass
    return value


class AuditTools:
    """The deterministic tools bound to one cutoff and state."""

    def __init__(self, state: dict, cutoff: str, out_path: Path,
                 s1_rtc_vv: str | Path | None = None):
        self.state = state
        self.cutoff = cutoff
        self.out_path = out_path
        self.s1_rtc_vv = s1_rtc_vv
        self._features: pd.DataFrame | None = None
        self._visibility: pd.DataFrame | None = None
        self._dropped: gpd.GeoDataFrame | None = None
        self.hazard_path: Path | None = None

    @property
    def analysed(self) -> list[str]:
        return sorted(self.state["bridges"]["name"].tolist())

    @property
    def dropped(self) -> gpd.GeoDataFrame:
        if self._dropped is None:
            self._dropped = not_monitored_bridges()
        return self._dropped

    @property
    def dropped_names(self) -> list[str]:
        return sorted(self.dropped["asset"].tolist()) if len(self.dropped) else []

    @property
    def assets(self) -> list[str]:
        return sorted(self.analysed + self.dropped_names)

    def _check_cutoff(self, cutoff: str) -> str | None:
        if cutoff != self.cutoff or cutoff not in self.state["cutoffs"]:
            return json.dumps({"error": f"unknown cutoff {cutoff!r}; this run covers {self.cutoff}"})
        return None

    def _check_asset(self, asset: str) -> str | None:
        if asset not in self.assets:
            return json.dumps({"error": f"unknown asset {asset!r}", "assets": self.assets})
        return None

    def _feature_table(self) -> pd.DataFrame:
        if self._features is None:
            self._features = asset_features(self.state, self.cutoff, s1_rtc_vv=self.s1_rtc_vv)
        return self._features

    def _visibility_table(self) -> pd.DataFrame:
        if self._visibility is None:
            self._visibility = fidelity_mod.radar_visibility(self.state, self.s1_rtc_vv)
        return self._visibility

    def _dropped_row(self, asset: str) -> dict:
        d = self.dropped.set_index("asset").loc[asset]
        feats = self._feature_table()
        p80_vel = float(feats["city_p80_velocity_change_mm_yr"].iloc[0])
        p80_spread = float(feats["city_p80_spread_mm_yr"].iloc[0])
        return {
            "asset": asset,
            "cutoff": self.cutoff,
            "scatterers": int(d["scatterers"]),
            "tracks": int(d["tracks"]),
            "spans": 0,
            "long_term_velocity_mm_yr": None,
            "max_span_velocity_change_mm_yr": None,
            "span_to_span_spread_mm_yr": None,
            "anomaly_score": None,
            "score_vs_own_history_z": None,
            "rank_in_city": None,
            "bridges_in_city": int(len(self.analysed)),
            "city_p80_velocity_change_mm_yr": p80_vel,
            "city_p80_spread_mm_yr": p80_spread,
            "condition": "unknown",
            "condition_source": "none",
            "escalations_12m": 0,
            "months_since_esc": None,
            "points_per_ha": float(d["points_per_ha"]),
            "bright_fraction": None,
            "radar_coverage": "none",
            "reason": str(d["reason"]),
        }

    def _model_decision_for(self, asset: str) -> dict:
        """Muse Spark decision with probabilities (SPEC §5.0).

        Not-monitored bridges keep the deterministic verdict without an API
        call; analysed bridges reuse the cached model decisions when the
        cutoff was already run with ``decisions.py --model``. A persistent
        model error is returned as-is, never replaced by the rubric.
        """
        if asset in self.dropped_names:
            return {
                "pattern": "not_monitored",
                "risk_level": "unknown",
                "needs_inspection": False,
                "p_pattern": None,
                "p_risk": None,
                "p_inspect": None,
                "prob_method": "votes",
                "source": model_mod.MODEL,
                "error": "not monitored by radar: not sent to the model",
            }
        row = self._feature_table().set_index("asset").loc[asset]
        fl = flags(row)
        feats = row.to_dict()
        # set_index() dropped the asset name; restore it so the model input
        # (hence the cache key) matches the decisions path exactly. Without
        # this the audit silently re-draws every cached sample.
        feats["asset"] = asset
        return model_mod.decide_with_model(feats, fl)

    def _decision_for(self, asset: str) -> dict:
        if asset in self.dropped_names:
            row = self._dropped_row(asset)
            return {
                "asset": asset,
                "cutoff": self.cutoff,
                "flags": {
                    "moving": False, "accelerating": False, "differential": False,
                    "outlier": False, "low_quality": False, "low_coverage": False,
                    "escalate": False,
                },
                "decision": {
                    "pattern": "not_monitored",
                    "risk_level": "unknown",
                    "needs_inspection": False,
                    "owner_condition_alert": False,
                    "source": "rubric",
                },
                "model_decision": self._model_decision_for(asset),
                "scatterers": row["scatterers"],
                "tracks": row["tracks"],
                "points_per_ha": row["points_per_ha"],
                "radar_coverage": "none",
                "reason": row["reason"],
            }
        row = self._feature_table().set_index("asset").loc[asset]
        fl = flags(row)
        dec = decide(row, fl)
        return {"asset": asset, "cutoff": self.cutoff, "flags": fl, "decision": dec,
                "model_decision": self._model_decision_for(asset)}

    def list_assets(self, cutoff: str) -> str:
        if (err := self._check_cutoff(cutoff)) is not None:
            return err
        return json.dumps({
            "cutoff": cutoff,
            "assets": self.assets,
            "not_monitored": self.dropped_names,
        })

    def get_asset_features(self, asset: str, cutoff: str) -> str:
        if (err := self._check_cutoff(cutoff)) is not None:
            return err
        if (err := self._check_asset(asset)) is not None:
            return err
        if asset in self.dropped_names:
            return json.dumps(_round(_jsonable(self._dropped_row(asset))))
        row = self._feature_table().set_index("asset").loc[asset].to_dict()
        return json.dumps(_round(_jsonable(row)))

    def get_span_series(self, asset: str) -> str:
        if (err := self._check_asset(asset)) is not None:
            return err
        if asset in self.dropped_names:
            return json.dumps({"asset": asset, "error": "not monitored by radar: no spans"})
        roll = self.state["rolls"][asset]
        meta = self.state["meta"][asset]
        spans = {}
        for span in roll.columns:
            # Retrospective guard: never return cutoffs after this run's cutoff.
            series = {c: (None if pd.isna(v) else round(float(v), 2))
                      for c, v in roll[span].items() if c <= self.cutoff}
            spans[str(span)] = {
                "n": int(meta.loc[span, "n"]),
                "tracks": int(meta.loc[span, "tracks"]),
                "vertical_mm_yr_positive_up": series,
            }
        return json.dumps({"asset": asset, "spans": spans})

    def get_decision(self, asset: str, cutoff: str) -> str:
        if (err := self._check_cutoff(cutoff)) is not None:
            return err
        if (err := self._check_asset(asset)) is not None:
            return err
        return json.dumps(_round(_jsonable(self._decision_for(asset))))

    def get_decisions(self, cutoff: str) -> str:
        if (err := self._check_cutoff(cutoff)) is not None:
            return err
        out = [self._decision_for(a) for a in self.assets]
        return json.dumps(_round(_jsonable({"cutoff": cutoff, "decisions": out})))

    def radar_visibility(self, asset: str) -> str:
        if (err := self._check_asset(asset)) is not None:
            return err
        if asset in self.dropped_names:
            d = self.dropped.set_index("asset").loc[asset]
            return json.dumps({"asset": asset, **_round(_jsonable({
                "points_per_ha": float(d["points_per_ha"]),
                "bright_fraction": None,
                "radar_coverage": "none",
                "reason": str(d["reason"]),
            }))})
        row = self._visibility_table().set_index("asset").loc[asset].to_dict()
        return json.dumps({"asset": asset, **_round(_jsonable(row))})

    def write_hazard_layer(self, assets: list[str]) -> str:
        unknown = [a for a in assets if a not in self.assets]
        if unknown:
            return json.dumps({"error": f"unknown assets {unknown}", "assets": self.assets})
        if not assets:
            return json.dumps({"error": "assets is empty; pass the full asset list"})
        self.hazard_path = write_hazard_layer_file(
            self.state, self.cutoff, assets, self.out_path,
            s1_rtc_vv=self.s1_rtc_vv, dropped=self.dropped)
        return json.dumps({"written": str(self.hazard_path), "n_assets": len(assets)})

    def dispatch(self, name: str, arguments: dict) -> str:
        return getattr(self, name)(**arguments)


def write_hazard_layer_file(
    state: dict,
    cutoff: str,
    assets: list[str],
    path: str | Path,
    s1_rtc_vv: str | Path | None = None,
    dropped: gpd.GeoDataFrame | None = None,
) -> Path:
    """Bridge polygons with features, flags and decision as properties."""
    feats = asset_features(state, cutoff, s1_rtc_vv=s1_rtc_vv).set_index("asset")
    recs = []
    bridges = state["bridges"]
    for _, b in bridges[bridges["name"].isin(assets)].iterrows():
        row = feats.loc[b["name"]]
        fl = flags(row)
        dec = decide(row, fl)
        props = {"name": b["name"], "cutoff": cutoff}
        for key, val in row.to_dict().items():
            if key in ("asset", "cutoff"):
                continue
            props[key] = _jsonable(val)
        props.update(fl)
        props.update(dec)
        props["reason"] = ""
        recs.append({**props, "geometry": b["geometry"]})
    wanted_dropped = [a for a in assets if a not in set(bridges["name"].tolist())]
    if wanted_dropped:
        if dropped is None:
            dropped = not_monitored_bridges()
        sub = dropped[dropped["asset"].isin(wanted_dropped)]
        p80_vel = float(feats["city_p80_velocity_change_mm_yr"].iloc[0])
        p80_spread = float(feats["city_p80_spread_mm_yr"].iloc[0])
        for _, d in sub.iterrows():
            props = {
                "name": d["asset"], "cutoff": cutoff,
                "scatterers": int(d["scatterers"]), "tracks": int(d["tracks"]),
                "spans": 0,
                "long_term_velocity_mm_yr": None,
                "max_span_velocity_change_mm_yr": None,
                "span_to_span_spread_mm_yr": None,
                "anomaly_score": None, "score_vs_own_history_z": None,
                "rank_in_city": None, "bridges_in_city": int(len(bridges)),
                "city_p80_velocity_change_mm_yr": p80_vel,
                "city_p80_spread_mm_yr": p80_spread,
                "condition": "unknown", "condition_source": "none",
                "escalations_12m": 0, "months_since_esc": None,
                "points_per_ha": float(d["points_per_ha"]),
                "bright_fraction": None, "radar_coverage": "none",
                "moving": False, "accelerating": False, "differential": False,
                "outlier": False, "low_quality": False, "low_coverage": False,
                "escalate": False, "reason": str(d["reason"]),
                "pattern": "not_monitored", "risk_level": "unknown",
                "needs_inspection": False, "owner_condition_alert": False,
                "source": "rubric",
            }
            recs.append({**props, "geometry": d["geometry"]})
    gdf = gpd.GeoDataFrame(recs, crs="EPSG:4326")
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(path, driver="GeoJSON")
    return path


def _check_finish(resp, context: str) -> None:
    finish = resp.choices[0].finish_reason if resp.choices else None
    if finish == "length":
        raise RuntimeError(
            f"audit memo cut off by max_tokens ({context}): refusing to write a partial memo"
        )


def run_audit(
    cutoff: str,
    state: dict,
    out_dir: str | Path,
    s1_rtc_vv: str | Path | None = None,
    max_tool_calls: int = MAX_TOOL_CALLS,
) -> dict:
    """Run the audit agent for one cutoff; return memo, tool log and usage."""
    out_dir = Path(out_dir)
    tools = AuditTools(state, cutoff, out_dir / f"hazards_{cutoff}.geojson", s1_rtc_vv)
    client = get_client()
    model = model_name()
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Write the engineering memo for cutoff {cutoff}."},
    ]
    tool_log: list[dict] = []
    prompt_tokens = completion_tokens = 0
    empty_memo_nudges = 0
    try:
        while len(tool_log) < max_tool_calls:
            resp = client.chat.completions.create(
                model=model, messages=messages, tools=TOOLS, temperature=0, max_tokens=MAX_TOKENS)
            if resp.usage is not None:
                prompt_tokens += resp.usage.prompt_tokens or 0
                completion_tokens += resp.usage.completion_tokens or 0
            msg = resp.choices[0].message
            calls = msg.tool_calls or []
            if not calls:
                _check_finish(resp, f"cutoff {cutoff}")
                if not (msg.content or "").strip() and empty_memo_nudges < 2:
                    empty_memo_nudges += 1
                    messages.append({"role": "assistant", "content": msg.content or ""})
                    messages.append({"role": "user", "content": (
                        "Your previous reply was empty. Reply now with the full "
                        "engineering memo text only, no tool calls.")})
                    continue
                messages.append({"role": "assistant", "content": msg.content or ""})
                memo = msg.content or ""
                break
            messages.append({
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {"id": c.id, "type": "function", "function": {
                        "name": c.function.name,
                        "arguments": c.function.arguments or "{}"}}
                    for c in calls],
            })
            for call in calls:
                args = json.loads(call.function.arguments or "{}")
                try:
                    result = tools.dispatch(call.function.name, args)
                except TypeError as exc:
                    result = json.dumps({"error": f"bad arguments: {exc}"})
                tool_log.append({
                    "call": len(tool_log) + 1,
                    "name": call.function.name,
                    "arguments": args,
                    "result": json.loads(result),
                })
                messages.append({
                    "role": "tool", "tool_call_id": call.id, "content": result})
                if len(tool_log) >= max_tool_calls:
                    break
        else:
            messages.append({"role": "user", "content": (
                "Tool budget exhausted. Write the engineering memo now from the evidence "
                "collected, without further tool calls.")})
            memo = ""
            for _attempt in range(3):
                resp = client.chat.completions.create(
                    model=model, messages=messages, temperature=0, max_tokens=MAX_TOKENS)
                if resp.usage is not None:
                    prompt_tokens += resp.usage.prompt_tokens or 0
                    completion_tokens += resp.usage.completion_tokens or 0
                _check_finish(resp, f"cutoff {cutoff} (budget exhausted)")
                memo = resp.choices[0].message.content or ""
                if memo.strip():
                    break
                messages.append({"role": "user", "content": (
                    "Your previous reply was empty. Reply now with the full engineering "
                    "memo text only.")})
            if not memo.strip():
                raise RuntimeError("audit agent returned an empty memo after retries")
    except AuthenticationError as exc:
        raise RuntimeError(
            "Meta API returned 401: MODEL_API_KEY is bad or expired. "
            "Regenerate it and update .env; nothing was written."
        ) from exc
    return {
        "memo": memo,
        "tool_log": tool_log,
        "usage": {"model": model, "prompt_tokens": prompt_tokens,
                  "completion_tokens": completion_tokens},
        "hazard_path": tools.hazard_path,
    }
