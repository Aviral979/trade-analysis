from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.backtest import (STRATEGIES, compare_strategies, position_size,
                                   run_backtest, sweep_ma_cross)

router = APIRouter()


class BacktestRequest(BaseModel):
    symbol: str
    market: str = "stock"
    timeframe: str = "1d"
    strategy: str = "ma_cross"
    params: dict = {}
    initial_capital: float = 100_000
    commission_bps: float = 5
    exchange: str | None = None


class PositionSizeRequest(BaseModel):
    account: float
    risk_pct: float
    entry: float
    stop: float


class CompareRequest(BaseModel):
    symbol: str
    market: str = "stock"
    timeframe: str = "1d"
    initial_capital: float = 100_000
    exchange: str | None = None


class SweepRequest(BaseModel):
    symbol: str
    market: str = "stock"
    timeframe: str = "1d"
    fast: list[int] | None = None
    slow: list[int] | None = None
    exchange: str | None = None


@router.get("/strategies")
def strategies():
    return {"strategies": [{"id": k, "name": v[0]} for k, v in STRATEGIES.items()]}


@router.post("/run")
def run(req: BacktestRequest):
    return run_backtest(req.symbol, req.market, req.timeframe, req.strategy,
                        req.params, req.initial_capital, req.commission_bps,
                        req.exchange)


@router.post("/position-size")
def size(req: PositionSizeRequest):
    return position_size(req.account, req.risk_pct, req.entry, req.stop)


@router.post("/compare-all")
def compare_all(req: CompareRequest):
    return compare_strategies(req.symbol, req.market, req.timeframe,
                              req.initial_capital, req.exchange)


@router.post("/sweep")
def sweep(req: SweepRequest):
    return sweep_ma_cross(req.symbol, req.market, req.timeframe,
                          req.fast, req.slow, req.exchange)
