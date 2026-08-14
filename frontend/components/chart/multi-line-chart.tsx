"use client";

import * as React from "react";
import {
  createChart,
  LineSeries,
  AreaSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

export interface LineSeriesData {
  name: string;
  color: string;
  area?: boolean;
  data: { time: number; value: number }[];
}

export function MultiLineChart({
  series,
  height = 380,
  className,
}: {
  series: LineSeriesData[];
  height?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<any[]>([]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      height,
      layout: { background: { color: "transparent" }, textColor: "#8b93a7", fontSize: 11 },
      grid: {
        vertLines: { color: "rgba(42,49,66,0.5)" },
        horzLines: { color: "rgba(42,49,66,0.5)" },
      },
      rightPriceScale: { borderColor: "#2a3142" },
      timeScale: { borderColor: "#2a3142", timeVisible: true },
    });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth });
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [height]);

  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const s of seriesRef.current) {
      try {
        chart.removeSeries(s);
      } catch {}
    }
    seriesRef.current = [];
    for (const s of series) {
      const inst = s.area
        ? chart.addSeries(AreaSeries, {
            lineColor: s.color,
            topColor: `${s.color}33`,
            bottomColor: `${s.color}05`,
            lineWidth: 2,
          })
        : chart.addSeries(LineSeries, { color: s.color, lineWidth: 2 });
      inst.setData(s.data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      seriesRef.current.push(inst);
    }
    if (series.length > 0) chart.timeScale().fitContent();
  }, [series]);

  return <div ref={ref} className={className} style={{ height }} />;
}
