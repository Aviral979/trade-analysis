from __future__ import annotations

from fastapi import APIRouter

from app.config import DISCLAIMER
from app.services.datafeed import get_candles
from app.services.indicators import analyze

router = APIRouter()


@router.get("/analyze")
def analyze_symbol(symbol: str, market: str = "stock", timeframe: str = "1d",
                   limit: int = 600, exchange: str | None = None):
    data = get_candles(symbol, market, timeframe, min(limit, 1500), exchange)
    result = analyze(data["candles"])
    result.update({"symbol": symbol, "market": market, "timeframe": timeframe,
                   "data_source": data["source"], "disclaimer": DISCLAIMER})
    return result
