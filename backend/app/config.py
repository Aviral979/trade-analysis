"""Central configuration for the MarketPilot AI backend."""
from __future__ import annotations

import os

APP_NAME = "MarketPilot AI"
API_PREFIX = "/api/v1"

# Quote cache TTL in seconds (live-ish polling).
QUOTE_TTL = float(os.getenv("MP_QUOTE_TTL", "15"))
CANDLE_TTL = float(os.getenv("MP_CANDLE_TTL", "60"))

# Default crypto exchange for CCXT.
DEFAULT_CRYPTO_EXCHANGE = os.getenv("MP_CRYPTO_EXCHANGE", "binance")

# Optional LLM hook (assistant layer works rule-based without any key).
LLM_PROVIDER = os.getenv("MP_LLM_PROVIDER", "")          # "openai" | "anthropic" | ""
LLM_API_KEY = os.getenv("MP_LLM_API_KEY", "")
LLM_MODEL = os.getenv("MP_LLM_MODEL", "")

# Kronos model repo (used only when torch+transformers are installed).
KRONOS_MODEL = os.getenv("MP_KRONOS_MODEL", "NeoQuasar/Kronos-small")
KRONOS_MAX_CONTEXT = int(os.getenv("MP_KRONOS_CONTEXT", "512"))

DISCLAIMER = (
    "Forecasts and analytics are probabilistic scenario models for research and "
    "education only. Nothing here is financial advice or a promise of returns."
)
