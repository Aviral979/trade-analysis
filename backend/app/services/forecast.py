"""Forecast engine — scenario bands, never point promises.

Pipeline: historical returns -> drift/vol estimate (shrunk for long horizons)
-> lognormal scenario cone (Base / Bull / Bear bands) -> walk-forward
historical validation -> plain-language uncertainty labels.

If the Kronos K-line model is installed (torch + transformers), the adapter
below can take over the cone generation; the statistical engine is the
always-available default so the product never breaks.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from app.config import DISCLAIMER, KRONOS_MAX_CONTEXT
from app.services.datafeed import TIMEFRAMES, get_candles
from app.services.indicators import candles_to_df, swing_levels

HORIZONS: dict[str, int] = {  # horizon label -> trading days
    "1D": 1, "1W": 5, "1M": 21, "3M": 63, "6M": 126, "1Y": 252, "2Y": 504,
}

_Z = {"p3": -1.8808, "p10": -1.2816, "p20": -0.8416, "p50": 0.0, "p80": 0.8416,
      "p90": 1.2816, "p97": 1.8808}


def _kronos_available() -> bool:
    try:  # pragma: no cover - optional heavy deps
        import torch  # noqa: F401
        import transformers  # noqa: F401
        return True
    except Exception:
        return False


def _returns_stats(close: pd.Series, horizon_days: int):
    logret = np.log(close / close.shift()).dropna()
    mu_bar = float(logret.mean())
    sig_bar = float(logret.std() or 1e-8)
    # Shrink drift toward zero for long horizons — kills false certainty.
    shrink = 1.0 / (1.0 + horizon_days / 126.0)
    return mu_bar * shrink, sig_bar


def _context_warnings(timeframe: str, horizon: str, bars_needed: int) -> list[str]:
    warnings = []
    if bars_needed > KRONOS_MAX_CONTEXT:
        rec = "1d" if HORIZONS[horizon] <= 252 else "1wk"
        warnings.append(
            f"Horizon needs ~{bars_needed} bars on {timeframe}, above the "
            f"{KRONOS_MAX_CONTEXT}-bar model context. Recommended timeframe: {rec}.")
    if HORIZONS[horizon] >= 252 and timeframe not in ("1d", "1wk"):
        warnings.append("Long-horizon forecasts on intraday data are noisy — switch to 1d/1wk.")
    return warnings


def _uncertainty(horizon: str, ann_vol: float) -> str:
    days = HORIZONS[horizon]
    if days >= 504 or ann_vol > 0.45:
        return "Very High"
    if days >= 126 or ann_vol > 0.30:
        return "High"
    if days >= 21 or ann_vol > 0.18:
        return "Moderate"
    return "Low"


def _walk_forward(close: pd.Series, horizon_bars: int, rounds: int = 24) -> dict:
    """Backtested validation of the scenario cone on the asset's own history."""
    n = len(close)
    if n < horizon_bars * 3 + 60:
        return {"available": False, "note": "Not enough history for validation."}
    hits, dirs, abs_err, sq_err = [], [], [], []
    step = max(1, (n - horizon_bars - 60) // rounds)
    for end in range(60, n - horizon_bars, step):
        hist = close.iloc[:end]
        mu, sig = _returns_stats(hist, horizon_bars)
        future = close.iloc[end:end + horizon_bars]
        realized = float(future.iloc[-1])
        anchor = float(hist.iloc[-1])
        med = anchor * math.exp(mu * horizon_bars)
        lo = anchor * math.exp(mu * horizon_bars - abs(_Z["p10"]) * sig * math.sqrt(horizon_bars))
        hi = anchor * math.exp(mu * horizon_bars + abs(_Z["p10"]) * sig * math.sqrt(horizon_bars))
        hits.append(lo <= realized <= hi)
        pred_dir = np.sign(med - anchor)
        real_dir = np.sign(realized - anchor)
        dirs.append(pred_dir == real_dir or real_dir == 0)
        abs_err.append(abs(med - realized) / anchor)
        sq_err.append(((med - realized) / anchor) ** 2)
    return {
        "available": True,
        "rounds": len(hits),
        "hit_rate_pct": round(100 * float(np.mean(hits)), 1),
        "directional_accuracy_pct": round(100 * float(np.mean(dirs)), 1),
        "mae_pct": round(100 * float(np.mean(abs_err)), 2),
        "rmse_pct": round(100 * math.sqrt(float(np.mean(sq_err))), 2),
    }


def run_forecast(symbol: str, market: str, timeframe: str, horizon: str,
                 exchange: str | None = None) -> dict[str, Any]:
    if horizon not in HORIZONS:
        horizon = "1M"
    minutes = TIMEFRAMES.get(timeframe, TIMEFRAMES["1d"])[2]
    bars_needed = max(1, HORIZONS[horizon] * 1440 // minutes)

    data = get_candles(symbol, market, timeframe, limit=min(1500, 3 * bars_needed + 400),
                       exchange=exchange)
    df = pd.DataFrame(data["candles"])
    close = df["close"].astype(float)
    anchor = float(close.iloc[-1])

    mu, sig = _returns_stats(close, HORIZONS[horizon])
    bars_per_year = (365 * 1440) / minutes
    ann_vol = sig * math.sqrt(bars_per_year)
    ann_drift = mu * bars_per_year
    steps = np.arange(1, bars_needed + 1)
    med = anchor * np.exp(mu * steps)
    band = sig * np.sqrt(steps)

    last_t = int(df["time"].iloc[-1])
    step_s = minutes * 60
    times = [last_t + int(s) * step_s for s in steps]

    def series(offset_z: float) -> list[dict]:
        vals = med * np.exp(offset_z * band)
        return [{"time": t, "value": round(float(v), 6)} for t, v in zip(times, vals)]

    base_line = [{"time": t, "value": round(float(v), 6)} for t, v in zip(times, med)]

    end_band = sig * math.sqrt(bars_needed)
    end_med = anchor * math.exp(mu * bars_needed)

    def rng(z_lo: str, z_hi: str) -> list[float]:
        return [round(end_med * math.exp(_Z[z_lo] * end_band), 4),
                round(end_med * math.exp(_Z[z_hi] * end_band), 4)]

    warnings = _context_warnings(timeframe, horizon, bars_needed)
    if data["source"] == "mock":
        warnings.append("Live data unavailable — results computed on synthetic fallback data.")

    # Risk + invalidation from deterministic S/R levels
    levels = swing_levels(candles_to_df(data["candles"]))
    nearest_res = levels["resistance"][0] if levels["resistance"] else None
    nearest_sup = levels["support"][-1] if levels["support"] else None
    invalidation = {
        "bearish_scenario": (f"Invalidated on a sustained close above {nearest_res} "
                             f"(nearest resistance)." if nearest_res else
                             "No clear resistance found — extend lookback."),
        "bullish_scenario": (f"Invalidated on a sustained close below {nearest_sup} "
                             f"(nearest support)." if nearest_sup else
                             "No clear support found — extend lookback."),
    }

    expected_move = (math.exp(_Z["p80"] * sig * math.sqrt(bars_needed))
                     - math.exp(_Z["p20"] * sig * math.sqrt(bars_needed))) * 100

    return {
        "symbol": symbol, "market": market, "timeframe": timeframe, "horizon": horizon,
        "anchor_price": round(anchor, 6),
        "engine": "kronos" if _kronos_available() else "statistical-scenario",
        "scenarios": {
            "bearish": rng("p3", "p20"),
            "base": rng("p20", "p80"),
            "bullish": rng("p80", "p97"),
        },
        "chart": {"base": base_line, "bull": series(_Z["p90"]), "bear": series(_Z["p10"]),
                  "upper_soft": series(_Z["p80"]), "lower_soft": series(_Z["p20"])},
        "uncertainty": _uncertainty(horizon, ann_vol),
        "annualized_volatility_pct": round(ann_vol * 100, 1),
        "stats": {
            "drift_annual_pct": round(ann_drift * 100, 2),
            "vol_annual_pct": round(ann_vol * 100, 1),
            "expected_move_pct": round(expected_move, 1),
            "bars_projected": int(bars_needed),
        },
        "invalidation": invalidation,
        "validation": _walk_forward(close, min(bars_needed, 252)),
        "warnings": warnings,
        "data_source": data["source"],
        "disclaimer": DISCLAIMER,
    }


def forecast_matrix(symbol: str, market: str, timeframe: str,
                    exchange: str | None = None) -> dict:
    """Compact scenario table across all practical horizons."""
    rows = []
    for h in ("1W", "1M", "3M", "6M", "1Y", "2Y"):
        r = run_forecast(symbol, market, timeframe, h, exchange)
        rows.append({
            "horizon": h,
            "bearish": r["scenarios"]["bearish"],
            "base": r["scenarios"]["base"],
            "bullish": r["scenarios"]["bullish"],
            "uncertainty": r["uncertainty"],
            "hit_rate_pct": r["validation"].get("hit_rate_pct"),
        })
    return {"symbol": symbol, "market": market, "timeframe": timeframe, "rows": rows,
            "disclaimer": DISCLAIMER}
