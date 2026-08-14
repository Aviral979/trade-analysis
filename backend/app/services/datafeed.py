"""Market data adapters.

Provider abstraction order:
    crypto  -> CCXT (binance/bybit/coinbase/okx) -> mock fallback
    stock / index / forex / etf -> yfinance -> mock fallback

Everything returns plain JSON-safe dicts. Candles are:
    {"time": <unix seconds>, "open", "high", "low", "close", "volume"}
"""
from __future__ import annotations

import hashlib
import math
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import numpy as np
import pandas as pd

from app.config import CANDLE_TTL, DEFAULT_CRYPTO_EXCHANGE, QUOTE_TTL

_CCXT_OPTS = {"enableRateLimit": True, "timeout": 6000}
_EXCHANGES: dict[str, Any] = {}


def _get_exchange(ex_id: str):
    """Reusable CCXT instances — markets load once, not per request."""
    if ex_id not in _EXCHANGES:
        import ccxt
        _EXCHANGES[ex_id] = getattr(ccxt, ex_id)(_CCXT_OPTS)
    return _EXCHANGES[ex_id]


def _par(fn, items, workers: int = 8) -> list:
    """Fetch many quotes concurrently — keeps the terminal snappy."""
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(fn, items))

# ---------------------------------------------------------------------------
# Curated catalogs (search + pickers)
# ---------------------------------------------------------------------------

INDICES: dict[str, dict[str, str]] = {
    "SPX":       {"symbol": "^GSPC",    "name": "S&P 500",            "country": "US",     "currency": "USD"},
    "NDX":       {"symbol": "^NDX",     "name": "Nasdaq 100",         "country": "US",     "currency": "USD"},
    "DJI":       {"symbol": "^DJI",     "name": "Dow Jones",          "country": "US",     "currency": "USD"},
    "NIFTY50":   {"symbol": "^NSEI",    "name": "NIFTY 50",           "country": "India",  "currency": "INR"},
    "BANKNIFTY": {"symbol": "^NSEBANK", "name": "NIFTY Bank",         "country": "India",  "currency": "INR"},
    "SENSEX":    {"symbol": "^BSESN",   "name": "BSE Sensex",         "country": "India",  "currency": "INR"},
    "FTSE100":   {"symbol": "^FTSE",    "name": "FTSE 100",           "country": "UK",     "currency": "GBP"},
    "DAX":       {"symbol": "^GDAXI",   "name": "DAX 40",             "country": "Germany","currency": "EUR"},
    "CAC40":     {"symbol": "^FCHI",    "name": "CAC 40",             "country": "France", "currency": "EUR"},
    "NIKKEI225": {"symbol": "^N225",    "name": "Nikkei 225",         "country": "Japan",  "currency": "JPY"},
    "HSI":       {"symbol": "^HSI",     "name": "Hang Seng",          "country": "HK",     "currency": "HKD"},
}

CONSTITUENTS: dict[str, dict[str, list[dict[str, str]]]] = {
    "US": {"index": "SPX", "stocks": [
        {"symbol": "AAPL",  "name": "Apple",              "sector": "Technology"},
        {"symbol": "MSFT",  "name": "Microsoft",          "sector": "Technology"},
        {"symbol": "NVDA",  "name": "NVIDIA",             "sector": "Technology"},
        {"symbol": "AMZN",  "name": "Amazon",             "sector": "Consumer"},
        {"symbol": "GOOGL", "name": "Alphabet",           "sector": "Technology"},
        {"symbol": "META",  "name": "Meta Platforms",     "sector": "Technology"},
        {"symbol": "TSLA",  "name": "Tesla",              "sector": "Auto"},
        {"symbol": "JPM",   "name": "JPMorgan Chase",     "sector": "Financials"},
        {"symbol": "V",     "name": "Visa",               "sector": "Financials"},
        {"symbol": "JNJ",   "name": "Johnson & Johnson",  "sector": "Healthcare"},
        {"symbol": "XOM",   "name": "Exxon Mobil",        "sector": "Energy"},
        {"symbol": "WMT",   "name": "Walmart",            "sector": "Consumer"},
        {"symbol": "LLY",   "name": "Eli Lilly",          "sector": "Healthcare"},
        {"symbol": "AVGO",  "name": "Broadcom",           "sector": "Technology"},
        {"symbol": "NFLX",  "name": "Netflix",            "sector": "Media"},
    ]},
    "India": {"index": "NIFTY50", "stocks": [
        {"symbol": "RELIANCE.NS",   "name": "Reliance Industries", "sector": "Energy"},
        {"symbol": "TCS.NS",        "name": "TCS",                 "sector": "IT"},
        {"symbol": "HDFCBANK.NS",   "name": "HDFC Bank",           "sector": "Financials"},
        {"symbol": "ICICIBANK.NS",  "name": "ICICI Bank",          "sector": "Financials"},
        {"symbol": "INFY.NS",       "name": "Infosys",             "sector": "IT"},
        {"symbol": "HINDUNILVR.NS", "name": "Hindustan Unilever",  "sector": "FMCG"},
        {"symbol": "SBIN.NS",       "name": "State Bank of India", "sector": "Financials"},
        {"symbol": "BHARTIARTL.NS", "name": "Bharti Airtel",       "sector": "Telecom"},
        {"symbol": "ITC.NS",        "name": "ITC",                 "sector": "FMCG"},
        {"symbol": "KOTAKBANK.NS",  "name": "Kotak Mahindra Bank", "sector": "Financials"},
        {"symbol": "LT.NS",         "name": "Larsen & Toubro",     "sector": "Infra"},
        {"symbol": "TATAMOTORS.NS", "name": "Tata Motors",         "sector": "Auto"},
        {"symbol": "MARUTI.NS",     "name": "Maruti Suzuki",       "sector": "Auto"},
        {"symbol": "SUNPHARMA.NS",  "name": "Sun Pharma",          "sector": "Pharma"},
        {"symbol": "TITAN.NS",      "name": "Titan",               "sector": "Consumer"},
    ]},
    "UK": {"index": "FTSE100", "stocks": [
        {"symbol": "SHEL.L", "name": "Shell",             "sector": "Energy"},
        {"symbol": "AZN.L",  "name": "AstraZeneca",       "sector": "Pharma"},
        {"symbol": "HSBA.L", "name": "HSBC",              "sector": "Financials"},
        {"symbol": "ULVR.L", "name": "Unilever",          "sector": "FMCG"},
        {"symbol": "BP.L",   "name": "BP",                "sector": "Energy"},
        {"symbol": "GSK.L",  "name": "GSK",               "sector": "Pharma"},
        {"symbol": "RIO.L",  "name": "Rio Tinto",         "sector": "Mining"},
        {"symbol": "BARC.L", "name": "Barclays",          "sector": "Financials"},
        {"symbol": "VOD.L",  "name": "Vodafone",          "sector": "Telecom"},
        {"symbol": "LSEG.L", "name": "London Stock Exchange", "sector": "Financials"},
    ]},
    "Germany": {"index": "DAX", "stocks": [
        {"symbol": "SAP.DE",  "name": "SAP",            "sector": "Technology"},
        {"symbol": "SIE.DE",  "name": "Siemens",        "sector": "Industrial"},
        {"symbol": "ALV.DE",  "name": "Allianz",        "sector": "Insurance"},
        {"symbol": "MBG.DE",  "name": "Mercedes-Benz",  "sector": "Auto"},
        {"symbol": "VOW3.DE", "name": "Volkswagen",     "sector": "Auto"},
        {"symbol": "BMW.DE",  "name": "BMW",            "sector": "Auto"},
        {"symbol": "BAS.DE",  "name": "BASF",           "sector": "Chemicals"},
        {"symbol": "DTE.DE",  "name": "Deutsche Telekom","sector": "Telecom"},
        {"symbol": "ADS.DE",  "name": "Adidas",         "sector": "Consumer"},
        {"symbol": "AIR.DE",  "name": "Airbus",         "sector": "Aerospace"},
    ]},
    "Japan": {"index": "NIKKEI225", "stocks": [
        {"symbol": "7203.T", "name": "Toyota",           "sector": "Auto"},
        {"symbol": "6758.T", "name": "Sony",             "sector": "Technology"},
        {"symbol": "9984.T", "name": "SoftBank Group",   "sector": "Telecom"},
        {"symbol": "8306.T", "name": "MUFG",             "sector": "Financials"},
        {"symbol": "6861.T", "name": "Keyence",          "sector": "Technology"},
        {"symbol": "6501.T", "name": "Hitachi",          "sector": "Industrial"},
        {"symbol": "7974.T", "name": "Nintendo",         "sector": "Gaming"},
        {"symbol": "4063.T", "name": "Shin-Etsu Chemical","sector": "Chemicals"},
        {"symbol": "9433.T", "name": "KDDI",             "sector": "Telecom"},
        {"symbol": "6902.T", "name": "Denso",            "sector": "Auto"},
    ]},
}

FOREX_PAIRS: list[dict[str, str]] = [
    {"symbol": "EURUSD", "name": "Euro / US Dollar",        "group": "Major"},
    {"symbol": "GBPUSD", "name": "Pound / US Dollar",       "group": "Major"},
    {"symbol": "USDJPY", "name": "US Dollar / Yen",         "group": "Major"},
    {"symbol": "USDCHF", "name": "US Dollar / Swiss Franc", "group": "Major"},
    {"symbol": "AUDUSD", "name": "Aussie / US Dollar",      "group": "Major"},
    {"symbol": "USDCAD", "name": "US Dollar / Canadian $",  "group": "Major"},
    {"symbol": "NZDUSD", "name": "Kiwi / US Dollar",        "group": "Major"},
    {"symbol": "EURGBP", "name": "Euro / Pound",            "group": "Minor"},
    {"symbol": "EURJPY", "name": "Euro / Yen",              "group": "Minor"},
    {"symbol": "GBPJPY", "name": "Pound / Yen",             "group": "Minor"},
    {"symbol": "USDINR", "name": "US Dollar / Indian Rupee","group": "Exotic"},
    {"symbol": "EURINR", "name": "Euro / Indian Rupee",     "group": "Exotic"},
    {"symbol": "USDBRL", "name": "US Dollar / Brazilian Real","group": "Exotic"},
    {"symbol": "USDMXN", "name": "US Dollar / Mexican Peso","group": "Exotic"},
    {"symbol": "USDZAR", "name": "US Dollar / Rand",        "group": "Exotic"},
]

CRYPTO_MAJORS = ["BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "XRP/USDT",
                 "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "LINK/USDT", "DOT/USDT",
                 "LTC/USDT", "TRX/USDT", "ATOM/USDT", "UNI/USDT", "NEAR/USDT"]

CRYPTO_EXCHANGES = ["binance", "bybit", "coinbase", "okx"]

# timeframe -> (ccxt_tf, yf_interval, minutes per bar)
TIMEFRAMES: dict[str, tuple[str, str, int]] = {
    "1m":  ("1m",  "1m",   1),
    "5m":  ("5m",  "5m",   5),
    "15m": ("15m", "15m",  15),
    "30m": ("30m", "30m",  30),
    "1h":  ("1h",  "60m",  60),
    "4h":  ("4h",  "60m",  240),   # yfinance has no 4h -> resample from 60m
    "1d":  ("1d",  "1d",   1440),
    "1wk": ("1w",  "1wk",  10080),
    "1mo": ("1M",  "1mo",  43200),
}

# ---------------------------------------------------------------------------
# Tiny TTL cache
# ---------------------------------------------------------------------------
_cache: dict[str, tuple[float, Any]] = {}


def _cached(key: str, ttl: float, factory):
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1]
    value = factory()
    _cache[key] = (now, value)
    return value


# ---------------------------------------------------------------------------
# Deterministic mock engine (offline / rate-limit safety net)
# ---------------------------------------------------------------------------

def _seed(symbol: str) -> int:
    return int(hashlib.sha256(symbol.encode()).hexdigest()[:8], 16)


def mock_candles(symbol: str, timeframe: str, limit: int = 500) -> list[dict]:
    minutes = TIMEFRAMES.get(timeframe, TIMEFRAMES["1d"])[2]
    rng = np.random.default_rng(_seed(symbol + timeframe))
    base = 50 + (_seed(symbol) % 45000) / 100.0
    drift = rng.normal(0.0002, 0.0004)
    vol = 0.008 * math.sqrt(minutes / 60 + 1)
    rets = rng.normal(drift, vol, limit)
    closes = base * np.exp(np.cumsum(rets))
    now = int(time.time())
    step = minutes * 60
    out = []
    for i, c in enumerate(closes):
        o = closes[i - 1] if i else c * (1 - rets[0])
        hi, lo = max(o, c), min(o, c)
        span = abs(c - o) + c * vol * 0.6
        out.append({
            "time": now - (limit - i) * step,
            "open": round(float(o), 4),
            "high": round(float(hi + rng.random() * span * 0.4), 4),
            "low": round(float(lo - rng.random() * span * 0.4), 4),
            "close": round(float(c), 4),
            "volume": int(100_000 + rng.random() * 900_000),
        })
    return out


# ---------------------------------------------------------------------------
# Symbol resolution
# ---------------------------------------------------------------------------

def resolve_symbol(symbol: str, market: str) -> str:
    s = symbol.strip().upper()
    if market == "index":
        return INDICES.get(s, {}).get("symbol", s if s.startswith("^") else f"^{s}")
    if market == "forex":
        return s if s.endswith("=X") else f"{s}=X"
    if market == "crypto":
        return s.replace("-", "/") if "-" in s else s
    return symbol.strip()


def _df_to_candles(df: pd.DataFrame) -> list[dict]:
    df = df.dropna(subset=["Close"])
    out = []
    for ts, row in df.iterrows():
        out.append({
            "time": int(pd.Timestamp(ts).timestamp()),
            "open": round(float(row["Open"]), 6),
            "high": round(float(row["High"]), 6),
            "low": round(float(row["Low"]), 6),
            "close": round(float(row["Close"]), 6),
            "volume": int(row.get("Volume", 0) or 0),
        })
    return out


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------

def _yf_candles(symbol: str, timeframe: str, limit: int) -> list[dict]:
    import yfinance as yf

    _, interval, minutes = TIMEFRAMES.get(timeframe, TIMEFRAMES["1d"])
    span = limit * minutes
    # yfinance intraday caps
    if interval == "1m":
        period = "7d"
        start = None
    elif minutes < 1440:
        period = "60d" if minutes <= 30 else "729d"
        start = None
    else:
        period = None
        start = pd.Timestamp.utcnow() - pd.Timedelta(minutes=int(span * 1.6) + 1440 * 10)
    t = yf.Ticker(symbol)
    df = t.history(period=period, start=start, interval=interval, auto_adjust=False)
    if df is None or df.empty:
        raise ValueError(f"yfinance returned no data for {symbol}")
    if timeframe == "4h":
        df = df.resample("4h").agg({"Open": "first", "High": "max", "Low": "min",
                                    "Close": "last", "Volume": "sum"}).dropna()
    return _df_to_candles(df)[-limit:]


def _ccxt_candles(symbol: str, timeframe: str, limit: int, exchange_id: str | None) -> list[dict]:
    ex_id = exchange_id or DEFAULT_CRYPTO_EXCHANGE
    exchange = _get_exchange(ex_id)
    tf, _, _ = TIMEFRAMES.get(timeframe, TIMEFRAMES["1d"])
    raw = exchange.fetch_ohlcv(symbol, timeframe=tf, limit=min(limit, 1000))
    if not raw:
        raise ValueError(f"{ex_id} returned no data for {symbol}")
    return [{"time": int(r[0] // 1000), "open": r[1], "high": r[2],
             "low": r[3], "close": r[4], "volume": r[5]} for r in raw]


def get_candles(symbol: str, market: str = "stock", timeframe: str = "1d",
                limit: int = 500, exchange: str | None = None) -> dict:
    """Candle history with provider fallback. Never raises."""
    key = f"c:{market}:{symbol}:{timeframe}:{limit}:{exchange}"

    def build():
        resolved = resolve_symbol(symbol, market)
        try:
            if market == "crypto":
                candles = _ccxt_candles(resolved, timeframe, limit, exchange)
                src = exchange or DEFAULT_CRYPTO_EXCHANGE
            else:
                candles = _yf_candles(resolved, timeframe, limit)
                src = "yfinance"
        except Exception:
            candles = mock_candles(symbol, timeframe, limit)
            src = "mock"
        return {"symbol": symbol, "resolved": resolve_symbol(symbol, market),
                "market": market, "timeframe": timeframe,
                "candles": candles, "source": src}

    return _cached(key, CANDLE_TTL, build)


def get_quote(symbol: str, market: str = "stock", exchange: str | None = None) -> dict:
    key = f"q:{market}:{symbol}:{exchange}"

    def build():
        resolved = resolve_symbol(symbol, market)
        name, currency = symbol, ""
        try:
            if market == "crypto":
                ex = _get_exchange(exchange or DEFAULT_CRYPTO_EXCHANGE)
                t = ex.fetch_ticker(resolved)
                last = t.get("last") or t.get("close")
                pct = t.get("percentage")
                return {"symbol": symbol, "resolved": resolved, "market": market,
                        "name": resolved, "price": last,
                        "change": (t.get("change") or 0), "change_pct": pct,
                        "high": t.get("high"), "low": t.get("low"),
                        "volume": t.get("baseVolume"), "currency": "USDT",
                        "source": exchange or DEFAULT_CRYPTO_EXCHANGE}
            import yfinance as yf
            tk = yf.Ticker(resolved)
            fi = tk.fast_info
            price = float(fi.get("last_price") or fi.get("lastPrice"))
            prev = float(fi.get("previous_close") or fi.get("previousClose") or price)
            currency = getattr(fi, "currency", "") or ""
            chg = price - prev
            return {"symbol": symbol, "resolved": resolved, "market": market,
                    "name": symbol, "price": round(price, 6),
                    "change": round(chg, 6),
                    "change_pct": round(chg / prev * 100, 4) if prev else 0.0,
                    "high": float(fi.get("day_high") or fi.get("dayHigh") or price),
                    "low": float(fi.get("day_low") or fi.get("dayLow") or price),
                    "volume": int(fi.get("last_volume") or fi.get("lastVolume") or 0),
                    "currency": currency, "source": "yfinance"}
        except Exception:
            candles = mock_candles(symbol, "1d", 60)
            last, prev = candles[-1]["close"], candles[-2]["close"]
            return {"symbol": symbol, "resolved": resolved, "market": market,
                    "name": name, "price": last, "change": round(last - prev, 4),
                    "change_pct": round((last - prev) / prev * 100, 4) if prev else 0.0,
                    "high": max(c["high"] for c in candles[-14:]),
                    "low": min(c["low"] for c in candles[-14:]),
                    "volume": candles[-1]["volume"], "currency": currency,
                    "source": "mock"}

    return _cached(key, QUOTE_TTL, build)


# ---------------------------------------------------------------------------
# Aggregations used by modules
# ---------------------------------------------------------------------------

def indices_radar() -> list[dict]:
    def one(item):
        code, meta = item
        q = get_quote(code, "index")
        q.update({"code": code, "name": meta["name"], "country": meta["country"],
                  "currency": meta["currency"]})
        return q

    return _par(one, list(INDICES.items()))


def get_quotes(symbols: list[str], market: str = "stock",
               exchange: str | None = None) -> list[dict]:
    return _par(lambda s: get_quote(s, market, exchange), symbols)


def search_symbols(q: str) -> list[dict]:
    q = q.strip().lower()
    if not q:
        return []
    results: list[dict] = []
    for code, meta in INDICES.items():
        if q in code.lower() or q in meta["name"].lower():
            results.append({"symbol": code, "name": meta["name"], "market": "index",
                            "hint": meta["country"]})
    for country, block in CONSTITUENTS.items():
        for s in block["stocks"]:
            if q in s["symbol"].lower() or q in s["name"].lower():
                results.append({"symbol": s["symbol"], "name": s["name"],
                                "market": "stock", "hint": f"{country} · {s['sector']}"})
    for p in FOREX_PAIRS:
        if q in p["symbol"].lower() or q in p["name"].lower():
            results.append({"symbol": p["symbol"], "name": p["name"],
                            "market": "forex", "hint": p["group"]})
    for c in CRYPTO_MAJORS:
        if q in c.lower():
            results.append({"symbol": c, "name": c, "market": "crypto", "hint": "Spot"})
    return results[:20]


def crypto_tickers(exchange: str | None = None) -> list[dict]:
    def one(pair: str) -> dict:
        q = get_quote(pair, "crypto", exchange)
        return {"symbol": pair, "price": q.get("price"),
                "change_pct": q.get("change_pct"), "volume": q.get("volume"),
                "source": q.get("source")}

    return _par(one, CRYPTO_MAJORS)


def crypto_funding(symbol: str, exchange: str | None = None) -> dict:
    try:
        ex = _get_exchange(exchange or DEFAULT_CRYPTO_EXCHANGE)
        if not ex.has.get("fetchFundingRate"):
            raise ValueError("funding not supported")
        fr = ex.fetch_funding_rate(resolve_symbol(symbol, "crypto"))
        return {"symbol": symbol, "funding_rate": fr.get("fundingRate"),
                "next_ts": fr.get("fundingTimestamp"), "source": ex.id}
    except Exception as e:  # geo-block / spot-only exchange etc.
        return {"symbol": symbol, "funding_rate": None, "note": str(e)[:120]}


def crypto_open_interest(symbol: str, exchange: str | None = None) -> dict:
    try:
        ex = _get_exchange(exchange or DEFAULT_CRYPTO_EXCHANGE)
        if not ex.has.get("fetchOpenInterest"):
            raise ValueError("open interest not supported")
        oi = ex.fetch_open_interest(resolve_symbol(symbol, "crypto"))
        return {"symbol": symbol, "open_interest": oi.get("openInterestAmount")
                or oi.get("openInterestValue"), "source": ex.id}
    except Exception as e:
        return {"symbol": symbol, "open_interest": None, "note": str(e)[:120]}


def btc_dominance() -> dict:
    def build():
        try:
            import requests
            r = requests.get("https://api.coingecko.com/api/v3/global", timeout=8)
            data = r.json()["data"]
            return {"btc": round(data["market_cap_percentage"]["btc"], 2),
                    "eth": round(data["market_cap_percentage"]["eth"], 2),
                    "source": "coingecko"}
        except Exception:
            return {"btc": None, "eth": None, "source": "unavailable"}
    return _cached("dominance", 300, build)


def currency_strength() -> list[dict]:
    """1-day % change of major currencies vs USD (strength meter)."""
    majors = ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCHF", "USDCAD"]

    def one(pair: str) -> dict:
        q = get_quote(pair, "forex")
        pct = q.get("change_pct") or 0.0
        return {"pair": pair, "change_pct": pct,
                "strength_base": pct, "strength_quote": -pct,
                "base": pair[:3], "quote": pair[3:]}

    return _par(one, majors)
