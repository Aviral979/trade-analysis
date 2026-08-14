"""MarketPilot AI — FastAPI entrypoint.

Run:
    python -m uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import API_PREFIX, APP_NAME, DISCLAIMER
from app.api.v1 import assistant, backtest, forecast, indicators, market, portfolio

app = FastAPI(title=APP_NAME, version="1.0.0")
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market.router, prefix=f"{API_PREFIX}/market", tags=["market"])
app.include_router(indicators.router, prefix=f"{API_PREFIX}/indicators", tags=["indicators"])
app.include_router(forecast.router, prefix=f"{API_PREFIX}/forecast", tags=["forecast"])
app.include_router(backtest.router, prefix=f"{API_PREFIX}/backtest", tags=["backtest"])
app.include_router(portfolio.router, prefix=f"{API_PREFIX}/portfolio", tags=["portfolio"])
app.include_router(assistant.router, prefix=f"{API_PREFIX}/assistant", tags=["assistant"])


@app.get(f"{API_PREFIX}/health")
def health() -> dict:
    return {"status": "ok", "app": APP_NAME, "disclaimer": DISCLAIMER}
