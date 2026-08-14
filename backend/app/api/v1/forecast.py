from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.forecast import HORIZONS, forecast_matrix, run_forecast

router = APIRouter()


class ForecastRequest(BaseModel):
    symbol: str
    market: str = "stock"
    timeframe: str = "1d"
    horizon: str = "1M"
    exchange: str | None = None


class MatrixRequest(BaseModel):
    symbol: str
    market: str = "stock"
    timeframe: str = "1d"
    exchange: str | None = None


@router.get("/horizons")
def horizons():
    return {"horizons": list(HORIZONS.keys())}


@router.post("/run")
def run(req: ForecastRequest):
    return run_forecast(req.symbol, req.market, req.timeframe, req.horizon, req.exchange)


@router.post("/matrix")
def matrix(req: MatrixRequest):
    return forecast_matrix(req.symbol, req.market, req.timeframe, req.exchange)
