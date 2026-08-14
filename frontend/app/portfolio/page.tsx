"use client";

import * as React from "react";
import { Upload, Plus, Trash2, Sparkles, BookOpen, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { StatCard, Pct } from "@/components/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MultiLineChart } from "@/components/chart/multi-line-chart";
import { Markdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

interface Holding {
  symbol: string;
  qty: number;
  avg_price: number;
  market: string;
}

interface JournalEntry {
  id: string;
  symbol: string;
  direction: "long" | "short";
  qty: string;
  entry: string;
  exit: string;
  stop: string;
  target: string;
  fees: string;
  setup: string;
  emotion: string;
  tags: string;
  lessons: string;
  review?: string;
}

const SEVERITY_VARIANT: Record<string, any> = { high: "bear", medium: "warn", low: "bull" };
const EMPTY_DRAFT: JournalEntry = {
  id: "", symbol: "", direction: "long", qty: "", entry: "", exit: "",
  stop: "", target: "", fees: "", setup: "", emotion: "", tags: "", lessons: "",
};

function tradePnl(j: JournalEntry): number | null {
  const e = parseFloat(j.entry);
  const x = parseFloat(j.exit);
  const q = parseFloat(j.qty) || 1;
  const fees = parseFloat(j.fees) || 0;
  if (Number.isNaN(e) || Number.isNaN(x)) return null;
  const dir = j.direction === "short" ? -1 : 1;
  return (x - e) * q * dir - fees;
}

function tradeR(j: JournalEntry): number | null {
  const pnl = tradePnl(j);
  const e = parseFloat(j.entry);
  const s = parseFloat(j.stop);
  const q = parseFloat(j.qty) || 1;
  if (pnl === null || Number.isNaN(e) || Number.isNaN(s) || e === s) return null;
  return pnl / (Math.abs(e - s) * q);
}

export default function PortfolioPage() {
  const [tab, setTab] = React.useState("portfolio");
  const [holdings, setHoldings] = React.useState<Holding[]>([]);
  const [result, setResult] = React.useState<any>(null);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [journal, setJournal] = React.useState<JournalEntry[]>([]);
  const [draft, setDraft] = React.useState<JournalEntry>(EMPTY_DRAFT);
  const [emotionFilter, setEmotionFilter] = React.useState("all");

  React.useEffect(() => {
    try {
      setJournal(JSON.parse(localStorage.getItem("mp_journal") ?? "[]"));
      setHoldings(JSON.parse(localStorage.getItem("mp_holdings") ?? "[]"));
    } catch {}
  }, []);

  const saveJournal = (entries: JournalEntry[]) => {
    setJournal(entries);
    localStorage.setItem("mp_journal", JSON.stringify(entries));
  };

  const onUpload = async (file: File) => {
    setError(null);
    try {
      const r = await api.uploadPortfolio(file);
      setHoldings(r.holdings);
      setResult(null);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    }
  };

  const analyze = React.useCallback(async (list?: Holding[]) => {
    const h = list ?? holdings;
    if (h.length === 0) return;
    setAnalyzing(true);
    setError(null);
    try {
      const r = await api.analyzePortfolio(h);
      setResult(r);
      localStorage.setItem("mp_holdings", JSON.stringify(h)); // assistant context
    } catch (e: any) {
      setError(e?.message ?? "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [holdings]);

  // live refresh — re-value the portfolio every 45s without touching the page
  React.useEffect(() => {
    if (!result || holdings.length === 0) return;
    const id = setInterval(() => analyze(), 45000);
    return () => clearInterval(id);
  }, [result, holdings, analyze]);

  const updateRow = (i: number, patch: Partial<Holding>) =>
    setHoldings(holdings.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));

  const addJournal = () => {
    if (!draft.symbol) return;
    saveJournal([{ ...draft, id: Date.now().toString() }, ...journal]);
    setDraft(EMPTY_DRAFT);
  };

  const review = async (entry: JournalEntry) => {
    const r = await api.reviewTrade({
      entry: parseFloat(entry.entry) || undefined,
      exit: parseFloat(entry.exit) || undefined,
      stop: parseFloat(entry.stop) || undefined,
      target: parseFloat(entry.target) || undefined,
      setup: entry.setup,
      emotion: entry.emotion,
      lessons: entry.lessons,
    });
    saveJournal(journal.map((j) => (j.id === entry.id ? { ...j, review: r.review } : j)));
  };

  // ---- journal analytics ---------------------------------------------------
  const closed = journal.filter((j) => tradePnl(j) !== null);
  const pnls = closed.map((j) => tradePnl(j)!);
  const rs = closed.map((j) => tradeR(j)).filter((r): r is number => r !== null);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p <= 0);
  const profitFactor = Math.abs(wins.reduce((a, b) => a + b, 0) / (losses.reduce((a, b) => a + b, 0) || -1e-9));
  let cum = 0;
  const journalEquity = [...closed].reverse().map((j, i) => {
    cum += tradePnl(j)!;
    return { time: i + 1, value: cum };
  });
  const emotionStats = Object.entries(
    closed.reduce<Record<string, { n: number; wins: number; pnl: number }>>((acc, j) => {
      const k = j.emotion || "untagged";
      acc[k] ??= { n: 0, wins: 0, pnl: 0 };
      acc[k].n++;
      if (tradePnl(j)! > 0) acc[k].wins++;
      acc[k].pnl += tradePnl(j)!;
      return acc;
    }, {})
  );
  const filteredJournal = emotionFilter === "all" ? journal : journal.filter((j) => (j.emotion || "untagged") === emotionFilter);

  return (
    <div>
      <PageHeader
        title="Portfolio & Journal"
        description="Upload holdings, get live valuation plus plain-language guidance — and journal every trade."
      >
        <Tabs
          tabs={[
            { id: "portfolio", label: "Portfolio" },
            { id: "journal", label: `Trade Journal (${journal.length})` },
          ]}
          active={tab}
          onChange={setTab}
        />
      </PageHeader>

      {tab === "portfolio" && (
        <>
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/10">
                  <Upload className="size-4" />
                  Upload CSV (symbol, qty, avg_price, market?)
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                  />
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setHoldings([...holdings, { symbol: "", qty: 0, avg_price: 0, market: "stock" }])
                  }
                >
                  <Plus /> Add Row
                </Button>
                {holdings.length > 0 && (
                  <>
                    <Button onClick={() => analyze()} disabled={analyzing}>
                      <Sparkles /> {analyzing ? "Analyzing…" : "Analyse My Portfolio"}
                    </Button>
                    {result && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="relative flex size-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bull opacity-60" />
                          <span className="relative inline-flex size-2 rounded-full bg-bull" />
                        </span>
                        Live · refreshes every 45s
                      </span>
                    )}
                  </>
                )}
              </div>
              {error && (
                <div className="mb-3 rounded-md border border-bear/40 bg-bear/10 px-3 py-2 text-sm text-bear">
                  {error}
                </div>
              )}
              {holdings.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Market</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Avg Price</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holdings.map((h, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Input
                            value={h.symbol}
                            placeholder="RELIANCE.NS / AAPL / BTC/USDT"
                            onChange={(e) => updateRow(i, { symbol: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="w-32">
                          <Select value={h.market} onChange={(e) => updateRow(i, { market: e.target.value })}>
                            <option value="stock">stock</option>
                            <option value="crypto">crypto</option>
                            <option value="forex">forex</option>
                            <option value="index">index</option>
                          </Select>
                        </TableCell>
                        <TableCell className="w-28">
                          <Input
                            type="number"
                            value={h.qty || ""}
                            onChange={(e) => updateRow(i, { qty: parseFloat(e.target.value) || 0 })}
                          />
                        </TableCell>
                        <TableCell className="w-32">
                          <Input
                            type="number"
                            value={h.avg_price || ""}
                            onChange={(e) => updateRow(i, { avg_price: parseFloat(e.target.value) || 0 })}
                          />
                        </TableCell>
                        <TableCell className="w-10">
                          <Button variant="ghost" size="icon" onClick={() => setHoldings(holdings.filter((_, x) => x !== i))}>
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {result && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Total Value" value={fmtMoney(result.metrics.total_value)} />
                <StatCard
                  label="Total P&L"
                  value={fmtMoney(result.metrics.total_pnl)}
                  tone={result.metrics.total_pnl >= 0 ? "bull" : "bear"}
                  sub={`${result.metrics.total_pnl_pct}% overall`}
                />
                <StatCard label="Positions" value={result.metrics.positions} />
                <StatCard
                  label="Concentration (HHI)"
                  value={result.metrics.concentration_hhi}
                  hint="0 = perfectly spread, 1 = single position"
                />
                <StatCard
                  label="Best"
                  value={result.metrics.best?.symbol ?? "—"}
                  tone="bull"
                  sub={result.metrics.best ? `${result.metrics.best.pnl_pct}%` : ""}
                />
                <StatCard
                  label="Worst"
                  value={result.metrics.worst?.symbol ?? "—"}
                  tone="bear"
                  sub={result.metrics.worst ? `${result.metrics.worst.pnl_pct}%` : ""}
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>Holdings (live)</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => analyze()} disabled={analyzing}>
                      <RefreshCw /> Revalue
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Symbol</TableHead>
                          <TableHead>Sector</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                          <TableHead className="text-right">Weight</TableHead>
                          <TableHead className="text-right">P&L</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.holdings.map((h: any) => (
                          <TableRow key={h.symbol}>
                            <TableCell className="font-mono font-medium text-primary">{h.symbol}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{h.sector}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">{h.price}</TableCell>
                            <TableCell className="text-right font-mono">{fmtMoney(h.value)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="h-1.5 w-16 rounded bg-muted">
                                  <div
                                    className="h-full rounded bg-primary"
                                    style={{ width: `${Math.min(100, h.weight_pct)}%` }}
                                  />
                                </div>
                                <span className="font-mono text-xs">{h.weight_pct}%</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div>{fmtMoney(h.pnl)}</div>
                              <Pct value={h.pnl_pct} className="text-xs" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>In Plain Words</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {result.summary.map((s: string, i: number) => (
                        <p key={i} className="text-sm leading-relaxed text-secondary-foreground">
                          {s}
                        </p>
                      ))}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Suggestions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {result.suggestions.map((s: any, i: number) => (
                        <div key={i} className="rounded-md border p-3">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-sm font-medium">{s.title}</span>
                            <Badge variant={SEVERITY_VARIANT[s.severity] ?? "secondary"}>
                              {s.severity}
                            </Badge>
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground">{s.detail}</p>
                        </div>
                      ))}
                      <p className="text-[10px] text-muted-foreground">{result.disclaimer}</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === "journal" && (
        <>
          {closed.length > 0 && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Closed Trades" value={closed.length} sub={`${journal.length - closed.length} open/draft`} />
                <StatCard
                  label="Total P&L"
                  value={fmtMoney(pnls.reduce((a, b) => a + b, 0))}
                  tone={pnls.reduce((a, b) => a + b, 0) >= 0 ? "bull" : "bear"}
                />
                <StatCard label="Win Rate" value={`${((wins.length / Math.max(1, pnls.length)) * 100).toFixed(0)}%`} sub={`${wins.length}W / ${losses.length}L`} />
                <StatCard
                  label="Avg R Multiple"
                  value={rs.length ? `${(rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(2)}R` : "—"}
                  hint="Average profit per unit of planned risk. Above 0.5R with 50% WR compounds."
                />
                <StatCard label="Profit Factor" value={Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "—"} />
                <StatCard
                  label="Best / Worst"
                  value={pnls.length ? `${fmtMoney(Math.max(...pnls))}` : "—"}
                  sub={pnls.length ? fmtMoney(Math.min(...pnls)) : ""}
                />
              </div>

              <div className="mb-4 grid gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <CardHeader>
                    <CardTitle>Cumulative P&L by Trade</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <MultiLineChart
                      height={220}
                      series={[{
                        name: "cum pnl",
                        color: pnls.reduce((a, b) => a + b, 0) >= 0 ? "#2dd4bf" : "#ef5350",
                        area: true,
                        data: journalEquity,
                      }]}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Emotion Analytics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {emotionStats.map(([emo, s]) => (
                      <button
                        key={emo}
                        onClick={() => setEmotionFilter(emotionFilter === emo ? "all" : emo)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md border p-2 text-left transition-colors",
                          emotionFilter === emo ? "border-primary/50 bg-primary/10" : "hover:bg-accent"
                        )}
                      >
                        <span className="text-sm capitalize">{emo}</span>
                        <span className="flex items-center gap-2 text-xs">
                          <Badge variant="secondary">{s.wins}/{s.n} wins</Badge>
                          <span className={cn("font-mono", s.pnl >= 0 ? "text-bull" : "text-bear")}>
                            {fmtMoney(s.pnl)}
                          </span>
                        </span>
                      </button>
                    ))}
                    <p className="pt-1 text-xs text-muted-foreground">
                      If "fomo" trades lose and "calm" trades win — the edge is emotional, not technical.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="size-4 text-primary" /> Log a Trade
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input placeholder="Symbol" value={draft.symbol}
                    onChange={(e) => setDraft({ ...draft, symbol: e.target.value })} />
                  <Select value={draft.direction}
                    onChange={(e) => setDraft({ ...draft, direction: e.target.value as any })}>
                    <option value="long">Long</option>
                    <option value="short">Short</option>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Qty" value={draft.qty}
                    onChange={(e) => setDraft({ ...draft, qty: e.target.value })} />
                  <Input placeholder="Entry" value={draft.entry}
                    onChange={(e) => setDraft({ ...draft, entry: e.target.value })} />
                  <Input placeholder="Exit" value={draft.exit}
                    onChange={(e) => setDraft({ ...draft, exit: e.target.value })} />
                  <Input placeholder="Stop" value={draft.stop}
                    onChange={(e) => setDraft({ ...draft, stop: e.target.value })} />
                  <Input placeholder="Target" value={draft.target}
                    onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
                  <Input placeholder="Fees" value={draft.fees}
                    onChange={(e) => setDraft({ ...draft, fees: e.target.value })} />
                </div>
                <Input placeholder="Setup (e.g. breakout above 200 SMA)" value={draft.setup}
                  onChange={(e) => setDraft({ ...draft, setup: e.target.value })} />
                <Input placeholder="Tags (comma separated: swing, earnings, news)" value={draft.tags}
                  onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
                <Select value={draft.emotion} onChange={(e) => setDraft({ ...draft, emotion: e.target.value })}>
                  <option value="">Emotion…</option>
                  {["calm", "confident", "fomo", "fearful", "revenge", "bored"].map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </Select>
                <Textarea placeholder="Lessons learned…" value={draft.lessons}
                  onChange={(e) => setDraft({ ...draft, lessons: e.target.value })} />
                <Button onClick={addJournal} className="w-full">
                  <Plus /> Add to Journal
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-3 xl:col-span-2">
              {emotionFilter !== "all" && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Filtered by</span>
                  <Badge variant="default">{emotionFilter}</Badge>
                  <button className="text-xs text-primary hover:underline" onClick={() => setEmotionFilter("all")}>
                    clear
                  </button>
                </div>
              )}
              {filteredJournal.length === 0 && (
                <Card>
                  <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                    No trades logged yet. Discipline starts with a written record.
                  </CardContent>
                </Card>
              )}
              {filteredJournal.map((j) => {
                const pnl = tradePnl(j);
                const r = tradeR(j);
                return (
                  <Card key={j.id}>
                    <CardContent className="p-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-primary">{j.symbol}</span>
                          <Badge variant={j.direction === "short" ? "bear" : "bull"}>{j.direction}</Badge>
                          {j.emotion && <Badge variant="secondary">{j.emotion}</Badge>}
                          {j.tags && j.tags.split(",").map((t) => (
                            <Badge key={t} variant="outline">{t.trim()}</Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          {pnl !== null && (
                            <span className={cn("font-mono text-sm font-semibold", pnl >= 0 ? "text-bull" : "text-bear")}>
                              {fmtMoney(pnl)}{r !== null && ` · ${r.toFixed(2)}R`}
                            </span>
                          )}
                          <Button variant="outline" size="sm" onClick={() => review(j)}>
                            <Sparkles /> AI Review
                          </Button>
                          <Button variant="ghost" size="icon"
                            onClick={() => saveJournal(journal.filter((x) => x.id !== j.id))}>
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      <div className="mb-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground md:grid-cols-6">
                        <span>Qty {j.qty || "—"}</span>
                        <span>Entry {j.entry || "—"}</span>
                        <span>Exit {j.exit || "—"}</span>
                        <span>Stop {j.stop || "—"}</span>
                        <span>Target {j.target || "—"}</span>
                        <span>Fees {j.fees || "0"}</span>
                      </div>
                      {j.setup && <p className="text-sm text-secondary-foreground">Setup: {j.setup}</p>}
                      {j.lessons && <p className="text-sm text-muted-foreground">Lesson: {j.lessons}</p>}
                      {j.review && (
                        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                          <Markdown text={j.review} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
