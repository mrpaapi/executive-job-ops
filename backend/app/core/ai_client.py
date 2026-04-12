"""
AI Client — supports OpenAI, Ollama/LM Studio, OpenRouter, and Gemini.

All four providers expose an OpenAI-compatible chat completions endpoint,
so we reuse the AsyncOpenAI SDK for every one of them.

Provider selection priority (first match wins):
  1. OpenRouter  — OPENROUTER_API_KEY is set
  2. Gemini      — GEMINI_API_KEY is set
  3. Local LLM   — LOCAL_LLM_URL is set  (Ollama / LM Studio)
  4. OpenAI      — default

Performance notes:
  * AsyncOpenAI clients are cached by config signature so we don't
    re-instantiate (SSL handshake, connection pool setup) on every call.
  * `chat()` memoises responses keyed by (provider, model, messages, json_mode)
    so repeated reads (e.g. re-opening a job card) don't re-hit the LLM.
"""
from __future__ import annotations

import hashlib
import json
from collections import OrderedDict
from typing import Any

from openai import AsyncOpenAI
from app.core.config import settings


# ── Provider label ───────────────────────────────────────────────────────────

def get_ai_provider_label() -> str:
    if settings.openrouter_api_key:
        return f"OpenRouter ({settings.openrouter_model})"
    if settings.gemini_api_key:
        return f"Gemini ({settings.gemini_model})"
    if settings.use_local_llm:
        return f"Local LLM ({settings.local_llm_model})"
    return f"OpenAI ({settings.openai_model})"


# ── Client cache ─────────────────────────────────────────────────────────────
#
# Keyed by a tuple that captures everything that changes how the client talks
# to its backend. When the user swaps providers in Settings, the new tuple is
# different from the old one so we naturally build a fresh client.

_client_cache: dict[tuple, AsyncOpenAI] = {}


def _client_key() -> tuple:
    if settings.openrouter_api_key:
        return ("openrouter", settings.openrouter_api_key)
    if settings.gemini_api_key:
        return ("gemini", settings.gemini_api_key)
    if settings.use_local_llm:
        return ("local", settings.local_llm_url)
    return ("openai", settings.openai_api_key or "")


def get_ai_client() -> tuple[AsyncOpenAI, str]:
    """Returns (client, model_name). Client is cached across calls."""
    key = _client_key()
    client = _client_cache.get(key)

    if client is None:
        if settings.openrouter_api_key:
            client = AsyncOpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=settings.openrouter_api_key,
                default_headers={
                    "HTTP-Referer": "https://github.com/srinathsankara/executive-job-ops",
                    "X-Title":      "executive-job-ops",
                },
            )
        elif settings.gemini_api_key:
            client = AsyncOpenAI(
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                api_key=settings.gemini_api_key,
            )
        elif settings.use_local_llm:
            client = AsyncOpenAI(
                base_url=settings.local_llm_url,
                api_key="local",
            )
        else:
            client = AsyncOpenAI(api_key=settings.openai_api_key)
        _client_cache[key] = client

    if settings.openrouter_api_key:
        return client, settings.openrouter_model
    if settings.gemini_api_key:
        return client, settings.gemini_model
    if settings.use_local_llm:
        return client, settings.local_llm_model
    return client, settings.openai_model


# ── Response cache ───────────────────────────────────────────────────────────
#
# Small bounded LRU. Saves a full LLM round-trip when the same prompt is asked
# twice (e.g. re-opening a job card that already has a cover letter, or the
# dashboard refreshing the same profile summary). We intentionally key on the
# full message payload so any wording change busts the cache.

_RESPONSE_CACHE_MAX = 256
_response_cache: OrderedDict[str, str] = OrderedDict()


def _cache_key(provider: str, model: str, messages: list[dict], json_mode: bool) -> str:
    payload = json.dumps(
        {"p": provider, "m": model, "msgs": messages, "j": json_mode},
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> str | None:
    val = _response_cache.get(key)
    if val is not None:
        _response_cache.move_to_end(key)
    return val


def _cache_put(key: str, value: str) -> None:
    _response_cache[key] = value
    _response_cache.move_to_end(key)
    while len(_response_cache) > _RESPONSE_CACHE_MAX:
        _response_cache.popitem(last=False)


def clear_llm_cache() -> None:
    """Drop the entire LLM response cache. Used by Settings when the user
    changes provider/model so stale responses don't bleed across configs."""
    _response_cache.clear()
    _client_cache.clear()


# ── Chat entry point ─────────────────────────────────────────────────────────

async def chat(messages: list[dict], json_mode: bool = False, *, use_cache: bool = True) -> str:
    client, model = get_ai_client()

    provider_key = _client_key()[0]
    cache_key = _cache_key(provider_key, model, messages, json_mode) if use_cache else ""
    if use_cache:
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

    kwargs: dict[str, Any] = dict(model=model, messages=messages, temperature=0.3)

    # json_mode is not supported by all providers/models — only enable for OpenAI
    if json_mode and not settings.openrouter_api_key and not settings.gemini_api_key:
        kwargs["response_format"] = {"type": "json_object"}

    # Cap inference time so a hung local model can't park the upload pipeline
    # forever. 15 minutes accommodates slow CPU inference of an 8B local model
    # on a long résumé prompt; cloud providers respond in seconds.
    resp = await client.with_options(timeout=900.0).chat.completions.create(**kwargs)
    content = resp.choices[0].message.content or ""

    if use_cache:
        _cache_put(cache_key, content)

    return content
