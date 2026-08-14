from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.services import assistant

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    symbol: str | None = None
    market: str | None = None
    holdings: list[dict] | None = None


class TradeReviewRequest(BaseModel):
    entry: float | None = None
    exit: float | None = None
    stop: float | None = None
    target: float | None = None
    setup: str | None = None
    emotion: str | None = None
    lessons: str | None = None


@router.post("/chat")
def chat(req: ChatRequest):
    return assistant.chat(req.message, req.symbol, req.market, req.holdings)


@router.get("/brief")
def brief():
    return assistant.market_brief()


@router.get("/report")
def report(symbol: str, market: str = "stock", timeframe: str = "1d"):
    return assistant.report(symbol, market, timeframe)


@router.post("/review-trade")
def review_trade(req: TradeReviewRequest):
    return assistant.review_trade(req.model_dump())
