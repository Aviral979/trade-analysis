"""Portfolio intelligence — upload, live valuation, easy-language guidance.

The goal: a user drops a CSV (or types holdings) and instantly understands
what they own, how it's doing, and what deserves attention — in plain words.
"""
from __future__ import annotations

import io
import re
from typing import Any

import pandas as pd

from app.config import DISCLAIMER
from app.services.datafeed import CONSTITUENTS, get_quote

_COLUMN_MAP = {
    "symbol": ["symbol", "ticker", "scrip", "stock", "pair"],
    "qty": ["qty", "quantity", "shares", "units", "amount"],
    "avg_price": ["avg_price", "buy_price", "price", "average", "cost", "buyprice", "avgprice"],
    "market": ["market", "type", "asset", "asset_class"],
    "date": ["date", "buy_date", "purchased"],
}

_SECTOR_LOOKUP = {
    s["symbol"]: s["sector"]
    for block in CONSTITUENTS.values() for s in block["stocks"]
}


def _clean_col(c: Any) -> str:
    c = str(c).replace("﻿", "")          # Excel BOM
    c = re.sub(r"[^a-z0-9]+", "_", c.strip().lower()).strip("_")
    return c


def parse_csv(content: bytes) -> list[dict]:
    # utf-8-sig strips Excel BOM; sep=None sniffs , ; or tab delimiters.
    try:
        df = pd.read_csv(io.BytesIO(content), encoding="utf-8-sig", sep=None, engine="python")
    except Exception:
        df = pd.read_csv(io.BytesIO(content), encoding="utf-8-sig")
    df.columns = [_clean_col(c) for c in df.columns]
    unnamed = [c for c in df.columns if c.startswith("unnamed")]
    if unnamed:
        df = df.drop(columns=unnamed)

    def pick(key: str) -> str | None:
        for cand in _COLUMN_MAP[key]:
            if cand in df.columns:
                return cand
        return None

    # Fallback: maybe the file has no header row at all -> positional columns.
    if not (pick("symbol") and pick("qty") and pick("avg_price")):
        raw = pd.read_csv(io.BytesIO(content), encoding="utf-8-sig", sep=None,
                          engine="python", header=None)
        if raw.shape[1] >= 3:
            cols = ["symbol", "qty", "avg_price", "market", "date"][: raw.shape[1]]
            raw.columns = cols
            # drop a first row if it is actually a header
            if str(raw.iloc[0, 0]).strip().lower() in ("symbol", "ticker", "scrip", "stock"):
                raw = raw.iloc[1:]
            raw["qty"] = pd.to_numeric(raw["qty"], errors="coerce")
            raw["avg_price"] = pd.to_numeric(raw["avg_price"], errors="coerce")
            if raw["qty"].notna().sum() > 0 and raw["avg_price"].notna().sum() > 0:
                df = raw

    if not (pick("symbol") and pick("qty") and pick("avg_price")):
        found = ", ".join(map(str, df.columns)) or "none"
        raise ValueError(
            f"Could not find the needed columns. Found: [{found}]. "
            "Use headers like: symbol, qty, avg_price (market & date optional).")

    holdings = []
    for _, row in df.iterrows():
        sym = str(row[pick("symbol")]).strip()
        if not sym or sym.lower() == "nan":
            continue
        holdings.append({
            "symbol": sym,
            "qty": float(row[pick("qty")]),
            "avg_price": float(row[pick("avg_price")]),
            "market": (str(row[pick("market")]).strip().lower()
                       if pick("market") and pd.notna(row[pick("market")]) else "stock"),
            "date": (str(row[pick("date")]) if pick("date") else None),
        })
    if not holdings:
        raise ValueError("No valid rows found in the CSV.")
    return holdings


def analyze_portfolio(holdings: list[dict]) -> dict[str, Any]:
    rows, total_value, invested = [], 0.0, 0.0
    for h in holdings:
        q = get_quote(h["symbol"], h.get("market", "stock"))
        price = q.get("price") or h["avg_price"]
        value = price * h["qty"]
        cost = h["avg_price"] * h["qty"]
        pnl = value - cost
        total_value += value
        invested += cost
        rows.append({
            **h,
            "name": q.get("name", h["symbol"]),
            "price": round(price, 4),
            "value": round(value, 2),
            "cost": round(cost, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round((pnl / cost * 100) if cost else 0.0, 2),
            "day_change_pct": q.get("change_pct"),
            "currency": q.get("currency", ""),
            "sector": _SECTOR_LOOKUP.get(h["symbol"].upper(), "Other"),
            "source": q.get("source"),
        })

    for r in rows:
        r["weight_pct"] = round(r["value"] / total_value * 100, 2) if total_value else 0

    rows.sort(key=lambda r: r["value"], reverse=True)
    total_pnl = total_value - invested

    # Allocation rollups
    by_market: dict[str, float] = {}
    by_sector: dict[str, float] = {}
    for r in rows:
        by_market[r["market"]] = by_market.get(r["market"], 0) + r["value"]
        by_sector[r["sector"]] = by_sector.get(r["sector"], 0) + r["value"]

    def pct_map(d: dict[str, float]) -> list[dict]:
        return [{"label": k, "value": round(v, 2),
                 "weight_pct": round(v / total_value * 100, 2) if total_value else 0}
                for k, v in sorted(d.items(), key=lambda x: -x[1])]

    hhi = sum((r["weight_pct"] / 100) ** 2 for r in rows) if rows else 0
    best = max(rows, key=lambda r: r["pnl_pct"]) if rows else None
    worst = min(rows, key=lambda r: r["pnl_pct"]) if rows else None

    summary, suggestions = _plain_language(rows, total_value, invested, hhi, by_market)

    return {
        "holdings": rows,
        "metrics": {
            "total_value": round(total_value, 2),
            "invested": round(invested, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_pct": round((total_pnl / invested * 100) if invested else 0, 2),
            "positions": len(rows),
            "concentration_hhi": round(hhi, 3),
            "best": {"symbol": best["symbol"], "pnl_pct": best["pnl_pct"]} if best else None,
            "worst": {"symbol": worst["symbol"], "pnl_pct": worst["pnl_pct"]} if worst else None,
        },
        "allocation": {"by_market": pct_map(by_market), "by_sector": pct_map(by_sector)},
        "summary": summary,
        "suggestions": suggestions,
        "disclaimer": DISCLAIMER,
    }


def _plain_language(rows, total_value, invested, hhi, by_market):
    pnl = total_value - invested
    pnl_pct = (pnl / invested * 100) if invested else 0
    direction = "up" if pnl >= 0 else "down"
    summary = [
        f"Your portfolio is worth about {total_value:,.0f} right now, "
        f"{direction} {abs(pnl_pct):.1f}% overall on {invested:,.0f} invested.",
    ]
    if rows:
        top = rows[0]
        summary.append(
            f"Your biggest position is {top['symbol']} — it makes up "
            f"{top['weight_pct']:.0f}% of everything you own.")
        winners = [r for r in rows if r["pnl"] > 0]
        summary.append(
            f"{len(winners)} of {len(rows)} holdings are in profit right now.")

    suggestions: list[dict] = []
    if rows and rows[0]["weight_pct"] > 25:
        suggestions.append({
            "title": "One stock carries a lot of weight",
            "detail": f"{rows[0]['symbol']} is {rows[0]['weight_pct']:.0f}% of your "
                      f"portfolio. If that one name falls hard, everything falls with it. "
                      f"Trimming part of it toward other ideas spreads the risk.",
            "severity": "high"})
    if hhi > 0.25:
        suggestions.append({
            "title": "Portfolio is concentrated",
            "detail": "A handful of positions drive most of your result. Adding "
                      "uncorrelated names or an index fund smooths the ride.",
            "severity": "medium"})
    if len(by_market) == 1:
        only = next(iter(by_market))
        suggestions.append({
            "title": "Everything sits in one market",
            "detail": f"100% of the portfolio is in {only}. A small allocation to a "
                      f"different asset class (index ETF, gold, or a little crypto) can "
                      f"reduce single-market shocks.",
            "severity": "medium"})
    losers = [r for r in rows if r["pnl_pct"] < -15]
    if losers:
        names = ", ".join(r["symbol"] for r in losers[:3])
        suggestions.append({
            "title": "Deep losers need a decision",
            "detail": f"{names} {'is' if len(losers) == 1 else 'are'} down more than 15%. "
                      f"Ask: would I buy this today at this price? If not, holding is "
                      f"usually hope, not strategy.",
            "severity": "medium"})
    if not suggestions:
        suggestions.append({
            "title": "Looks balanced",
            "detail": "No single position dominates and winners outweigh losers. "
                      "Keep position sizing consistent and review monthly.",
            "severity": "low"})
    return summary, suggestions
