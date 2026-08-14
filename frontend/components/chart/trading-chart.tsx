"use client";

import * as React from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  LineStyle,
  createSeriesMarkers,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { Minus, Slash, Eraser, Undo2, Percent, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  smaPoints,
  emaPoints,
  vwapPoints,
  bollingerPoints,
  type Candle,
} from "@/lib/indicator-series";

export interface ForecastChartOverlay {
  base: { time: number; value: number }[];
  bull: { time: number; value: number }[];
  bear: { time: number; value: number }[];
  upper_soft?: { time: number; value: number }[];
  lower_soft?: { time: number; value: number }[];
}

interface TradingChartProps {
  symbol: string;
  market: string;
  timeframe: string;
  exchange?: string;
  chartType?: "candles" | "line" | "area";
  height?: number;
  showMA?: boolean;
  showVWAP?: boolean;
  showBB?: boolean;
  showSR?: boolean;
  showFib?: boolean;
  showPatterns?: boolean;
  analysis?: any | null;
  forecast?: ForecastChartOverlay | null;
  autoRefreshSec?: number;
  className?: string;
}

const COLORS = {
  up: "#26a69a",
  down: "#ef5350",
  sma20: "#f0b90b",
  sma50: "#3b82f6",
  sma200: "#a855f7",
  ema20: "#fb923c",
  vwap: "#06b6d4",
  bb: "#64748b",
  draw: "#fbbf24",
  fib: "#818cf8",
};

const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

function priceFormat(price: number) {
  const abs = Math.abs(price) || 1;
  if (abs >= 100) return { precision: 2, minMove: 0.01 };
  if (abs >= 1) return { precision: 4, minMove: 0.0001 };
  if (abs >= 0.01) return { precision: 5, minMove: 0.00001 };
  return { precision: 8, minMove: 0.00000001 };
}

type DrawItem =
  | { type: "priceline"; ref: any }
  | { type: "series"; ref: any }
  | { type: "group"; refs: any[] };

export function TradingChart({
  symbol,
  market,
  timeframe,
  exchange,
  chartType = "candles",
  height = 460,
  showMA,
  showVWAP,
  showBB,
  showSR,
  showFib,
  showPatterns,
  analysis,
  forecast,
  autoRefreshSec = 0,
  className,
}: TradingChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const mainSeriesRef = React.useRef<any>(null);
  const volumeRef = React.useRef<any>(null);
  const overlayRefs = React.useRef<any[]>([]);
  const overlayPriceLinesRef = React.useRef<any[]>([]);
  const markersRef = React.useRef<any>(null);
  const drawingRefs = React.useRef<DrawItem[]>([]);
  const candlesRef = React.useRef<Candle[]>([]);
  const [mode, setMode] = React.useState<"none" | "hline" | "trend" | "fib">("none");
  const modeRef = React.useRef(mode);
  modeRef.current = mode;
  const anchorRef = React.useRef<{ time: UTCTimestamp; price: number } | null>(null);
  const [legend, setLegend] = React.useState<{ o: number; h: number; l: number; c: number } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const nearestTime = (x: number): UTCTimestamp | null => {
    const chart = chartRef.current;
    const data = candlesRef.current;
    if (!chart || data.length === 0) return null;
    const t = chart.timeScale().coordinateToTime(x) as UTCTimestamp | null;
    if (t) return t;
    // clicked in the blank future area -> clamp to the last real bar
    return data[data.length - 1].time as UTCTimestamp;
  };

  // ---- chart lifecycle ----------------------------------------------------
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      height,
      layout: { background: { color: "transparent" }, textColor: "#8b93a7", fontSize: 11 },
      grid: {
        vertLines: { color: "rgba(42, 49, 66, 0.5)" },
        horzLines: { color: "rgba(42, 49, 66, 0.5)" },
      },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: "#2a3142" },
      timeScale: { borderColor: "#2a3142", timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;

    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volumeRef.current = vol;

    chart.subscribeClick((param) => {
      const m = modeRef.current;
      if (m === "none" || !param.point || !mainSeriesRef.current) return;
      const price = mainSeriesRef.current.coordinateToPrice(param.point.y);
      if (price === null || price === undefined) return;

      if (m === "hline") {
        const pl = mainSeriesRef.current.createPriceLine({
          price, color: COLORS.draw, lineWidth: 1,
          lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "",
        });
        drawingRefs.current.push({ type: "priceline", ref: pl });
        return; // stay in hline mode for rapid multi-lines
      }

      // two-click tools (trend / fib)
      const t = nearestTime(param.point.x);
      if (!t) return;
      if (!anchorRef.current) {
        anchorRef.current = { time: t, price };
        return;
      }
      const a = anchorRef.current;
      anchorRef.current = null;

      if (m === "trend") {
        // lightweight-charts requires strictly ascending times — sort first
        const pts = [
          { time: a.time, value: a.price },
          { time: t, value: price },
        ].sort((p, q) => (p.time as number) - (q.time as number));
        if (pts[0].time === pts[1].time) return; // same bar -> nothing to draw
        const line = chart.addSeries(LineSeries, {
          color: COLORS.draw, lineWidth: 2,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        line.setData(pts);
        drawingRefs.current.push({ type: "series", ref: line });
      } else if (m === "fib") {
        const hi = Math.max(a.price, price);
        const lo = Math.min(a.price, price);
        const refs: any[] = [];
        for (const r of FIB_RATIOS) {
          const pl = mainSeriesRef.current.createPriceLine({
            price: hi - (hi - lo) * r,
            color: COLORS.fib, lineWidth: 1,
            lineStyle: r === 0 || r === 1 ? LineStyle.Solid : LineStyle.SparseDotted,
            axisLabelVisible: true, title: `${(r * 100).toFixed(1)}%`,
          });
          refs.push(pl);
        }
        drawingRefs.current.push({ type: "group", refs });
      }
    });

    chart.subscribeCrosshairMove((param) => {
      const data = candlesRef.current;
      if (data.length === 0) return;
      if (!param.time) {
        const last = data[data.length - 1];
        setLegend({ o: last.open, h: last.high, l: last.low, c: last.close });
        return;
      }
      const bar = data.find((d) => d.time === (param.time as number));
      if (bar) setLegend({ o: bar.open, h: bar.high, l: bar.low, c: bar.close });
    });

    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth });

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      overlayRefs.current = [];
      overlayPriceLinesRef.current = [];
      drawingRefs.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // magnet crosshair while drawing feels far more precise
  React.useEffect(() => {
    chartRef.current?.applyOptions({ crosshair: { mode: mode === "none" ? 0 : 1 } });
  }, [mode]);

  // ---- data loading ---------------------------------------------------------
  const load = React.useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    try {
      const r = await api.candles(symbol, market, timeframe, 600, exchange);
      candlesRef.current = r.candles as Candle[];
      setError(null);
      renderMain();
      renderOverlays();
    } catch (e: any) {
      setError(e?.message ?? "Failed to load chart data");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, market, timeframe, exchange, chartType]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!autoRefreshSec) return;
    const id = setInterval(load, autoRefreshSec * 1000);
    return () => clearInterval(id);
  }, [load, autoRefreshSec]);

  function removeDrawItem(d: DrawItem) {
    const chart = chartRef.current;
    try {
      if (d.type === "priceline") mainSeriesRef.current?.removePriceLine(d.ref);
      else if (d.type === "series") chart?.removeSeries(d.ref);
      else for (const r of d.refs) mainSeriesRef.current?.removePriceLine(r);
    } catch {}
  }

  function clearDrawings() {
    drawingRefs.current.forEach(removeDrawItem);
    drawingRefs.current = [];
    anchorRef.current = null;
  }

  function undoDrawing() {
    const last = drawingRefs.current.pop();
    if (last) removeDrawItem(last);
    anchorRef.current = null;
  }

  function renderMain() {
    const chart = chartRef.current;
    if (!chart) return;
    const data = candlesRef.current;
    clearDrawings();

    if (mainSeriesRef.current) {
      try {
        chart.removeSeries(mainSeriesRef.current);
      } catch {}
      mainSeriesRef.current = null;
    }
    if (data.length === 0) return;

    const pf = priceFormat(data[data.length - 1].close);

    if (chartType === "candles") {
      mainSeriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: COLORS.up, downColor: COLORS.down, borderVisible: false,
        wickUpColor: COLORS.up, wickDownColor: COLORS.down,
        priceFormat: { type: "price", ...pf },
      });
      mainSeriesRef.current.setData(data.map((d) => ({ ...d, time: d.time as UTCTimestamp })));
    } else if (chartType === "line") {
      mainSeriesRef.current = chart.addSeries(LineSeries, {
        color: "#2dd4bf", lineWidth: 2, priceFormat: { type: "price", ...pf },
      });
      mainSeriesRef.current.setData(
        data.map((d) => ({ time: d.time as UTCTimestamp, value: d.close }))
      );
    } else {
      mainSeriesRef.current = chart.addSeries(AreaSeries, {
        lineColor: "#2dd4bf", topColor: "rgba(45, 212, 191, 0.25)",
        bottomColor: "rgba(45, 212, 191, 0.02)", lineWidth: 2,
        priceFormat: { type: "price", ...pf },
      });
      mainSeriesRef.current.setData(
        data.map((d) => ({ time: d.time as UTCTimestamp, value: d.close }))
      );
    }

    volumeRef.current?.setData(
      data.map((d) => ({
        time: d.time as UTCTimestamp,
        value: d.volume,
        color: d.close >= d.open ? "rgba(38,166,154,0.35)" : "rgba(239,83,80,0.35)",
      }))
    );
    const last = data[data.length - 1];
    setLegend({ o: last.open, h: last.high, l: last.low, c: last.close });
    chart.timeScale().fitContent();
  }

  function renderOverlays() {
    const chart = chartRef.current;
    if (!chart) return;
    for (const s of overlayRefs.current) {
      try {
        chart.removeSeries(s);
      } catch {}
    }
    overlayRefs.current = [];
    for (const pl of overlayPriceLinesRef.current) {
      try {
        mainSeriesRef.current?.removePriceLine(pl);
      } catch {}
    }
    overlayPriceLinesRef.current = [];
    try {
      markersRef.current?.setMarkers([]);
    } catch {}
    markersRef.current = null;
    const data = candlesRef.current;
    if (data.length === 0) return;

    const addLine = (pts: { time: number; value: number }[], color: string, width = 1, style = LineStyle.Solid) => {
      const s = chart.addSeries(LineSeries, {
        color, lineWidth: width as any, lineStyle: style,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      s.setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      overlayRefs.current.push(s);
      return s;
    };

    if (showMA) {
      addLine(smaPoints(data, 20), COLORS.sma20);
      addLine(smaPoints(data, 50), COLORS.sma50);
      addLine(smaPoints(data, 200), COLORS.sma200);
      addLine(emaPoints(data, 20), COLORS.ema20, 1, LineStyle.Dashed);
    }
    if (showVWAP) addLine(vwapPoints(data), COLORS.vwap);
    if (showBB) {
      const { upper, lower } = bollingerPoints(data);
      addLine(upper, COLORS.bb);
      addLine(lower, COLORS.bb);
    }

    if (showSR && analysis?.levels) {
      const mk = (price: number, color: string, title: string) => {
        const pl = mainSeriesRef.current?.createPriceLine({
          price, color, lineWidth: 1,
          lineStyle: LineStyle.Dashed, axisLabelVisible: true, title,
        });
        if (pl) overlayPriceLinesRef.current.push(pl);
      };
      for (const s of analysis.levels.support ?? []) mk(s, "#26a69a", "S");
      for (const r of analysis.levels.resistance ?? []) mk(r, "#ef5350", "R");
    }

    if (showFib && analysis?.fibonacci?.levels) {
      for (const [k, v] of Object.entries(analysis.fibonacci.levels)) {
        const pl = mainSeriesRef.current?.createPriceLine({
          price: v as number, color: COLORS.fib, lineWidth: 1,
          lineStyle: LineStyle.SparseDotted, axisLabelVisible: false, title: `Fib ${k}`,
        });
        if (pl) overlayPriceLinesRef.current.push(pl);
      }
    }

    if (showPatterns && analysis?.patterns && mainSeriesRef.current) {
      const markers = (analysis.patterns as any[]).map((p) => ({
        time: p.time as UTCTimestamp,
        position: p.bias === "bullish" ? ("belowBar" as const) : ("aboveBar" as const),
        color: p.bias === "bullish" ? COLORS.up : p.bias === "bearish" ? COLORS.down : "#8b93a7",
        shape: p.bias === "bearish" ? ("arrowDown" as const) : ("arrowUp" as const),
        text: p.pattern,
      }));
      markersRef.current = createSeriesMarkers(mainSeriesRef.current, markers);
    }

    if (forecast) {
      if (forecast.upper_soft) addLine(forecast.upper_soft, "rgba(43,224,128,0.35)");
      if (forecast.lower_soft) addLine(forecast.lower_soft, "rgba(240,82,93,0.35)");
      addLine(forecast.bull, "#2be080", 2);
      addLine(forecast.bear, "#f0525d", 2);
      addLine(forecast.base, "#3b82f6", 2);
      chart.timeScale().fitContent();
    }
  }

  // re-render overlays when toggles / analysis / forecast change
  React.useEffect(() => {
    renderOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMA, showVWAP, showBB, showSR, showFib, showPatterns, analysis, forecast]);

  const toolBtn = (id: typeof mode, title: string, Icon: any) => (
    <button
      title={title}
      onClick={() => {
        anchorRef.current = null;
        setMode(mode === id ? "none" : id);
      }}
      className={cn(
        "rounded p-1.5 transition-colors hover:bg-accent",
        mode === id && "bg-primary/20 text-primary"
      )}
    >
      <Icon className="size-4" />
    </button>
  );

  return (
    <div className={cn("relative", className)}>
      <div className="absolute left-2 top-2 z-10 flex gap-1 rounded-md border bg-card/90 p-1 backdrop-blur">
        {toolBtn("hline", "Horizontal line — click to place (stays active)", Minus)}
        {toolBtn("trend", "Trend line — click two points", Slash)}
        {toolBtn("fib", "Fib retracement — click swing high & low", Percent)}
        <button
          title="Undo last drawing"
          onClick={undoDrawing}
          className="rounded p-1.5 transition-colors hover:bg-accent"
        >
          <Undo2 className="size-4" />
        </button>
        <button
          title="Clear all drawings"
          onClick={clearDrawings}
          className="rounded p-1.5 transition-colors hover:bg-accent"
        >
          <Eraser className="size-4" />
        </button>
      </div>

      {legend && (
        <div className="pointer-events-none absolute right-14 top-2 z-10 flex gap-3 rounded-md border bg-card/80 px-3 py-1 font-mono text-[11px] backdrop-blur">
          <span>O <b className="text-foreground">{legend.o}</b></span>
          <span>H <b className="text-bull">{legend.h}</b></span>
          <span>L <b className="text-bear">{legend.l}</b></span>
          <span>C <b className={legend.c >= legend.o ? "text-bull" : "text-bear"}>{legend.c}</b></span>
        </div>
      )}

      {(mode === "trend" || mode === "fib") && (
        <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-md border bg-card/90 px-3 py-1 text-xs text-amber-300 backdrop-blur">
          {anchorRef.current
            ? "Click the second point (Esc-style: click tool again to cancel)"
            : "Click the first point"}
        </div>
      )}
      {loading && (
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-md border bg-card/90 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
          <Loader2 className="size-3 animate-spin" /> updating
        </div>
      )}
      {error && (
        <div className="absolute inset-x-0 top-12 z-10 mx-auto w-fit rounded-md border border-bear/40 bg-bear/10 px-3 py-1 text-xs text-bear">
          {error}
        </div>
      )}
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}
