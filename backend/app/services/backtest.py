"""Strategy backtesting — deterministic internal engine.

VectorBT can be enabled (see requirements-optional.txt) for large parameter
sweeps; the built-in engine covers V1 strategies with identical signal logic
and full trade logs, so results never depend on optional packages.
"""
from __future__ import annotations

import math
from typing import Any, Callable

import numpy as np
import pandas as pd

from app.config import DISCLAIMER
from app.services.datafeed import TIMEFRAMES, get_candles
from app.services.indicators import atr, candles_to_df, rsi, sma, vwap

try:  # optional accelerator
    import vectorbt as vbt  # noqa: F401
    HAS_VECTORBT = True
except Exception:
    HAS_VECTORBT = False


# ---------------------------------------------------------------------------
# Signal generators (entries/exits as boolean series, evaluated bar-close)
# ---------------------------------------------------------------------------

def _ma_cross(df: pd.DataFrame, fast: int = 20, slow: int = 50):
    f, s = sma(df["close"], fast), sma(df["close"], slow)
    entries = (f > s) & (f.shift() <= s.shift())
    exits = (f < s) & (f.shift() >= s.shift())
    return entries.fillna(False), exits.fillna(False)


def _rsi_mean_reversion(df: pd.DataFrame, period: int = 14,
                        oversold: float = 30, overbought: float = 70):
    r = rsi(df["close"], period)
    entries = (r > oversold) & (r.shift() <= oversold)
    exits = (r > 50) & (r.shift() <= 50) | (r >= overbought)
    return entries.fillna(False), exits.fillna(False)


def _vwap_breakout(df: pd.DataFrame, **_):
    vw = vwap(df)
    entries = (df["close"] > vw) & (df["close"].shift() <= vw.shift())
    exits = (df["close"] < vw) & (df["close"].shift() >= vw.shift())
    return entries.fillna(False), exits.fillna(False)


STRATEGIES: dict[str, tuple[str, Callable]] = {
    "ma_cross": ("MA Crossover (trend following)", _ma_cross),
    "rsi_mean_reversion": ("RSI Mean Reversion (buy dips)", _rsi_mean_reversion),
    "vwap_breakout": ("VWAP Breakout (intraday momentum)", _vwap_breakout),
}


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

def _metrics(equity: pd.Series, trade_returns: list[float], minutes: int,
             bars_in_market: int = 0, total_bars: int = 1,
             durations: list[int] | None = None) -> dict:
    rets = equity.pct_change().dropna()
    bars_per_year = (365 * 1440) / minutes
    total_return = float(equity.iloc[-1] / equity.iloc[0] - 1)
    years = max(len(equity) / bars_per_year, 1e-9)
    cagr = (1 + total_return) ** (1 / years) - 1 if total_return > -1 else -1.0
    sharpe = float(rets.mean() / (rets.std() or 1e-12) * math.sqrt(bars_per_year))
    downside = rets[rets < 0]
    sortino = float(rets.mean() / (downside.std() or 1e-12) * math.sqrt(bars_per_year))
    dd = (equity / equity.cummax() - 1).min()
    wins = [r for r in trade_returns if r > 0]
    losses = [r for r in trade_returns if r <= 0]
    gross_win = sum(wins)
    gross_loss = abs(sum(losses)) or 1e-12
    return {
        "total_return_pct": round(total_return * 100, 2),
        "cagr_pct": round(cagr * 100, 2),
        "sharpe": round(sharpe, 2),
        "sortino": round(sortino, 2),
        "max_drawdown_pct": round(float(dd) * 100, 2),
        "trades": len(trade_returns),
        "win_rate_pct": round(100 * len(wins) / max(1, len(trade_returns)), 1),
        "profit_factor": round(gross_win / gross_loss, 2),
        "exposure_pct": round(100 * bars_in_market / max(1, total_bars), 1),
        "avg_bars_held": round(float(np.mean(durations)), 1) if durations else 0,
        "avg_trade_return_pct": round(100 * float(np.mean(trade_returns)), 2) if trade_returns else 0,
        "best_trade_pct": round(100 * max(trade_returns), 2) if trade_returns else 0,
        "worst_trade_pct": round(100 * min(trade_returns), 2) if trade_returns else 0,
    }


def run_backtest(symbol: str, market: str, timeframe: str, strategy: str,
                 params: dict | None = None, initial_capital: float = 100_000,
                 commission_bps: float = 5, exchange: str | None = None) -> dict[str, Any]:
    if strategy not in STRATEGIES:
        strategy = "ma_cross"
    params = params or {}
    minutes = TIMEFRAMES.get(timeframe, TIMEFRAMES["1d"])[2]

    data = get_candles(symbol, market, timeframe, limit=1500, exchange=exchange)
    df = candles_to_df(data["candles"])
    entries, exits = STRATEGIES[strategy][1](df, **params)

    capital = initial_capital
    qty = 0.0
    entry_price = 0.0
    entry_time = 0
    entry_i = 0
    equity_curve: list[dict] = []
    trades: list[dict] = []
    trade_returns: list[float] = []
    fee = commission_bps / 10_000
    open_flag = False
    bars_in_market = 0
    durations: list[int] = []

    opens = df["open"].values
    times = df["time"].values
    ent = entries.values
    ext = exits.values

    for i in range(1, len(df)):
        price_open = float(opens[i])
        if not open_flag and ent[i - 1]:
            qty = capital * (1 - fee) / price_open
            entry_price, entry_time, entry_i, open_flag = price_open, int(times[i]), i, True
        elif open_flag and ext[i - 1]:
            proceeds = qty * price_open * (1 - fee)
            pnl = proceeds - capital
            ret = price_open / entry_price - 1
            trade_returns.append(ret)
            durations.append(i - entry_i)
            trades.append({
                "entry_time": entry_time, "exit_time": int(times[i]),
                "entry": round(entry_price, 6), "exit": round(price_open, 6),
                "pnl": round(pnl, 2), "return_pct": round(ret * 100, 2),
                "bars_held": i - entry_i,
            })
            capital = proceeds
            qty, open_flag = 0.0, False
        if open_flag:
            bars_in_market += 1
        mark = capital if not open_flag else qty * float(df["close"].iloc[i])
        equity_curve.append({"time": int(times[i]), "value": round(mark, 2)})

    stats = _metrics(pd.Series([p["value"] for p in equity_curve]), trade_returns, minutes,
                     bars_in_market, len(df), durations)
    buy_hold = float(df["close"].iloc[-1] / df["close"].iloc[0] - 1)

    return {
        "symbol": symbol, "market": market, "timeframe": timeframe,
        "strategy": strategy, "strategy_name": STRATEGIES[strategy][0],
        "params": params, "initial_capital": initial_capital,
        "commission_bps": commission_bps,
        "stats": stats,
        "buy_hold_return_pct": round(buy_hold * 100, 2),
        "equity_curve": equity_curve,
        "trades": trades[-50:],
        "engine": "vectorbt" if HAS_VECTORBT else "internal",
        "data_source": data["source"],
        "disclaimer": DISCLAIMER,
    }


def compare_strategies(symbol: str, market: str, timeframe: str,
                       initial_capital: float = 100_000,
                       exchange: str | None = None) -> dict:
    """Run every V1 strategy on the same data and rank them."""
    rows = []
    for sid, (name, _) in STRATEGIES.items():
        r = run_backtest(symbol, market, timeframe, sid, {}, initial_capital,
                         exchange=exchange)
        rows.append({"id": sid, "name": name, "stats": r["stats"],
                     "buy_hold_return_pct": r["buy_hold_return_pct"]})
    rows.sort(key=lambda x: -x["stats"]["total_return_pct"])
    return {"symbol": symbol, "market": market, "timeframe": timeframe, "rows": rows,
            "disclaimer": DISCLAIMER}


def sweep_ma_cross(symbol: str, market: str, timeframe: str,
                   fast_list: list[int] | None = None,
                   slow_list: list[int] | None = None,
                   exchange: str | None = None) -> dict:
    """Parameter sweep for the MA crossover — finds robust zones, not magic numbers."""
    fast_list = (fast_list or [5, 10, 20, 30])[:5]
    slow_list = (slow_list or [50, 100, 150, 200])[:5]
    rows = []
    for f in fast_list:
        for s in slow_list:
            if f >= s:
                continue
            r = run_backtest(symbol, market, timeframe, "ma_cross",
                             {"fast": f, "slow": s}, exchange=exchange)
            st = r["stats"]
            rows.append({"fast": f, "slow": s, "total_return_pct": st["total_return_pct"],
                         "sharpe": st["sharpe"], "max_drawdown_pct": st["max_drawdown_pct"],
                         "trades": st["trades"], "win_rate_pct": st["win_rate_pct"]})
    return {"symbol": symbol, "timeframe": timeframe, "rows": rows,
            "note": "Look for clusters of good settings — a single lucky pair is overfitting.",
            "disclaimer": DISCLAIMER}


def position_size(account: float, risk_pct: float, entry: float, stop: float) -> dict:
    risk_amount = account * risk_pct / 100
    stop_dist = abs(entry - stop)
    if stop_dist <= 0:
        return {"error": "Entry and stop must differ."}
    qty = risk_amount / stop_dist
    return {
        "account": account, "risk_pct": risk_pct,
        "risk_amount": round(risk_amount, 2),
        "entry": entry, "stop": stop,
        "stop_distance": round(stop_dist, 6),
        "quantity": round(qty, 4),
        "notional": round(qty * entry, 2),
        "note": "Size comes from risk, not conviction. Never risk more than planned.",
    }
