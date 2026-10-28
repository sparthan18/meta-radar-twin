"""Muse Spark adapter (SPEC §6.2): OpenAI-compatible Chat Completions.

Standard tool calling, no framework. ``MODEL_API_KEY`` comes from ``.env``;
the model comes from ``RADARTWIN_LLM`` (default ``"muse-spark-1.3"``).
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

BASE_URL = "https://api.meta.ai/v1"
DEFAULT_MODEL = "muse-spark-1.3"
ENV_KEY = "MODEL_API_KEY"
ENV_MODEL = "RADARTWIN_LLM"


def model_name() -> str:
    load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
    return os.environ.get(ENV_MODEL, DEFAULT_MODEL)


def get_client() -> OpenAI:
    """OpenAI client pointed at the Meta Model API; raises if key is missing."""
    load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
    key = os.environ.get(ENV_KEY)
    if not key:
        raise RuntimeError(
            f"{ENV_KEY} is missing: add it to .env (see .env.example). "
            "Audit runs stop here; nothing was spent."
        )
    return OpenAI(base_url=BASE_URL, api_key=key)
