"""Deterministic technical analytics — pure pandas/numpy core.

If TA-Lib is installed it can be wired in for parity, but every indicator
here is computed explicitly so results are reproducible and explainable.
All math lives here — never in an LLM.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

try:  # optional parity check
    import talib  # noqa: F401
    HAS_TALIB = True
except Exception:
    HAS_TALIB = False


def candles_to_df(candles: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(candles)
    df["dt"] = pd.to_datetime(df["time"], unit="s")
    return df.set_index("dt")


# ---------------------------------------------------------------------------
# Core indicators
# ---------------------------------------------------------------------------

def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n).mean()


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - 100 / (1 + rs)


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    m = ema(close, fast) - ema(close, slow)
    sig = m.ewm(span=signal, adjust=False).mean()
    return m, sig, m - sig


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - df["close"].shift()).abs(),
        (df["low"] - df["close"].shift()).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def vwap(df: pd.DataFrame) -> pd.Series:
    tp = (df["high"] + df["low"] + df["close"]) / 3
    vol = df["volume"].replace(0, np.nan)
    return (tp * vol).cumsum() / vol.cumsum()


def bollinger(close: pd.Series, n: int = 20, k: float = 2.0):
    mid = sma(close, n)
    sd = close.rolling(n).std()
    return mid + k * sd, mid, mid - k * sd


# ---------------------------------------------------------------------------
# Levels: pivots, swing S/R, fibonacci
# ---------------------------------------------------------------------------

def pivot_levels(df: pd.DataFrame) -> dict[str, float]:
    last = df.iloc[-2] if len(df) > 1 else df.iloc[-1]
    p = (last["high"] + last["low"] + last["close"]) / 3
    return {
        "P": round(p, 4),
        "R1": round(2 * p - last["low"], 4),
        "S1": round(2 * p - last["high"], 4),
        "R2": round(p + (last["high"] - last["low"]), 4),
        "S2": round(p - (last["high"] - last["low"]), 4),
    }


def swing_levels(df: pd.DataFrame, window: int = 10, top: int = 3) -> dict:
    """Cluster recent swing highs/lows into the nearest meaningful S/R zones."""
    highs, lows = df["high"], df["low"]
    price = float(df["close"].iloc[-1])
    res, sup = [], []
    for i in range(window, len(df) - window):
        h_win = highs.iloc[i - window:i + window + 1]
        l_win = lows.iloc[i - window:i + window + 1]
        if highs.iloc[i] == h_win.max():
            res.append(float(highs.iloc[i]))
        if lows.iloc[i] == l_win.min():
            sup.append(float(lows.iloc[i]))

    def cluster(levels: list[float], above: bool) -> list[float]:
        levels = sorted(levels, key=lambda x: abs(x - price))
        picked: list[float] = []
        for lv in levels:
            if (above and lv <= price) or (not above and lv >= price):
                continue
            if all(abs(lv - p) / price > 0.005 for p in picked):
                picked.append(lv)
            if len(picked) == top:
                break
        return [round(x, 4) for x in sorted(picked)]

    return {"resistance": cluster(res, True), "support": cluster(sup, False)}


def fibonacci(df: pd.DataFrame, lookback: int = 252) -> dict:
    seg = df.tail(lookback)
    hi, lo = float(seg["high"].max()), float(seg["low"].min())
    diff = hi - lo
    return {"high": round(hi, 4), "low": round(lo, 4),
            "levels": {str(k): round(hi - diff * k, 4)
                       for k in (0.236, 0.382, 0.5, 0.618, 0.786)}}


# ---------------------------------------------------------------------------
# Candlestick patterns (lightweight deterministic subset)
# ---------------------------------------------------------------------------

def detect_patterns(df: pd.DataFrame, count: int = 60) -> list[dict]:
    out = []
    seg = df.tail(count)
    rows = list(seg.itertuples())
    for i in range(1, len(rows)):
        cur, prev = rows[i], rows[i - 1]
        body = cur.close - cur.open
        rng = cur.high - cur.low or 1e-9
        ts = int(pd.Timestamp(cur.Index).timestamp())
        if abs(body) / rng < 0.1:
            out.append({"time": ts, "pattern": "Doji", "bias": "neutral"})
        if body > 0 and (cur.low - min(cur.open, cur.close)) > 2 * abs(body) \
                and (cur.high - cur.close) < abs(body):
            out.append({"time": ts, "pattern": "Hammer", "bias": "bullish"})
        if body < 0 and (cur.high - max(cur.open, cur.close)) > 2 * abs(body) \
                and (cur.close - cur.low) < abs(body):
            out.append({"time": ts, "pattern": "Shooting Star", "bias": "bearish"})
        if prev.close < prev.open and cur.close > cur.open \
                and cur.close >= prev.open and cur.open <= prev.close:
            out.append({"time": ts, "pattern": "Bullish Engulfing", "bias": "bullish"})
        if prev.close > prev.open and cur.close < cur.open \
                and cur.open >= prev.close and cur.close <= prev.open:
            out.append({"time": ts, "pattern": "Bearish Engulfing", "bias": "bearish"})
    return out[-12:]


# ---------------------------------------------------------------------------
# Composite signal summary (powers the chart's AI overlay + suggestions)
# ---------------------------------------------------------------------------

def analyze(candles: list[dict]) -> dict[str, Any]:
    df = candles_to_df(candles)
    close = df["close"]
    price = float(close.iloc[-1])

    rsi_v = float(rsi(close).iloc[-1])
    m, sig, hist = macd(close)
    sma20, sma50, sma200 = sma(close, 20), sma(close, 50), sma(close, 200)
    ema20, ema50 = ema(close, 20), ema(close, 50)
    atr_v = float(atr(df).iloc[-1])
    up, mid, low = bollinger(close)
    vw = vwap(df)

    reasons: list[str] = []
    score = 0

    if not np.isnan(sma50.iloc[-1]):
        if price > sma50.iloc[-1]:
            score += 1; reasons.append(f"Price is above the 50-period average ({sma50.iloc[-1]:.2f}) — medium-term trend is up.")
        else:
            score -= 1; reasons.append(f"Price is below the 50-period average ({sma50.iloc[-1]:.2f}) — medium-term trend is down.")
    if not np.isnan(sma200.iloc[-1]):
        if price > sma200.iloc[-1]:
            score += 1; reasons.append("Long-term trend (200 SMA) supports buyers.")
        else:
            score -= 1; reasons.append("Long-term trend (200 SMA) is against buyers.")
    if rsi_v > 70:
        score -= 1; reasons.append(f"RSI {rsi_v:.0f} — overbought zone, pullback risk elevated.")
    elif rsi_v < 30:
        score += 1; reasons.append(f"RSI {rsi_v:.0f} — oversold zone, bounce potential.")
    else:
        reasons.append(f"RSI {rsi_v:.0f} — neutral momentum.")
    if hist.iloc[-1] > 0 and hist.iloc[-2] <= 0:
        score += 1; reasons.append("MACD just crossed above its signal line — fresh bullish momentum.")
    elif hist.iloc[-1] < 0 and hist.iloc[-2] >= 0:
        score -= 1; reasons.append("MACD just crossed below its signal line — fresh bearish momentum.")

    atr_pct = atr_v / price * 100
    vol_regime = "High" if atr_pct > 3 else ("Moderate" if atr_pct > 1 else "Low")
    bias = "Bullish" if score >= 2 else ("Bearish" if score <= -2 else "Neutral")

    tail = 300

    def series_points(s: pd.Series) -> list[dict]:
        s = s.tail(tail).dropna()
        return [{"time": int(pd.Timestamp(idx).timestamp()), "value": round(float(v), 6)}
                for idx, v in s.items()]

    levels = swing_levels(df)
    return {
        "price": round(price, 6),
        "bias": bias,
        "score": score,
        "reasons": reasons,
        "volatility": {"atr": round(atr_v, 6), "atr_pct": round(atr_pct, 3), "regime": vol_regime},
        "momentum": {"rsi": round(rsi_v, 2),
                     "macd": round(float(m.iloc[-1]), 6),
                     "macd_signal": round(float(sig.iloc[-1]), 6),
                     "macd_hist": round(float(hist.iloc[-1]), 6)},
        "moving_averages": {"sma20": series_points(sma20), "sma50": series_points(sma50),
                            "sma200": series_points(sma200), "ema20": series_points(ema20),
                            "ema50": series_points(ema50), "vwap": series_points(vw),
                            "bb_upper": series_points(up), "bb_lower": series_points(low)},
        "levels": {**levels, "pivots": pivot_levels(df)},
        "fibonacci": fibonacci(df),
        "patterns": detect_patterns(df),
        "engine": {"talib": HAS_TALIB, "core": "pandas"},
    }
