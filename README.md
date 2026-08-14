# MarketPilot AI — Trading Research & Analysis Workstation

**Research smarter. Understand the market. Trade with discipline.**

Pipeline: **Market data → deterministic analytics → Kronos/scenario forecast → backtest validation → AI explanation → Bull/Base/Bear scenarios → risk + invalidation.**

Deterministic math (TA indicators, backtests, position sizing) is always computed in Python — never guessed by an LLM. Long horizons show scenario ranges with uncertainty labels, never false point predictions.

## Run (2 terminals)

```bash
# 1. Backend — http://127.0.0.1:8000/api/v1
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000

# 2. Frontend — http://localhost:3000
cd frontend
npm install
npm run dev        # or: npm run build && npm run start
```

## Modules

Dashboard · Shares · Crypto · Forex · Asset Analysis · Compare · Forecast Lab · Strategy & Backtest · Portfolio & Journal · AI Assistant

- **Ctrl+K** anywhere — universal symbol search.
- **Asset Analysis** — candle/line/area charts, MA/VWAP/Bollinger, S/R, Fib, candlestick patterns, drawing tools (horizontal & trend lines), one-click AI markup.
- **Forecast Lab** — 1D→2Y scenario cones with walk-forward validation (hit rate, directional accuracy, MAE, RMSE) and context-limit warnings.
- **Portfolio** — upload CSV (`symbol, qty, avg_price, market`) → live valuation, allocation, plain-language summary and suggestions. See `backend/sample_portfolio.csv`.
- **Assistant** — evidence-backed chat + 1-click JSON report.

## Data providers

Stocks/indices/forex via **yfinance**, crypto via **CCXT** (binance/bybit/coinbase/okx), dominance via CoinGecko. If a provider is unreachable, a deterministic mock engine keeps the UI alive (responses carry `source: "mock"`).

Optional accelerators (`backend/requirements-optional.txt`): **VectorBT**, **TA-Lib**, **Kronos** — the core runs fully without them; adapters auto-activate when installed.

Optional LLM phrasing for the assistant: set `MP_LLM_PROVIDER=openai`, `MP_LLM_API_KEY=...` (works fully rule-based without it).

> Forecasts are probabilistic scenario models for research and education only. Not financial advice.
