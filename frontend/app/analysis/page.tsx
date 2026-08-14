"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, Info } from "lucide-react";
import { api } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SymbolSearch } from "@/components/symbol-search";
import { TradingChart } from "@/components/chart/trading-chart";
import { Pct } from "@/components/stat-card";
import { cn } from "@/lib/utils";

const GLOSSARY: Record<string, { title: string; body: string }> = {
  rsi: {
    title: "RSI — Relative Strength Index",
    body: "Measures momentum on a 0-100 scale. Above 70 = overbought (price ran up fast, pullback risk). Below 30 = oversold (sellers exhausted, bounce potential). Between 40-60 = neutral. It does NOT predict direction — it measures speed.",
  },
  macd: {
    title: "MACD — Moving Average Convergence Divergence",
    body: "Two exponential averages (12 and 26) compared. When the MACD line crosses above its signal line, momentum is turning up; below, turning down. The histogram shows the gap between them — growing bars mean strengthening momentum.",
  },
  ma: {
    title: "Moving Averages (SMA/EMA)",
    body: "Average closing price over N periods. Price above the 50 SMA = medium uptrend; above 200 SMA = long uptrend. EMA reacts faster because recent prices weigh more. Crosses (e.g., 50 crossing above 200 — 'golden cross') mark regime shifts.",
  },
  atr: {
    title: "ATR — Average True Range",
    body: "Average size of a candle's full range, including gaps. It measures volatility, not direction. Use it for stop placement: a stop tighter than 1x ATR gets shaken out by normal noise.",
  },
  vwap: {
    title: "VWAP — Volume Weighted Average Price",
    body: "The average price weighted by volume — where most business actually got done. Institutions benchmark against it. Price above VWAP = buyers in control of the session; below = sellers.",
  },
  bb: {
    title: "Bollinger Bands",
    body: "A 20-period average with bands 2 standard deviations away. Bands widening = volatility expanding (trend). Bands squeezing = calm before a move. Touches of the outer band are not automatic reversal signals — in strong trends price rides the band.",
  },
  sr: {
    title: "Support & Resistance",
    body: "Price zones where buying (support) or selling (resistance) repeatedly showed up. They are zones, not exact lines. Broken resistance often becomes new support and vice versa.",
  },
  fib: {
    title: "Fibonacci Retracements",
    body: "Levels (23.6%, 38.2%, 50%, 61.8%, 78.6%) drawn between a significant high and low. Traders watch the 38.2-61.8% zone for pullbacks to resume the prior trend. Self-fulfilling to a degree — many eyes watch the same levels.",
  },
};

const TIMEFRAMES = ["15m", "1h", "4h", "1d", "1wk"];

function AnalysisInner() {
  const params = useSearchParams();
  const [symbol, setSymbol] = React.useState(params.get("symbol") ?? "RELIANCE.NS");
  const [market, setMarket] = React.useState(params.get("market") ?? "stock");
  const exchange = params.get("exchange") ?? undefined;
  const [timeframe, setTimeframe] = React.useState("1d");
  const [chartType, setChartType] = React.useState<"candles" | "line" | "area">("candles");
  const [toggles, setToggles] = React.useState({
    ma: true,
    vwap: false,
    bb: false,
    sr: true,
    fib: false,
    patterns: true,
  });
  const [quote, setQuote] = React.useState<any>(null);
  const [analysis, setAnalysis] = React.useState<any>(null);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [explain, setExplain] = React.useState<string | null>(null);

  React.useEffect(() => {
    setAnalysis(null);
    const fetchQuote = () =>
      api.quote(symbol, market, exchange).then(setQuote).catch(() => setQuote(null));
    fetchQuote();
    const id = setInterval(fetchQuote, 30000); // live quote, no page refresh
    return () => clearInterval(id);
  }, [symbol, market, exchange]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const r = await api.analyze(symbol, market, timeframe, exchange);
      setAnalysis(r);
      setToggles((t) => ({ ...t, sr: true, patterns: true }));
    } finally {
      setAnalyzing(false);
    }
  };

  const ExplainBtn = ({ k }: { k: string }) => (
    <button
      onClick={() => setExplain(k)}
      className="text-muted-foreground transition-colors hover:text-primary"
      title={`What is ${GLOSSARY[k].title}?`}
    >
      <Info className="size-3.5" />
    </button>
  );

  return (
    <div>
      <PageHeader title="Asset Analysis" description="Live chart, deterministic indicators, key levels and AI markup.">
        <SymbolSearch
          className="w-72"
          placeholder="Any stock, index, crypto, forex…"
          onSelect={(s, m) => {
            setSymbol(s);
            setMarket(m);
          }}
        />
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <span className="font-mono text-lg font-semibold">{symbol}</span>
            <Badge variant="secondary" className="ml-2">{market}</Badge>
          </div>
          {quote && (
            <div className="flex items-baseline gap-2">
              <span className="relative flex size-2 self-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bull opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-bull" />
              </span>
              <span className="font-mono text-xl font-semibold">
                {fmtPrice(quote.price, quote.currency)}
              </span>
              <Pct value={quote.change_pct} />
              <span className="text-xs text-muted-foreground">via {quote.source} · live</span>
            </div>
          )}
        </div>
        <Button onClick={runAnalysis} disabled={analyzing}>
          <Sparkles /> {analyzing ? "Analyzing…" : "AI Analyse"}
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tabs
          tabs={TIMEFRAMES.map((t) => ({ id: t, label: t }))}
          active={timeframe}
          onChange={setTimeframe}
        />
        <Tabs
          tabs={[
            { id: "candles", label: "Candles" },
            { id: "line", label: "Line" },
            { id: "area", label: "Area" },
          ]}
          active={chartType}
          onChange={(v) => setChartType(v as any)}
        />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(
            [
              ["ma", "MA", "ma"],
              ["vwap", "VWAP", "vwap"],
              ["bb", "Bollinger", "bb"],
              ["sr", "S/R", "sr"],
              ["fib", "Fib", "fib"],
              ["patterns", "Patterns", "rsi"],
            ] as const
          ).map(([key, label, gloss]) => (
            <span key={key} className="flex items-center gap-1">
              <button
                onClick={() => setToggles((t) => ({ ...t, [key]: !t[key] }))}
                className={cn(
                  "rounded-md border px-2 py-1 transition-colors",
                  toggles[key]
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {label}
              </button>
              <ExplainBtn k={gloss} />
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardContent className="p-2">
            <TradingChart
              symbol={symbol}
              market={market}
              timeframe={timeframe}
              exchange={exchange}
              chartType={chartType}
              height={520}
              showMA={toggles.ma}
              showVWAP={toggles.vwap}
              showBB={toggles.bb}
              showSR={toggles.sr}
              showFib={toggles.fib}
              showPatterns={toggles.patterns}
              analysis={analysis}
              autoRefreshSec={60}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Technical Read</CardTitle>
          </CardHeader>
          <CardContent>
            {!analysis ? (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Press <span className="text-primary">AI Analyse</span> — the engine computes
                  trend, momentum, volatility, support/resistance and candlestick patterns,
                  then marks them on the chart automatically.
                </p>
                <p className="text-xs">
                  Everything shown is computed by deterministic math (TA-style indicators),
                  never guessed by a language model.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      analysis.bias === "Bullish"
                        ? "bull"
                        : analysis.bias === "Bearish"
                        ? "bear"
                        : "secondary"
                    }
                  >
                    {analysis.bias}
                  </Badge>
                  <Badge variant="warn">Volatility: {analysis.volatility.regime}</Badge>
                </div>

                <div>
                  <div className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                    Momentum <ExplainBtn k="rsi" /> <ExplainBtn k="macd" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-muted p-2">
                      <div className="font-mono text-sm font-semibold">{analysis.momentum.rsi}</div>
                      <div className="text-[10px] text-muted-foreground">RSI 14</div>
                    </div>
                    <div className="rounded-md bg-muted p-2">
                      <div className="font-mono text-sm font-semibold">
                        {analysis.momentum.macd_hist > 0 ? "+" : ""}
                        {analysis.momentum.macd_hist}
                      </div>
                      <div className="text-[10px] text-muted-foreground">MACD Hist</div>
                    </div>
                    <div className="rounded-md bg-muted p-2">
                      <div className="font-mono text-sm font-semibold">
                        {analysis.volatility.atr_pct}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">ATR %</div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                    Evidence
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    {analysis.reasons.map((r: string, i: number) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
                        <span className="text-secondary-foreground">{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                    Key Levels <ExplainBtn k="sr" />
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-bear">Resistance</span>
                      <span className="font-mono">
                        {analysis.levels.resistance.join("  ·  ") || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-bull">Support</span>
                      <span className="font-mono">
                        {analysis.levels.support.join("  ·  ") || "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {analysis.patterns.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                      Recent Patterns
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.patterns.slice(-6).map((p: any, i: number) => (
                        <Badge
                          key={i}
                          variant={p.bias === "bullish" ? "bull" : p.bias === "bearish" ? "bear" : "secondary"}
                        >
                          {p.pattern}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  {analysis.disclaimer}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={!!explain}
        onClose={() => setExplain(null)}
        title={explain ? GLOSSARY[explain].title : ""}
      >
        <p className="text-sm leading-relaxed text-secondary-foreground">
          {explain ? GLOSSARY[explain].body : ""}
        </p>
      </Dialog>
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <React.Suspense fallback={<Skeleton className="h-96" />}>
      <AnalysisInner />
    </React.Suspense>
  );
}
