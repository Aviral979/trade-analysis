const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";

async function getJSON<T = any>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function postJSON<T = any>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const detail = await r.json().catch(() => ({}));
    throw new Error(detail?.detail ?? `${r.status} ${r.statusText}`);
  }
  return r.json();
}

export const api = {
  health: () => getJSON("/health"),

  searchSymbols: (q: string) => getJSON(`/market/search?q=${encodeURIComponent(q)}`),
  quote: (symbol: string, market = "stock", exchange?: string) =>
    getJSON(`/market/quote?symbol=${encodeURIComponent(symbol)}&market=${market}${exchange ? `&exchange=${exchange}` : ""}`),
  quotes: (symbols: string[], market = "stock") =>
    getJSON(`/market/quotes?symbols=${symbols.map(encodeURIComponent).join(",")}&market=${market}`),
  candles: (symbol: string, market = "stock", timeframe = "1d", limit = 500, exchange?: string) =>
    getJSON(`/market/candles?symbol=${encodeURIComponent(symbol)}&market=${market}&timeframe=${timeframe}&limit=${limit}${exchange ? `&exchange=${exchange}` : ""}`),
  indices: () => getJSON("/market/indices"),
  constituents: (country: string) => getJSON(`/market/constituents?country=${country}`),
  cryptoTickers: (exchange?: string) =>
    getJSON(`/market/crypto/tickers${exchange ? `?exchange=${exchange}` : ""}`),
  cryptoFunding: (symbol: string, exchange?: string) =>
    getJSON(`/market/crypto/funding?symbol=${encodeURIComponent(symbol)}${exchange ? `&exchange=${exchange}` : ""}`),
  cryptoOpenInterest: (symbol: string, exchange?: string) =>
    getJSON(`/market/crypto/open-interest?symbol=${encodeURIComponent(symbol)}${exchange ? `&exchange=${exchange}` : ""}`),
  cryptoDominance: () => getJSON("/market/crypto/dominance"),
  forexPairs: () => getJSON("/market/forex/pairs"),
  forexStrength: () => getJSON("/market/forex/strength"),

  analyze: (symbol: string, market = "stock", timeframe = "1d", exchange?: string) =>
    getJSON(`/indicators/analyze?symbol=${encodeURIComponent(symbol)}&market=${market}&timeframe=${timeframe}${exchange ? `&exchange=${exchange}` : ""}`),

  horizons: () => getJSON("/forecast/horizons"),
  runForecast: (body: { symbol: string; market: string; timeframe: string; horizon: string; exchange?: string }) =>
    postJSON("/forecast/run", body),
  forecastMatrix: (body: { symbol: string; market: string; timeframe: string; exchange?: string }) =>
    postJSON("/forecast/matrix", body),

  strategies: () => getJSON("/backtest/strategies"),
  runBacktest: (body: any) => postJSON("/backtest/run", body),
  compareAllStrategies: (body: any) => postJSON("/backtest/compare-all", body),
  sweepMaCross: (body: any) => postJSON("/backtest/sweep", body),
  positionSize: (body: { account: number; risk_pct: number; entry: number; stop: number }) =>
    postJSON("/backtest/position-size", body),

  uploadPortfolio: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`${API}/portfolio/upload`, { method: "POST", body: fd });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d?.detail ?? "Upload failed");
    }
    return r.json();
  },
  analyzePortfolio: (holdings: any[]) => postJSON("/portfolio/analyze", { holdings }),

  chat: (message: string, symbol?: string, market?: string, holdings?: any[]) =>
    postJSON("/assistant/chat", { message, symbol, market, holdings }),
  brief: () => getJSON("/assistant/brief"),
  report: (symbol: string, market = "stock", timeframe = "1d") =>
    getJSON(`/assistant/report?symbol=${encodeURIComponent(symbol)}&market=${market}&timeframe=${timeframe}`),
  reviewTrade: (trade: any) => postJSON("/assistant/review-trade", trade),
};
