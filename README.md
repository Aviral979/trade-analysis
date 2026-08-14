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

## Deploy (production)

The two halves deploy to different platforms — the backend is a long-running
Python engine (batch market calls, walk-forward math), which does not fit
Vercel's serverless model.

**Frontend → Vercel**
1. Vercel project → **Settings → General → Root Directory → `frontend`** (this alone fixes the
   "Service backend … must specify an entrypoint" error — the repo-root `vercel.json` covers the
   same thing if you keep the root as `.`).
2. Add env var: `NEXT_PUBLIC_API_URL = https://<your-render-service>.onrender.com/api/v1`
3. Deploy.

**Backend → Render** (free tier)
1. render.com → **New → Blueprint** → select this repo — `render.yaml` does the rest
   (rootDir `backend`, builds with pip, starts uvicorn, health check `/api/v1/health`).
2. Copy the service URL into the Vercel env var above and redeploy the frontend.

Railway works too: new service from repo, root directory `backend`,
start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

## Data providers

Stocks/indices/forex via **yfinance**, crypto via **CCXT** (binance/bybit/coinbase/okx), dominance via CoinGecko. If a provider is unreachable, a deterministic mock engine keeps the UI alive (responses carry `source: "mock"`).

Optional accelerators (`backend/requirements-optional.txt`): **VectorBT**, **TA-Lib**, **Kronos** — the core runs fully without them; adapters auto-activate when installed.

Optional LLM phrasing for the assistant: set `MP_LLM_PROVIDER=openai`, `MP_LLM_API_KEY=...` (works fully rule-based without it).

> Forecasts are probabilistic scenario models for research and education only. Not financial advice.
