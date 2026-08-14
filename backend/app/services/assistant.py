"""Assistant layer — evidence-backed answers.

Every claim cites a number computed by the deterministic engines. If an LLM
key is configured (MP_LLM_PROVIDER / MP_LLM_API_KEY), the evidence pack is
passed to the model for phrasing; otherwise a precise rule-based composer
answers. Either way: numbers come from math, not imagination.
"""
from __future__ import annotations

import re
from typing import Any

from app.config import DISCLAIMER, LLM_API_KEY, LLM_MODEL, LLM_PROVIDER
from app.services import datafeed
from app.services.forecast import run_forecast
from app.services.indicators import analyze


# ---------------------------------------------------------------------------
# Evidence pack: everything the answer is allowed to know
# ---------------------------------------------------------------------------

def build_evidence(symbol: str, market: str, timeframe: str = "1d") -> dict[str, Any]:
    candles = datafeed.get_candles(symbol, market, timeframe, limit=600)
    quote = datafeed.get_quote(symbol, market)
    ta = analyze(candles["candles"])
    return {"quote": quote, "ta": ta, "symbol": symbol, "market": market,
            "timeframe": timeframe, "data_source": candles["source"]}


def _compose_answer(ev: dict[str, Any], question: str,
                    holdings: list[dict] | None = None) -> str:
    q, ta = ev["quote"], ev["ta"]
    sym = ev["symbol"]
    price = q.get("price")
    ccy = q.get("currency", "")
    lines = [f"**{sym}** — {price} {ccy} ({q.get('change_pct', 0):+.2f}% today). "
             f"Overall read: **{ta['bias']}** (score {ta['score']}).", ""]

    # --- Trend & momentum -------------------------------------------------
    lines.append("### Trend & Momentum")
    for r in ta["reasons"]:
        lines.append(f"- {r}")
    mom = ta["momentum"]
    lines.append(f"- MACD {mom['macd']} vs signal {mom['macd_signal']} "
                 f"(histogram {mom['macd_hist']:+.4f}).")

    # --- Volatility & risk ------------------------------------------------
    vol = ta["volatility"]
    lines.append("")
    lines.append("### Volatility & Risk")
    lines.append(f"- Regime: **{vol['regime']}** — ATR is {vol['atr_pct']}% of price "
                 f"({vol['atr']} per bar).")
    lines.append(f"- A stop tighter than ~{vol['atr']} is inside normal noise; "
                 f"give trades at least 1-1.5x ATR of room.")

    # --- Key levels ---------------------------------------------------------
    lv = ta["levels"]
    lines.append("")
    lines.append("### Key Levels")
    if lv["resistance"]:
        lines.append(f"- Resistance: {', '.join(map(str, lv['resistance']))}")
    if lv["support"]:
        lines.append(f"- Support: {', '.join(map(str, lv['support']))}")
    piv = lv.get("pivots", {})
    if piv:
        lines.append(f"- Pivot {piv.get('P')} · R1 {piv.get('R1')} · S1 {piv.get('S1')}")
    fib = ta.get("fibonacci", {})
    if fib:
        lines.append(f"- Fib zone ({fib['low']} → {fib['high']}): "
                     f"38.2% at {fib['levels']['0.382']}, 61.8% at {fib['levels']['0.618']}")

    # --- Patterns -----------------------------------------------------------
    pats = ta.get("patterns", [])
    if pats:
        lines.append("")
        lines.append("### Recent Candlestick Patterns")
        for p in pats[-4:]:
            lines.append(f"- {p['pattern']} ({p['bias']})")

    # --- Scenario outlook ---------------------------------------------------
    try:
        fc = run_forecast(sym, ev["market"], ev["timeframe"], "3M")
        sc = fc["scenarios"]
        lines.append("")
        lines.append("### Scenario Outlook (3M)")
        lines.append(f"- Bearish: {sc['bearish'][0]} – {sc['bearish'][1]}")
        lines.append(f"- Base: {sc['base'][0]} – {sc['base'][1]}")
        lines.append(f"- Bullish: {sc['bullish'][0]} – {sc['bullish'][1]}")
        lines.append(f"- Uncertainty: **{fc['uncertainty']}** · "
                     f"band hit-rate {fc['validation'].get('hit_rate_pct', '—')}% historically")
        lines.append(f"- {fc['invalidation']['bullish_scenario']}")
        lines.append(f"- {fc['invalidation']['bearish_scenario']}")
    except Exception:
        pass

    ql = question.lower()
    if any(w in ql for w in ("buy", "sell", "should i", "entry", "kharidu", "bechu", "lena", "loon")):
        lines.append("")
        lines.append("### Straight Answer")
        lines.append("I show setups, not orders. The disciplined version of a bullish trade "
                     "here: entry near support, invalidation just below it, position size "
                     "from the risk calculator so one wrong trade costs 1-2% — never more. "
                     "If price is mid-range with no level nearby, there is no trade; waiting "
                     "is a position too.")

    # --- Portfolio context ----------------------------------------------------
    if holdings:
        hit = [h for h in holdings
               if str(h.get("symbol", "")).upper() == sym.upper()]
        if hit:
            h = hit[0]
            pnl_pct = ((price - h["avg_price"]) / h["avg_price"] * 100) if h.get("avg_price") else 0
            lines.append("")
            lines.append("### In Your Portfolio")
            lines.append(f"- You hold {h.get('qty')} @ avg {h.get('avg_price')} — "
                         f"currently {pnl_pct:+.1f}% on this position.")

    lines.append("")
    lines.append(f"_{DISCLAIMER}_")
    return "\n".join(lines)


def _llm_phrase(evidence_text: str, question: str) -> str | None:
    """Optional LLM phrasing layer. Returns None when not configured."""
    if not (LLM_PROVIDER and LLM_API_KEY):
        return None
    try:  # pragma: no cover - depends on external service
        import requests
        if LLM_PROVIDER == "openai":
            r = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                json={"model": LLM_MODEL or "gpt-4o-mini",
                      "messages": [
                          {"role": "system", "content":
                           "You are MarketPilot's explanation layer. Use ONLY the evidence "
                           "provided. Plain language, no advice, end with risk note."},
                          {"role": "user", "content":
                           f"Evidence:\n{evidence_text}\n\nQuestion: {question}"}],
                      "temperature": 0.3},
                timeout=20)
            return r.json()["choices"][0]["message"]["content"]
    except Exception:
        return None
    return None


_SYMBOL_RE = re.compile(r"\b([A-Z][A-Z0-9.\-/]{1,14})\b")


def chat(message: str, symbol: str | None = None, market: str | None = None,
         holdings: list[dict] | None = None) -> dict:
    """Evidence-backed research chat — detailed, sectioned analysis."""
    market = market or "stock"
    if not symbol:
        for token in _SYMBOL_RE.findall(message.upper()):
            hit = datafeed.search_symbols(token)
            if hit:
                symbol, market = hit[0]["symbol"], hit[0]["market"]
                break

    if not symbol:
        lower = message.lower()
        if any(w in lower for w in ("market", "today", "indices", "brief", "duniya", "global")):
            return {"reply": market_brief()["brief"], "evidence": [], "mode": "brief"}
        if holdings and any(w in lower for w in ("portfolio", "holdings", "mera", "my ")):
            from app.services.portfolio import analyze_portfolio
            p = analyze_portfolio(holdings)
            lines = ["### Your Portfolio, Plain Words", ""]
            lines += [f"- {s}" for s in p["summary"]]
            lines.append("")
            lines.append("### What Needs Attention")
            for s in p["suggestions"]:
                lines.append(f"- **{s['title']}** — {s['detail']}")
            lines.append("")
            lines.append(f"_{DISCLAIMER}_")
            return {"reply": "\n".join(lines),
                    "evidence": [{"label": "Value", "value": p["metrics"]["total_value"]},
                                 {"label": "P&L %", "value": p["metrics"]["total_pnl_pct"]},
                                 {"label": "Positions", "value": p["metrics"]["positions"]}],
                    "mode": "portfolio"}
        return {
            "reply": ("Give me a symbol — like RELIANCE.NS, AAPL, BTC/USDT, EURUSD, "
                      "NIFTY50 — and I'll break down trend, momentum, volatility, key "
                      "levels, patterns and a 3M scenario outlook with live numbers. "
                      "Attach your portfolio (Portfolio page → Analyse) and I'll tell "
                      "you what needs attention in it."),
            "evidence": [], "mode": "help"}

    ev = build_evidence(symbol, market)
    draft = _compose_answer(ev, message, holdings)
    polished = _llm_phrase(draft, message)
    return {
        "reply": polished or draft,
        "symbol": symbol, "market": market,
        "evidence": [
            {"label": "Price", "value": f"{ev['quote'].get('price')} {ev['quote'].get('currency', '')}"},
            {"label": "Bias", "value": ev["ta"]["bias"]},
            {"label": "RSI(14)", "value": ev["ta"]["momentum"]["rsi"]},
            {"label": "Volatility", "value": ev["ta"]["volatility"]["regime"]},
            {"label": "Support", "value": ", ".join(map(str, ev["ta"]["levels"]["support"][:2])) or "—"},
            {"label": "Resistance", "value": ", ".join(map(str, ev["ta"]["levels"]["resistance"][:2])) or "—"},
            {"label": "Data", "value": ev["data_source"]},
        ],
        "mode": "analysis",
    }


def market_brief() -> dict:
    radar = datafeed.indices_radar()
    valid = [r for r in radar if r.get("change_pct") is not None]
    avg = sum(r["change_pct"] for r in valid) / len(valid) if valid else 0
    gainers = sorted(valid, key=lambda r: -r["change_pct"])[:3]
    losers = sorted(valid, key=lambda r: r["change_pct"])[:3]
    mood = "risk-on" if avg > 0.4 else ("risk-off" if avg < -0.4 else "mixed")

    lines = [f"**Global tape is {mood}** — average index move {avg:+.2f}% across "
             f"{len(valid)} major benchmarks.", ""]
    lines.append("Leading: " + ", ".join(f"{g['name']} {g['change_pct']:+.2f}%" for g in gainers))
    lines.append("Lagging: " + ", ".join(f"{l['name']} {l['change_pct']:+.2f}%" for l in losers))
    lines.append("")
    lines.append(f"_{DISCLAIMER}_")
    return {"brief": "\n".join(lines), "radar": radar, "mood": mood}


def report(symbol: str, market: str, timeframe: str = "1d") -> dict:
    """1-click analysis report bundle (frontend offers JSON download / print)."""
    ev = build_evidence(symbol, market, timeframe)
    fc = run_forecast(symbol, market, timeframe, "3M")
    return {
        "title": f"MarketPilot AI Research Report — {symbol}",
        "quote": ev["quote"], "technicals": ev["ta"],
        "forecast": {"horizon": "3M", "scenarios": fc["scenarios"],
                     "uncertainty": fc["uncertainty"], "validation": fc["validation"]},
        "data_source": ev["data_source"], "disclaimer": DISCLAIMER,
    }


def review_trade(trade: dict) -> dict:
    """Rule-based trade journal reviewer."""
    notes: list[str] = []
    entry, exit_p = trade.get("entry"), trade.get("exit")
    stop, target = trade.get("stop"), trade.get("target")
    if entry and stop and target:
        risk = abs(entry - stop)
        reward = abs(target - entry)
        rr = reward / risk if risk else 0
        notes.append(f"Planned reward-to-risk: {rr:.1f}R. "
                     + ("Healthy (>=2R)." if rr >= 2 else
                        "Thin — under 2R means even a good win rate struggles to compound."))
    if entry and exit_p:
        ret = (exit_p - entry) / entry * 100
        notes.append(f"Realized move: {ret:+.2f}% on the position.")
    if trade.get("setup"):
        notes.append(f"Setup logged: {trade['setup']}.")
    if trade.get("emotion"):
        notes.append(f"Emotion tagged: {trade['emotion']}. If entries cluster around "
                     "'fomo' or 'revenge', that's the leak to fix before any strategy tweak.")
    if trade.get("lessons"):
        notes.append(f"Your lesson: {trade['lessons']}")
    notes.append(f"_{DISCLAIMER}_")
    return {"review": "\n\n".join(notes)}
