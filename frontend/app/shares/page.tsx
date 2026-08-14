"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { fmtPrice } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pct } from "@/components/stat-card";

const COUNTRIES = ["US", "India", "UK", "Germany", "Japan"];

export default function SharesPage() {
  const router = useRouter();
  const [country, setCountry] = React.useState("India");
  const [indexName, setIndexName] = React.useState<string>("");
  const [stocks, setStocks] = React.useState<any[]>([]);
  const [quotes, setQuotes] = React.useState<Record<string, any>>({});
  const [q, setQ] = React.useState("");
  const [sector, setSector] = React.useState("All");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    setQuotes({});
    api
      .constituents(country)
      .then(async (r) => {
        setIndexName(r.index ?? "");
        setStocks(r.stocks ?? []);
        const symbols = (r.stocks ?? []).map((s: any) => s.symbol);
        // Batch in small groups so one slow quote doesn't block the table.
        for (let i = 0; i < symbols.length; i += 5) {
          const chunk = symbols.slice(i, i + 5);
          const res = await api.quotes(chunk, "stock").catch(() => ({ quotes: [] }));
          setQuotes((prev) => {
            const next = { ...prev };
            for (const qt of res.quotes ?? []) next[qt.symbol] = qt;
            return next;
          });
        }
      })
      .finally(() => setLoading(false));
  }, [country]);

  const sectors = ["All", ...Array.from(new Set(stocks.map((s) => s.sector)))];
  const filtered = stocks.filter(
    (s) =>
      (sector === "All" || s.sector === sector) &&
      (s.symbol.toLowerCase().includes(q.toLowerCase()) ||
        s.name.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div>
      <PageHeader
        title="Shares"
        description="Country → index → constituents, with live prices. Click any row to open full analysis."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {COUNTRIES.map((c) => (
          <button
            key={c}
            onClick={() => setCountry(c)}
            className={
              c === country
                ? "rounded-md bg-primary/15 px-3 py-1.5 text-sm font-medium text-primary"
                : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            }
          >
            {c}
          </button>
        ))}
        {indexName && <Badge variant="secondary">{indexName}</Badge>}
        <div className="ml-auto flex w-full max-w-xs gap-2">
          <Select value={sector} onChange={(e) => setSector(e.target.value)}>
            {sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <Input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6">
              <Skeleton className="h-64" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">24h</TableHead>
                  <TableHead className="text-right">Day Range</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const qt = quotes[s.symbol];
                  return (
                    <TableRow
                      key={s.symbol}
                      className="cursor-pointer"
                      onClick={() =>
                        router.push(`/analysis?symbol=${encodeURIComponent(s.symbol)}&market=stock`)
                      }
                    >
                      <TableCell className="font-mono font-medium text-primary">{s.symbol}</TableCell>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{s.sector}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {qt ? fmtPrice(qt.price, qt.currency) : "…"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Pct value={qt?.change_pct} />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {qt ? `${fmtPrice(qt.low)} — ${fmtPrice(qt.high)}` : "…"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
