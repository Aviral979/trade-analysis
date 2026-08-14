"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Command } from "lucide-react";
import { api } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface SearchHit {
  symbol: string;
  name: string;
  market: string;
  hint: string;
}

export function Topbar() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [status, setStatus] = React.useState<"ok" | "down" | "checking">("checking");

  React.useEffect(() => {
    api.health().then(() => setStatus("ok")).catch(() => setStatus("down"));
    const id = setInterval(() => {
      api.health().then(() => setStatus("ok")).catch(() => setStatus("down"));
    }, 30000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!q.trim()) return setHits([]);
    const id = setTimeout(() => {
      api.searchSymbols(q).then((r) => setHits(r.results ?? [])).catch(() => {});
    }, 200);
    return () => clearTimeout(id);
  }, [q]);

  const go = (h: SearchHit) => {
    setOpen(false);
    setQ("");
    router.push(`/analysis?symbol=${encodeURIComponent(h.symbol)}&market=${h.market}`);
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 px-6 backdrop-blur">
        <button
          onClick={() => setOpen(true)}
          className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search any stock, index, crypto, forex…</span>
          <kbd className="flex items-center gap-1 rounded border bg-muted px-1.5 text-[10px]">
            <Command className="size-3" />K
          </kbd>
        </button>
        <div className="ml-auto flex items-center gap-3">
          <Badge variant={status === "ok" ? "bull" : status === "down" ? "bear" : "secondary"}>
            Engine {status === "ok" ? "Live" : status === "down" ? "Offline" : "…"}
          </Badge>
        </div>
      </header>

      <Dialog open={open} onClose={() => setOpen(false)} className="max-w-xl p-0">
        <div className="border-b p-3">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a symbol or name — RELIANCE, AAPL, BTC, EURUSD, NIFTY…"
            className="border-0 bg-transparent focus-visible:ring-0"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {hits.length === 0 && q && (
            <button
              className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => go({ symbol: q.toUpperCase(), name: q, market: "stock", hint: "direct" })}
            >
              Search live for <span className="font-mono text-primary">{q.toUpperCase()}</span>
            </button>
          )}
          {hits.map((h) => (
            <button
              key={`${h.market}:${h.symbol}`}
              onClick={() => go(h)}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span>
                <span className="font-mono font-medium">{h.symbol}</span>
                <span className="ml-2 text-muted-foreground">{h.name}</span>
              </span>
              <Badge variant="secondary">{h.market}</Badge>
            </button>
          ))}
        </div>
      </Dialog>
    </>
  );
}
