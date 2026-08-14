"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpDown, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pct } from "@/components/stat-card";
import { Markdown } from "@/lib/markdown";

const WATCHLIST: { symbol: string; market: string }[] = [
  { symbol: "AAPL", market: "stock" },
  { symbol: "NVDA", market: "stock" },
  { symbol: "RELIANCE.NS", market: "stock" },
  { symbol: "TCS.NS", market: "stock" },
  { symbol: "BTC/USDT", market: "crypto" },
  { symbol: "ETH/USDT", market: "crypto" },
  { symbol: "EURUSD", market: "forex" },
  { symbol: "NIFTY50", market: "index" },
];

export default function DashboardPage() {
  const [indices, setIndices] = React.useState<any[]>([]);
  const [brief, setBrief] = React.useState<string>("");
  const [mood, setMood] = React.useState<string>("");
  const [watch, setWatch] = React.useState<any[]>([]);
  const [sortKey, setSortKey] = React.useState<"symbol" | "price" | "change_pct">("change_pct");
  const [sortAsc, setSortAsc] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [idx, br] = await Promise.all([api.indices(), api.brief()]);
      setIndices(idx.indices ?? []);
      setBrief(br.brief ?? "");
      setMood(br.mood ?? "");
      const rows = await Promise.all(
        WATCHLIST.map((w) => api.quote(w.symbol, w.market).catch(() => null))
      );
      setWatch(rows.filter(Boolean));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  const sorted = [...watch].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = typeof av === "string" ? av.localeCompare(bv) : (av ?? 0) - (bv ?? 0);
    return sortAsc ? cmp : -cmp;
  });

  const avg =
    indices.filter((i) => i.change_pct !== null).reduce((s, i) => s + (i.change_pct ?? 0), 0) /
    Math.max(1, indices.filter((i) => i.change_pct !== null).length);

  return (
    <div>
      <PageHeader title="Dashboard" description="Global market radar, breadth and the AI intelligence brief.">
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw /> Refresh
        </Button>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {loading && indices.length === 0
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          : indices.map((idx) => (
              <Link
                key={idx.code}
                href={`/analysis?symbol=${encodeURIComponent(idx.code)}&market=index`}
              >
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{idx.name}</span>
                      <span>{idx.country}</span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="font-mono text-lg font-semibold">
                        {fmtPrice(idx.price)}
                      </span>
                      <Pct value={idx.change_pct} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Watchlist</CardTitle>
            <Badge variant={avg > 0.4 ? "bull" : avg < -0.4 ? "bear" : "secondary"}>
              Breadth {avg >= 0 ? "+" : ""}
              {avg.toFixed(2)}% avg
            </Badge>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {(["symbol", "price", "change_pct"] as const).map((k) => (
                    <TableHead
                      key={k}
                      className="cursor-pointer select-none"
                      onClick={() => {
                        if (sortKey === k) setSortAsc(!sortAsc);
                        else {
                          setSortKey(k);
                          setSortAsc(false);
                        }
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {k === "change_pct" ? "24h %" : k === "price" ? "Price" : "Symbol"}
                        <ArrowUpDown className="size-3" />
                      </span>
                    </TableHead>
                  ))}
                  <TableHead>Day Range</TableHead>
                  <TableHead className="text-right">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((w) => (
                  <TableRow key={`${w.market}:${w.symbol}`}>
                    <TableCell>
                      <Link
                        className="font-mono font-medium text-primary hover:underline"
                        href={`/analysis?symbol=${encodeURIComponent(w.symbol)}&market=${w.market}`}
                      >
                        {w.symbol}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono">{fmtPrice(w.price, w.currency)}</TableCell>
                    <TableCell>
                      <Pct value={w.change_pct} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtPrice(w.low)} — {fmtPrice(w.high)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{w.source}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>AI Market Intelligence Brief</CardTitle>
            {mood && (
              <Badge variant={mood === "risk-on" ? "bull" : mood === "risk-off" ? "bear" : "secondary"}>
                {mood}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {brief ? <Markdown text={brief} /> : <Skeleton className="h-32" />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
