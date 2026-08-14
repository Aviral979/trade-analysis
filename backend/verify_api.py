"""Smoke-test every v1 endpoint in-process (no live server needed)."""
from fastapi.testclient import TestClient

from app.main import app

c = TestClient(app)
ok, fail = 0, 0


def check(name, fn):
    global ok, fail
    try:
        r = fn()
        assert r.status_code == 200, f"HTTP {r.status_code}: {r.text[:300]}"
        ok += 1
        print(f"  PASS {name}")
        return r.json()
    except Exception as e:
        fail += 1
        print(f"  FAIL {name}: {e}")
        return None


print("== MarketPilot API smoke test ==")
check("health", lambda: c.get("/api/v1/health"))
check("search", lambda: c.get("/api/v1/market/search", params={"q": "reli"}))
q = check("quote (stock)", lambda: c.get("/api/v1/market/quote", params={"symbol": "AAPL"}))
cd = check("candles (crypto)", lambda: c.get(
    "/api/v1/market/candles", params={"symbol": "BTC/USDT", "market": "crypto", "limit": 300}))
check("indices radar", lambda: c.get("/api/v1/market/indices"))
check("constituents", lambda: c.get("/api/v1/market/constituents", params={"country": "India"}))
check("crypto tickers", lambda: c.get("/api/v1/market/crypto/tickers"))
check("crypto funding", lambda: c.get("/api/v1/market/crypto/funding"))
check("crypto open-interest", lambda: c.get("/api/v1/market/crypto/open-interest"))
check("dominance", lambda: c.get("/api/v1/market/crypto/dominance"))
check("forex pairs", lambda: c.get("/api/v1/market/forex/pairs"))
check("forex strength", lambda: c.get("/api/v1/market/forex/strength"))
check("quotes batch", lambda: c.get("/api/v1/market/quotes", params={"symbols": "AAPL,MSFT"}))

a = check("indicators analyze", lambda: c.get(
    "/api/v1/indicators/analyze", params={"symbol": "RELIANCE.NS", "limit": 400}))
if a:
    print(f"      bias={a['bias']} rsi={a['momentum']['rsi']} patterns={len(a['patterns'])}")

check("forecast horizons", lambda: c.get("/api/v1/forecast/horizons"))
f = check("forecast run (2Y)", lambda: c.post("/api/v1/forecast/run", json={
    "symbol": "NIFTY50", "market": "index", "timeframe": "1d", "horizon": "2Y"}))
if f:
    print(f"      base={f['scenarios']['base']} uncertainty={f['uncertainty']} "
          f"hit={f['validation'].get('hit_rate_pct')}")

check("backtest strategies", lambda: c.get("/api/v1/backtest/strategies"))
b = check("backtest run", lambda: c.post("/api/v1/backtest/run", json={
    "symbol": "AAPL", "strategy": "ma_cross", "params": {"fast": 20, "slow": 50}}))
if b:
    print(f"      return={b['stats']['total_return_pct']}% sharpe={b['stats']['sharpe']} "
          f"trades={b['stats']['trades']}")
check("position size", lambda: c.post("/api/v1/backtest/position-size", json={
    "account": 100000, "risk_pct": 1, "entry": 2450, "stop": 2380}))

p = check("portfolio analyze", lambda: c.post("/api/v1/portfolio/analyze", json={"holdings": [
    {"symbol": "AAPL", "qty": 10, "avg_price": 150, "market": "stock"},
    {"symbol": "BTC/USDT", "qty": 0.25, "avg_price": 40000, "market": "crypto"},
]}))
if p:
    print(f"      value={p['metrics']['total_value']} suggestions={len(p['suggestions'])}")

ch = check("assistant chat", lambda: c.post("/api/v1/assistant/chat", json={
    "message": "How is AAPL looking?"}))
check("assistant brief", lambda: c.get("/api/v1/assistant/brief"))
check("assistant report", lambda: c.get("/api/v1/assistant/report", params={"symbol": "AAPL"}))
check("trade review", lambda: c.post("/api/v1/assistant/review-trade", json={
    "entry": 100, "exit": 112, "stop": 96, "target": 116, "emotion": "calm"}))

print(f"\n== {ok} passed, {fail} failed ==")
