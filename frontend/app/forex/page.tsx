"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pct } from "@/components/stat-card";
import { cn } from "@/lib/utils";

const SESSIONS = [
  { name: "Sydney", open: 21, close: 6 },
  { name: "Tokyo", open: 0, close: 9 },
  { name: "London", open: 8, close: 17 },
  { name: "New York", open: 13, close: 22 },
];

function sessionOpen(s: { open: number; close: number }, utcHour: number) {
  return s.open < s.close
    ? utcHour >= s.open && utcHour < s.close
    : utcHour >= s.open || utcHour < s.close;
}

export default function ForexPage() {
  const router = useRouter();
  const [pairs, setPairs] = React.useState<any[]>([]);
  const [strength, setStrength] = React.useState<any[]>([]);
  const [quotes, setQuotes] = React.useState<Record<string, any>>({});
  const [q, setQ] = React.useState("");
  const [now, setNow] = React.useState(new Date());

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    api.forexPairs().then((r) => setPairs(r.pairs ?? []));
    api.forexStrength().then((r) => setStrength(r.strength ?? []));
  }, []);

  React.useEffect(() => {
    for (const p of pairs) {
      api.quote(p.symbol, "forex").then((qt) =>
        setQuotes((prev) => ({ ...prev, [p.symbol]: qt }))
      ).catch(() => {});
    }
  }, [pairs]);

  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;

  const currencyScore: Record<string, number[]> = {};
  for (const s of strength) {
    (currencyScore[s.base] ??= []).push(s.strength_base);
    (currencyScore[s.quote] ??= []).push(s.strength_quote);
  }
  const meter = Object.entries(currencyScore)
    .map(([ccy, arr]) => ({ ccy, score: arr.reduce((a, b) => a + b, 0) / arr.length }))
    .sort((a, b) => b.score - a.score);
  const maxAbs = Math.max(0.01, ...meter.map((m) => Math.abs(m.score)));

  const filtered = pairs.filter(
    (p) =>
      p.symbol.toLowerCase().includes(q.toLowerCase()) ||
      p.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="Forex" description="Currency strength, pair heatmap and global session clock." />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Currency Strength (24h)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {meter.length === 0 && <Skeleton className="h-40" />}
            {meter.map((m) => (
              <div key={m.ccy} className="flex items-center gap-2">
                <span className="w-10 font-mono text-xs">{m.ccy}</span>
                <div className="relative h-4 flex-1 rounded bg-muted">
                  <div
                    className={cn(
                      "absolute top-0 h-full rounded",
                      m.score >= 0 ? "left-1/2 bg-bull" : "right-1/2 bg-bear"
                    )}
                    style={{ width: `${(Math.abs(m.score) / maxAbs) * 50}%` }}
                  />
                </div>
                <Pct value={m.score} className="w-16 text-right text-xs" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trading Sessions (UTC {now.getUTCHours().toString().padStart(2, "0")}:
              {now.getUTCMinutes().toString().padStart(2, "0")})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {SESSIONS.map((s) => {
              const open = sessionOpen(s, utcHour);
              return (
                <div key={s.name} className="flex items-center justify-between">
                  <span className="text-sm">{s.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {s.open}:00–{s.close}:00
                    </span>
                    <Badge variant={open ? "bull" : "secondary"}>{open ? "Open" : "Closed"}</Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pair Heatmap</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-1.5">
              {strength.map((s) => {
                const v = s.change_pct ?? 0;
                const intensity = Math.min(1, Math.abs(v) / 1.2);
                return (
                  <button
                    key={s.pair}
                    onClick={() =>
                      router.push(`/analysis?symbol=${s.pair}&market=forex`)
                    }
                    className="rounded-md p-2 text-center transition-transform hover:scale-105"
                    style={{
                      backgroundColor:
                        v >= 0
                          ? `rgba(38, 166, 154, ${0.12 + intensity * 0.5})`
                          : `rgba(239, 83, 80, ${0.12 + intensity * 0.5})`,
                    }}
                  >
                    <div className="font-mono text-xs font-medium">{s.pair}</div>
                    <div className={cn("text-xs", v >= 0 ? "text-bull" : "text-bear")}>
                      {v >= 0 ? "+" : ""}
                      {v.toFixed(2)}%
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>All Pairs</CardTitle>
          <div className="w-56">
            <Input placeholder="Search pairs…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pair</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Group</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">24h</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow
                  key={p.symbol}
                  className="cursor-pointer"
                  onClick={() => router.push(`/analysis?symbol=${p.symbol}&market=forex`)}
                >
                  <TableCell className="font-mono font-medium text-primary">{p.symbol}</TableCell>
                  <TableCell className="text-muted-foreground">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.group}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {quotes[p.symbol]?.price ?? "…"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Pct value={quotes[p.symbol]?.change_pct} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
