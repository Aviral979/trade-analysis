from __future__ import annotations

from fastapi import APIRouter, Query

from app.services import datafeed

router = APIRouter()


@router.get("/search")
def search(q: str = Query(..., min_length=1)):
    return {"results": datafeed.search_symbols(q)}


@router.get("/quote")
def quote(symbol: str, market: str = "stock", exchange: str | None = None):
    return datafeed.get_quote(symbol, market, exchange)


@router.get("/quotes")
def quotes(symbols: str, market: str = "stock", exchange: str | None = None):
    """Comma-separated batch quotes, e.g. symbols=AAPL,MSFT,NVDA"""
    syms = [s.strip() for s in symbols.split(",") if s.strip()]
    return {"quotes": datafeed.get_quotes(syms, market, exchange)}


@router.get("/candles")
def candles(symbol: str, market: str = "stock", timeframe: str = "1d",
            limit: int = 500, exchange: str | None = None):
    return datafeed.get_candles(symbol, market, timeframe, min(limit, 1500), exchange)


@router.get("/indices")
def indices():
    return {"indices": datafeed.indices_radar()}


@router.get("/constituents")
def constituents(country: str = "US"):
    block = datafeed.CONSTITUENTS.get(country)
    if not block:
        return {"country": country, "index": None, "stocks": []}
    return {"country": country, "index": block["index"], "stocks": block["stocks"]}


@router.get("/crypto/tickers")
def crypto_tickers(exchange: str | None = None):
    return {"tickers": datafeed.crypto_tickers(exchange),
            "exchanges": datafeed.CRYPTO_EXCHANGES}


@router.get("/crypto/funding")
def crypto_funding(symbol: str = "BTC/USDT", exchange: str | None = None):
    return datafeed.crypto_funding(symbol, exchange)


@router.get("/crypto/open-interest")
def crypto_open_interest(symbol: str = "BTC/USDT", exchange: str | None = None):
    return datafeed.crypto_open_interest(symbol, exchange)


@router.get("/crypto/dominance")
def crypto_dominance():
    return datafeed.btc_dominance()


@router.get("/forex/pairs")
def forex_pairs():
    return {"pairs": datafeed.FOREX_PAIRS}


@router.get("/forex/strength")
def forex_strength():
    return {"strength": datafeed.currency_strength()}
