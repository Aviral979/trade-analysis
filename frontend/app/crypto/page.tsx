"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { fmtCompact, fmtPrice } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard, Pct } from "@/components/stat-card";

const EXCHANGES = ["binance", "bybit", "coinbase", "okx"];

export default function CryptoPage() {
  const router = useRouter();
  const [exchange, setExchange] = React.useState("binance");
  const [tickers, setTickers] = React.useState<any[]>([]);
  const [dominance, setDominance] = React.useState<any>(null);
  const [fundingBtc, setFundingBtc] = React.useState<any>(null);
  const [oiBtc, setOiBtc] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);
  const [tickersError, setTickersError] = React.useState<string | null>(null);

  const loadTickers = React.useCallback(async (ex: string) => {
    try {
      const t = await api.cryptoTickers(ex);
      setTickers(t.tickers ?? []);
      setTickersError(null);
    } catch (e: any) {
      setTickersError(e?.message ?? "Failed to load tickers");
    } finally {
      setLoading(false);
      setUpdatedAt(new Date());
    }
  }, []);

  const loadCards = React.useCallback(async (ex: string) => {
    api.cryptoDominance().then(setDominance).catch(() => {});
    api.cryptoFunding("BTC/USDT", ex).then(setFundingBtc).catch(() => {});
    api.cryptoOpenInterest("BTC/USDT", ex).then(setOiBtc).catch(() => {});
  }, []);

  React.useEffect(() => {
    setLoading(true);
    setTickers([]);
    loadTickers(exchange);
    loadCards(exchange);
    const id = setInterval(() => loadTickers(exchange), 30000); // live, no refresh needed
    return () => clearInterval(id);
  }, [exchange, loadTickers, loadCards]);

  return (
    <div>
      <PageHeader title="Crypto" description="Unified spot data across 100+ exchanges via CCXT — auto-refreshes every 30s.">
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bull opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-bull" />
              </span>
              Live · {updatedAt.toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => loadTickers(exchange)}>
            <RefreshCw /> Refresh
          </Button>
          <div className="w-40">
            <Select value={exchange} onChange={(e) => setExchange(e.target.value)}>
              {EXCHANGES.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </Select>
          </div>
        </div>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="BTC Dominance"
          value={dominance?.btc != null ? `${dominance.btc}%` : "—"}
          sub={dominance?.eth != null ? `ETH ${dominance.eth}%` : dominance?.source}
          hint="Share of total crypto market cap (CoinGecko)"
        />
        <StatCard
          label="BTC Funding Rate"
          value={fundingBtc?.funding_rate != null ? `${(fundingBtc.funding_rate * 100).toFixed(4)}%` : "N/A"}
          tone={fundingBtc?.funding_rate > 0 ? "bull" : fundingBtc?.funding_rate < 0 ? "bear" : "neutral"}
          sub={fundingBtc?.funding_rate != null ? "perpetual swap" : "restricted on this exchange"}
          hint="Positive funding = longs pay shorts (crowded long)"
        />
        <StatCard
          label="BTC Open Interest"
          value={oiBtc?.open_interest != null ? fmtCompact(oiBtc.open_interest) : "N/A"}
          sub={oiBtc?.open_interest != null ? "contracts outstanding" : "restricted on this exchange"}
        />
        <StatCard label="Venue" value={exchange} sub="spot markets" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Major Pairs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && tickers.length === 0 ? (
            <div className="p-6">
              <Skeleton className="h-64" />
            </div>
          ) : tickersError && tickers.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 p-6 text-sm">
              <span className="text-bear">{tickersError}</span>
              <Button variant="outline" size="sm" onClick={() => loadTickers(exchange)}>
                Try again
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pair</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">24h %</TableHead>
                  <TableHead className="text-right">24h Volume</TableHead>
                  <TableHead className="text-right">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickers.map((t) => (
                  <TableRow
                    key={t.symbol}
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(`/analysis?symbol=${encodeURIComponent(t.symbol)}&market=crypto&exchange=${exchange}`)
                    }
                  >
                    <TableCell className="font-mono font-medium text-primary">{t.symbol}</TableCell>
                    <TableCell className="text-right font-mono">{fmtPrice(t.price)}</TableCell>
                    <TableCell className="text-right">
                      <Pct value={t.change_pct} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {fmtCompact(t.volume)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{t.source}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
