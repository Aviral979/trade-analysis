from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.portfolio import analyze_portfolio, parse_csv

router = APIRouter()


class HoldingsRequest(BaseModel):
    holdings: list[dict]


@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    content = await file.read()
    try:
        holdings = parse_csv(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"holdings": holdings, "count": len(holdings)}


@router.post("/analyze")
def analyze(req: HoldingsRequest):
    if not req.holdings:
        raise HTTPException(status_code=422, detail="No holdings supplied.")
    return analyze_portfolio(req.holdings)
