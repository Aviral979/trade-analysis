"use client";

import * as React from "react";
import { FlaskConical, Calculator } from "lucide-react";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SymbolSearch } from "@/components/symbol-search";
import { MultiLineChart } from "@/components/chart/multi-line-chart";
import { StatCard } from "@/components/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pct } from "@/components/stat-card";

export default function BacktestPage() {
  const [strategies, setStrategies] = React.useState<any[]>([]);
  const [symbol, setSymbol] = React.useState("RELIANCE.NS");
  const [market, setMarket] = React.useState("stock");
  const [timeframe, setTimeframe] = React.useState("1d");
  const [strategy, setStrategy] = React.useState("ma_cross");
  const [fast, setFast] = React.useState("20");
  const [slow, setSlow] = React.useState("50");
  const [oversold, setOversold] = React.useState("30");
  const [capital, setCapital] = React.useState("100000");
  const [result, setResult] = React.useState<any>(null);
  const [compareAll, setCompareAll] = React.useState<any>(null);
  const [sweep, setSweep] = React.useState<any>(null);
  const [running, setRunning] = React.useState(false);
  const [extraBusy, setExtraBusy] = React.useState(false);

  const [psAccount, setPsAccount] = React.useState("100000");
  const [psRisk, setPsRisk] = React.useState("1");
  const [psEntry, setPsEntry] = React.useState("");
  const [psStop, setPsStop] = React.useState("");
  const [psResult, setPsResult] = React.useState<any>(null);

  React.useEffect(() => {
    api.strategies().then((r) => setStrategies(r.strategies ?? []));
  }, []);

  const run = async () => {
    setRunning(true);
    try {
      const params: any = {};
      if (strategy === "ma_cross") {
        params.fast = parseInt(fast) || 20;
        params.slow = parseInt(slow) || 50;
      }
      if (strategy === "rsi_mean_reversion") {
        params.oversold = parseFloat(oversold) || 30;
      }
      const r = await api.runBacktest({
        symbol,
        market,
        timeframe,
        strategy,
        params,
        initial_capital: parseFloat(capital) || 100000,
      });
      setResult(r);
    } finally {
      setRunning(false);
    }
  };

  const calcSize = async () => {
    const r = await api.positionSize({
      account: parseFloat(psAccount) || 0,
      risk_pct: parseFloat(psRisk) || 0,
      entry: parseFloat(psEntry) || 0,
      stop: parseFloat(psStop) || 0,
    });
    setPsResult(r);
  };

  const sweepSlows: number[] = sweep
    ? Array.from(new Set<number>(sweep.rows.map((r: any) => r.slow as number))).sort((a, b) => a - b)
    : [];
  const sweepFasts: number[] = sweep
    ? Array.from(new Set<number>(sweep.rows.map((r: any) => r.fast as number))).sort((a, b) => a - b)
    : [];

  return (
    <div>
      <PageHeader title="Strategy & Backtest" description="Deterministic backtesting engine with full trade logs and risk metrics." />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-60">
            <Label>Asset</Label>
            <SymbolSearch
              placeholder={`${symbol} (${market})`}
              onSelect={(s, m) => {
                setSymbol(s);
                setMarket(m);
                setResult(null);
              }}
            />
          </div>
          <div className="w-52">
            <Label>Strategy</Label>
            <Select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-28">
            <Label>Timeframe</Label>
            <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
              <option value="1wk">1wk</option>
            </Select>
          </div>
          {strategy === "ma_cross" && (
            <>
              <div className="w-20">
                <Label>Fast MA</Label>
                <Input value={fast} onChange={(e) => setFast(e.target.value)} />
              </div>
              <div className="w-20">
                <Label>Slow MA</Label>
                <Input value={slow} onChange={(e) => setSlow(e.target.value)} />
              </div>
            </>
          )}
          {strategy === "rsi_mean_reversion" && (
            <div className="w-24">
              <Label>Oversold</Label>
              <Input value={oversold} onChange={(e) => setOversold(e.target.value)} />
            </div>
          )}
          <div className="w-32">
            <Label>Capital</Label>
            <Input value={capital} onChange={(e) => setCapital(e.target.value)} />
          </div>
          <Button onClick={run} disabled={running}>
            <FlaskConical /> {running ? "Running…" : "Run Backtest"}
          </Button>
          <Button
            variant="outline"
            disabled={extraBusy}
            onClick={async () => {
              setExtraBusy(true);
              try {
                const r = await api.compareAllStrategies({ symbol, market, timeframe });
                setCompareAll(r);
              } finally {
                setExtraBusy(false);
              }
            }}
          >
            Compare All Strategies
          </Button>
          <Button
            variant="outline"
            disabled={extraBusy}
            onClick={async () => {
              setExtraBusy(true);
              try {
                const r = await api.sweepMaCross({ symbol, market, timeframe });
                setSweep(r);
              } finally {
                setExtraBusy(false);
              }
            }}
          >
            Sweep MA Params
          </Button>
        </CardContent>
      </Card>

      {compareAll && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Strategy Leaderboard — same data, same costs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead className="text-right">Return</TableHead>
                  <TableHead className="text-right">Sharpe</TableHead>
                  <TableHead className="text-right">MaxDD</TableHead>
                  <TableHead className="text-right">Win Rate</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">vs Buy&Hold</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compareAll.rows.map((r: any, i: number) => (
                  <TableRow key={r.id} className={r.id === strategy ? "bg-primary/5" : undefined}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-sm">{r.name}</TableCell>
                    <TableCell className="text-right"><Pct value={r.stats.total_return_pct} /></TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.stats.sharpe}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-bear">{r.stats.max_drawdown_pct}%</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.stats.win_rate_pct}%</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.stats.trades}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={r.stats.total_return_pct >= r.buy_hold_return_pct ? "bull" : "bear"}>
                        {r.stats.total_return_pct >= r.buy_hold_return_pct ? "beats" : "lags"} {r.buy_hold_return_pct}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {sweep && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>MA Crossover Parameter Sweep</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="grid gap-1" style={{ gridTemplateColumns: `auto repeat(${sweepSlows.length}, minmax(90px, 1fr))` }}>
                <div />
                {sweepSlows.map((s) => (
                  <div key={s} className="p-2 text-center font-mono text-xs text-muted-foreground">
                    slow {String(s)}
                  </div>
                ))}
                {sweepFasts.map((f) => (
                  <React.Fragment key={f}>
                    <div className="flex items-center p-2 font-mono text-xs text-muted-foreground">
                      fast {String(f)}
                    </div>
                    {sweepSlows.map((s) => {
                      const row = sweep.rows.find((r: any) => r.fast === f && r.slow === s);
                      if (!row) return <div key={s} className="rounded bg-muted/30 p-2 text-center text-xs text-muted-foreground">—</div>;
                      const v = row.total_return_pct;
                      const intensity = Math.min(1, Math.abs(v) / 80);
                      return (
                        <div
                          key={s}
                          title={`Sharpe ${row.sharpe} · MaxDD ${row.max_drawdown_pct}% · ${row.trades} trades · WR ${row.win_rate_pct}%`}
                          className="rounded p-2 text-center font-mono text-xs"
                          style={{
                            backgroundColor: v >= 0
                              ? `rgba(38,166,154,${0.1 + intensity * 0.5})`
                              : `rgba(239,83,80,${0.1 + intensity * 0.5})`,
                          }}
                        >
                          {v}%
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{sweep.note}</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <StatCard
              label="Total Return"
              value={`${result.stats.total_return_pct}%`}
              tone={result.stats.total_return_pct >= 0 ? "bull" : "bear"}
              sub={`Buy&Hold ${result.buy_hold_return_pct}%`}
            />
            <StatCard label="CAGR" value={`${result.stats.cagr_pct}%`} />
            <StatCard label="Sharpe" value={result.stats.sharpe} hint="Return per unit of total risk" />
            <StatCard label="Sortino" value={result.stats.sortino} hint="Return per unit of downside risk" />
            <StatCard
              label="Max Drawdown"
              value={`${result.stats.max_drawdown_pct}%`}
              tone="bear"
            />
            <StatCard label="Win Rate" value={`${result.stats.win_rate_pct}%`} sub={`${result.stats.trades} trades`} />
            <StatCard label="Profit Factor" value={result.stats.profit_factor} />
            <StatCard label="Engine" value={result.engine} sub={`data: ${result.data_source}`} />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Exposure" value={`${result.stats.exposure_pct}%`} hint="% of bars the strategy was in the market" />
            <StatCard label="Avg Hold" value={`${result.stats.avg_bars_held} bars`} />
            <StatCard label="Avg Trade" value={`${result.stats.avg_trade_return_pct}%`} tone={result.stats.avg_trade_return_pct >= 0 ? "bull" : "bear"} />
            <StatCard label="Best Trade" value={`+${result.stats.best_trade_pct}%`} tone="bull" />
            <StatCard label="Worst Trade" value={`${result.stats.worst_trade_pct}%`} tone="bear" />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Equity Curve</CardTitle>
              </CardHeader>
              <CardContent>
                <MultiLineChart
                  height={320}
                  series={[
                    {
                      name: "equity",
                      color: result.stats.total_return_pct >= 0 ? "#2dd4bf" : "#ef5350",
                      area: true,
                      data: result.equity_curve,
                    },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Trades</CardTitle>
              </CardHeader>
              <CardContent className="max-h-80 overflow-y-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entry</TableHead>
                      <TableHead>Exit</TableHead>
                      <TableHead className="text-right">Return</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.trades.slice().reverse().map((t: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{t.entry}</TableCell>
                        <TableCell className="font-mono text-xs">{t.exit}</TableCell>
                        <TableCell className="text-right">
                          <Pct value={t.return_pct} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {result.trades.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          No trades triggered on this data.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          <p className="mt-4 text-[10px] text-muted-foreground">{result.disclaimer}</p>
        </>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="size-4 text-primary" /> Position Sizing Risk Calculator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <Label>Account Size</Label>
              <Input value={psAccount} onChange={(e) => setPsAccount(e.target.value)} />
            </div>
            <div className="w-28">
              <Label>Risk %</Label>
              <Input value={psRisk} onChange={(e) => setPsRisk(e.target.value)} />
            </div>
            <div className="w-32">
              <Label>Entry</Label>
              <Input value={psEntry} onChange={(e) => setPsEntry(e.target.value)} placeholder="e.g. 2450" />
            </div>
            <div className="w-32">
              <Label>Stop Loss</Label>
              <Input value={psStop} onChange={(e) => setPsStop(e.target.value)} placeholder="e.g. 2380" />
            </div>
            <Button variant="secondary" onClick={calcSize}>
              Calculate
            </Button>
          </div>
          {psResult && !psResult.error && (
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Risk Amount" value={fmtMoney(psResult.risk_amount)} sub={`${psResult.risk_pct}% of account`} />
              <StatCard label="Quantity" value={psResult.quantity} sub={`stop distance ${psResult.stop_distance}`} />
              <StatCard label="Position Value" value={fmtMoney(psResult.notional)} />
              <StatCard label="Note" value={<span className="text-xs font-normal">{psResult.note}</span>} />
            </div>
          )}
          {psResult?.error && <p className="mt-3 text-sm text-bear">{psResult.error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
