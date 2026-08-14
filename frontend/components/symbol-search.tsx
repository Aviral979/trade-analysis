"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Hit {
  symbol: string;
  name: string;
  market: string;
  hint: string;
}

export function SymbolSearch({
  onSelect,
  placeholder = "Search symbol…",
  className,
}: {
  onSelect: (symbol: string, market: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<Hit[]>([]);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  React.useEffect(() => {
    if (!q.trim()) return setHits([]);
    const id = setTimeout(() => {
      api.searchSymbols(q).then((r) => setHits(r.results ?? [])).catch(() => {});
    }, 200);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              if (hits.length > 0) onSelect(hits[0].symbol, hits[0].market);
              else onSelect(q.trim().toUpperCase(), "stock");
              setOpen(false);
              setQ("");
            }
          }}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
      {open && (hits.length > 0 || q.trim()) && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
          {hits.map((h) => (
            <button
              key={`${h.market}:${h.symbol}`}
              className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                onSelect(h.symbol, h.market);
                setOpen(false);
                setQ("");
              }}
            >
              <span>
                <span className="font-mono font-medium">{h.symbol}</span>
                <span className="ml-2 text-muted-foreground">{h.name}</span>
              </span>
              <Badge variant="secondary">{h.market}</Badge>
            </button>
          ))}
          {q.trim() && (
            <button
              className="w-full rounded px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
              onClick={() => {
                onSelect(q.trim().toUpperCase(), "stock");
                setOpen(false);
                setQ("");
              }}
            >
              Use live lookup for <span className="font-mono text-primary">{q.trim().toUpperCase()}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
