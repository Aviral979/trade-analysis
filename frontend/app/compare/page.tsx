"use client";

import * as React from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { SymbolSearch } from "@/components/symbol-search";
import { MultiLineChart, type LineSeriesData } from "@/components/chart/multi-line-chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pct } from "@/components/stat-card";
import type { Candle } from "@/lib/indicator-series";
import { cn } from "@/lib/utils";

const PALETTE = ["#2dd4bf", "#f0b90b", "#a855f7", "#fb7185"];
const PERIODS: Record<string, number> = { "3M": 66, "6M": 130, "1Y": 260, "2Y": 520 };

interface Slot {
  symbol: string;
  market: string;
  candles?: Candle[];
}

function pctSeries(c: Candle[]) {
  if (!c.length) return [];
  const base = c[0].close;
  return c.map((b) => ({ time: b.time, value: (b.close / base - 1) * 100 }));
}

function returns(c: Candle[]) {
  const out: number[] = [];
  for (let i = 1; i < c.length; i++) out.push(c[i].close / c[i - 1].close - 1);
  return out;
}

function corr(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den ? num / den : null;
}

function riskStats(c: Candle[]) {
  const r = returns(c);
  if (r.length < 5) return null;
  const mean = r.reduce((s, v) => s + v, 0) / r.length;
  const sd = Math.sqrt(r.reduce((s, v) => s + (v - mean) ** 2, 0) / r.length);
  const annVol = sd * Math.sqrt(252) * 100;
  let peak = c[0].close;
  let maxDD = 0;
  for (const b of c) {
    peak = Math.max(peak, b.close);
    maxDD = Math.min(maxDD, b.close / peak - 1);
  }
  const totalRet = (c[c.length - 1].close / c[0].close - 1) * 100;
  const sharpe = sd ? (mean / sd) * Math.sqrt(252) : 0;
  return { totalRet, annVol, maxDD: maxDD * 100, sharpe,
           bestDay: Math.max(...r) * 100, worstDay: Math.min(...r) * 100 };
}

export default function ComparePage() {
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [period, setPeriod] = React.useState("1Y");
  const [timeframe, setTimeframe] = React.useState("1d");
  const [loading, setLoading] = React.useState(false);

  const fetchFor = async (s: Slot, per = period, tf = timeframe) => {
    const r = await api.candles(s.symbol, s.market, tf, PERIODS[per]).catch(() => null);
    if (r) {
      setSlots((cur) => cur.map((x) => (x.symbol === s.symbol ? { ...x, candles: r.candles } : x)));
    }
  };

  const add = async (symbol: string, market: string) => {
    if (slots.length >= 4 || slots.some((s) => s.symbol === symbol)) return;
    const slot = { symbol, market };
    setSlots((cur) => [...cur, slot]);
    setLoading(true);
    await fetchFor(slot);
    setLoading(false);
  };

  React.useEffect(() => {
    slots.forEach((s) => fetchFor(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, timeframe]);

  const chartSeries: LineSeriesData[] = slots
    .filter((s) => s.candles)
    .map((s, i) => ({
      name: s.symbol,
      color: PALETTE[i % PALETTE.length],
      data: pctSeries(s.candles!),
    }));

  const stats = slots
    .filter((s) => s.candles && s.candles.length > 5)
    .map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length], stats: riskStats(s.candles!) }))
    .filter((s) => s.stats)
    .sort((a, b) => b.stats!.totalRet - a.stats!.totalRet);

  // ratio chart when exactly two loaded assets: A divided by B (normalized)
  const ratioSeries: LineSeriesData[] = [];
  if (stats.length === 2) {
    const [a, b] = stats;
    const n = Math.min(a.candles!.length, b.candles!.length);
    const ca = a.candles!.slice(-n);
    const cb = b.candles!.slice(-n);
    const base = ca[0].close / cb[0].close;
    ratioSeries.push({
      name: `${a.symbol} / ${b.symbol}`,
      color: "#2dd4bf",
      area: true,
      data: ca.map((bar, i) => ({ time: bar.time, value: bar.close / cb[i].close / base })),
    });
  }

  return (
    <div>
      <PageHeader title="Compare" description="Normalized performance, risk stats, ratio strength and correlation (up to 4 assets).">
        <div className="flex gap-2">
          <div className="w-28">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {Object.keys(PERIODS).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </div>
          <div className="w-28">
            <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              <option value="1d">Daily</option>
              <option value="1wk">Weekly</option>
            </Select>
          </div>
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SymbolSearch className="w-72" placeholder="Add asset…" onSelect={add} />
        {slots.map((s, i) => (
          <Badge key={s.symbol} variant="secondary" className="gap-1.5 py-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
            <span className="font-mono">{s.symbol}</span>
            <button onClick={() => setSlots(slots.filter((x) => x.symbol !== s.symbol))}>
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        {loading && <span className="text-xs text-muted-foreground">loading…</span>}
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Normalized Performance (%) — {period}</CardTitle>
        </CardHeader>
        <CardContent>
          {chartSeries.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              Add at least one asset to compare — try NVDA vs AAPL vs BTC/USDT.
            </div>
          ) : (
            <MultiLineChart series={chartSeries} height={400} />
          )}
        </CardContent>
      </Card>

      {ratioSeries.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Ratio Strength — {stats[0].symbol} ÷ {stats[1].symbol}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">
              Rising line = {stats[0].symbol} outperforming. Falling = {stats[1].symbol} outperforming. Starts at 1.00.
            </p>
            <MultiLineChart series={ratioSeries} height={220} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Risk & Return Leaderboard</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead className="text-right">Return</TableHead>
                  <TableHead className="text-right" title="Annualized volatility">Vol</TableHead>
                  <TableHead className="text-right" title="Max drawdown">MaxDD</TableHead>
                  <TableHead className="text-right">Sharpe</TableHead>
                  <TableHead className="text-right">Best Day</TableHead>
                  <TableHead className="text-right">Worst Day</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map((s, i) => (
                  <TableRow key={s.symbol}>
                    <TableCell>
                      <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                      <span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="font-mono font-medium">{s.symbol}</span>
                    </TableCell>
                    <TableCell className="text-right"><Pct value={s.stats!.totalRet} /></TableCell>
                    <TableCell className="text-right font-mono text-xs">{s.stats!.annVol.toFixed(1)}%</TableCell>
                    <TableCell className="text-right font-mono text-xs text-bear">{s.stats!.maxDD.toFixed(1)}%</TableCell>
                    <TableCell className="text-right font-mono text-xs">{s.stats!.sharpe.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-bull">+{s.stats!.bestDay.toFixed(1)}%</TableCell>
                    <TableCell className="text-right font-mono text-xs text-bear">{s.stats!.worstDay.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
                {stats.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No assets added yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Return Correlation</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.length < 2 ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                Add 2+ assets to see correlation.
              </div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="p-2" />
                      {stats.map((s) => (
                        <th key={s.symbol} className="p-2 text-center font-mono text-xs text-muted-foreground">
                          {s.symbol.slice(0, 8)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((a) => (
                      <tr key={a.symbol}>
                        <td className="p-2 font-mono text-xs text-muted-foreground">{a.symbol.slice(0, 8)}</td>
                        {stats.map((b) => {
                          const c = corr(returns(a.candles!), returns(b.candles!));
                          return (
                            <td
                              key={b.symbol}
                              className={cn("p-2 text-center font-mono text-xs")}
                              style={{
                                backgroundColor:
                                  c === null
                                    ? undefined
                                    : `rgba(${c > 0 ? "38,166,154" : "239,83,80"}, ${Math.abs(c) * 0.45})`,
                              }}
                            >
                              {c === null ? "—" : c.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-muted-foreground">
                  +1 = move together, 0 = independent, −1 = opposite. For diversification,
                  prefer holdings with low or negative correlation.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
