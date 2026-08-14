"use client";

import * as React from "react";
import { Telescope, AlertTriangle, FileJson, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/input";
import { SymbolSearch } from "@/components/symbol-search";
import { TradingChart, type ForecastChartOverlay } from "@/components/chart/trading-chart";
import { StatCard } from "@/components/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const UNCERTAINTY_VARIANT: Record<string, any> = {
  Low: "bull",
  Moderate: "secondary",
  High: "warn",
  "Very High": "bear",
};

export default function ForecastPage() {
  const [symbol, setSymbol] = React.useState("RELIANCE.NS");
  const [market, setMarket] = React.useState("stock");
  const [timeframe, setTimeframe] = React.useState("1d");
  const [horizon, setHorizon] = React.useState("1M");
  const [result, setResult] = React.useState<any>(null);
  const [matrix, setMatrix] = React.useState<any>(null);
  const [running, setRunning] = React.useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const r = await api.runForecast({ symbol, market, timeframe, horizon });
      setResult(r);
      api.forecastMatrix({ symbol, market, timeframe }).then(setMatrix).catch(() => {});
    } finally {
      setRunning(false);
    }
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify({ forecast: result, matrix }, null, 2)],
      { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forecast-${result.symbol.replace(/[/.]/g, "_")}-${result.horizon}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Forecast Lab"
        description="Scenario bands with historical validation — ranges and uncertainty, never false precision."
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-64">
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
          <div className="w-32">
            <Label>Timeframe</Label>
            <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
              <option value="1wk">1wk</option>
            </Select>
          </div>
          <div className="w-32">
            <Label>Horizon</Label>
            <Select value={horizon} onChange={(e) => setHorizon(e.target.value)}>
              {["1D", "1W", "1M", "3M", "6M", "1Y", "2Y"].map((h) => (
                <option key={h}>{h}</option>
              ))}
            </Select>
          </div>
          <Button onClick={run} disabled={running}>
            <Telescope /> {running ? "Forecasting…" : "Run Forecast"}
          </Button>
          {result && (
            <Button variant="outline" onClick={download}>
              <FileJson /> Download JSON
            </Button>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          {result.warnings.length > 0 && (
            <div className="mb-4 space-y-1.5">
              {result.warnings.map((w: string, i: number) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {w}
                </div>
              ))}
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Anchor Price" value={fmtPrice(result.anchor_price)} sub={`${symbol} · ${timeframe}`} />
            <StatCard
              label={`Bearish (${horizon})`}
              value={`${fmtPrice(result.scenarios.bearish[0])}–${fmtPrice(result.scenarios.bearish[1])}`}
              tone="bear"
            />
            <StatCard
              label={`Base (${horizon})`}
              value={`${fmtPrice(result.scenarios.base[0])}–${fmtPrice(result.scenarios.base[1])}`}
            />
            <StatCard
              label={`Bullish (${horizon})`}
              value={`${fmtPrice(result.scenarios.bullish[0])}–${fmtPrice(result.scenarios.bullish[1])}`}
              tone="bull"
            />
            <StatCard
              label="Uncertainty"
              value={
                <Badge variant={UNCERTAINTY_VARIANT[result.uncertainty] ?? "secondary"}>
                  {result.uncertainty}
                </Badge>
              }
              sub={`Ann. vol ${result.annualized_volatility_pct}%`}
            />
            <StatCard
              label="Engine"
              value={result.engine === "kronos" ? "Kronos" : "Scenario"}
              sub={`data: ${result.data_source}`}
            />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Expected Move (80% band)"
              value={`±${(result.stats.expected_move_pct / 2).toFixed(1)}%`}
              hint="Width of the base scenario band at horizon"
            />
            <StatCard
              label="Annualized Drift"
              value={`${result.stats.drift_annual_pct}%`}
              tone={result.stats.drift_annual_pct >= 0 ? "bull" : "bear"}
              hint="Historical average return tendency, shrunk for long horizons"
            />
            <StatCard label="Annualized Volatility" value={`${result.stats.vol_annual_pct}%`} />
            <StatCard label="Bars Projected" value={result.stats.bars_projected} sub={timeframe} />
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <div className="flex items-start gap-2 rounded-md border border-bear/30 bg-bear/5 px-3 py-2.5">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-bear" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-bear">Bullish scenario invalidation</div>
                <div className="text-sm text-secondary-foreground">{result.invalidation.bullish_scenario}</div>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-md border border-bull/30 bg-bull/5 px-3 py-2.5">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-bull" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-bull">Bearish scenario invalidation</div>
                <div className="text-sm text-secondary-foreground">{result.invalidation.bearish_scenario}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>{horizon} Scenario Cone</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <TradingChart
                  symbol={symbol}
                  market={market}
                  timeframe={timeframe}
                  chartType="candles"
                  height={460}
                  forecast={result.chart as ForecastChartOverlay}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Historical Validation</CardTitle>
              </CardHeader>
              <CardContent>
                {result.validation.available ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-md bg-muted p-3">
                        <div className="font-mono text-lg font-semibold">
                          {result.validation.hit_rate_pct}%
                        </div>
                        <div className="text-[10px] uppercase text-muted-foreground">
                          Band Hit Rate
                        </div>
                      </div>
                      <div className="rounded-md bg-muted p-3">
                        <div className="font-mono text-lg font-semibold">
                          {result.validation.directional_accuracy_pct}%
                        </div>
                        <div className="text-[10px] uppercase text-muted-foreground">
                          Direction Accuracy
                        </div>
                      </div>
                      <div className="rounded-md bg-muted p-3">
                        <div className="font-mono text-lg font-semibold">{result.validation.mae_pct}%</div>
                        <div className="text-[10px] uppercase text-muted-foreground">MAE</div>
                      </div>
                      <div className="rounded-md bg-muted p-3">
                        <div className="font-mono text-lg font-semibold">{result.validation.rmse_pct}%</div>
                        <div className="text-[10px] uppercase text-muted-foreground">RMSE</div>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Walk-forward tested on {result.validation.rounds} historical windows of this
                      asset — the model's bands actually contained the future price{" "}
                      {result.validation.hit_rate_pct}% of the time.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{result.validation.note}</p>
                )}
                <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
                  {result.disclaimer}
                </p>
              </CardContent>
            </Card>
          </div>

          {matrix && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>All Horizons — Scenario Matrix</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Horizon</TableHead>
                      <TableHead className="text-right text-bear">Bearish</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right text-bull">Bullish</TableHead>
                      <TableHead className="text-right">Uncertainty</TableHead>
                      <TableHead className="text-right">Historical Hit Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matrix.rows.map((r: any) => (
                      <TableRow
                        key={r.horizon}
                        className={r.horizon === horizon ? "bg-primary/5" : undefined}
                      >
                        <TableCell className="font-mono font-medium">{r.horizon}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {fmtPrice(r.bearish[0])} – {fmtPrice(r.bearish[1])}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {fmtPrice(r.base[0])} – {fmtPrice(r.base[1])}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {fmtPrice(r.bullish[0])} – {fmtPrice(r.bullish[1])}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={UNCERTAINTY_VARIANT[r.uncertainty] ?? "secondary"}>
                            {r.uncertainty}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {r.hit_rate_pct != null ? `${r.hit_rate_pct}%` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!result && (
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Telescope className="size-8 text-primary/50" />
            Pick an asset, timeframe and horizon — the engine returns Bull / Base / Bear
            scenario ranges with uncertainty labels and validation stats.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
