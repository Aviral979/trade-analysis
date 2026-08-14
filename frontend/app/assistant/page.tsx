"use client";

import * as React from "react";
import { Bot, Send, FileJson, User, Briefcase } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  text: string;
  evidence?: { label: string; value: any }[];
  symbol?: string;
  market?: string;
}

const SUGGESTED = [
  "Detailed analysis of RELIANCE.NS",
  "How is BTC/USDT looking?",
  "Global market brief",
  "Should I buy TCS.NS?",
  "NIFTY50 3M scenario outlook",
  "What needs attention in my portfolio?",
];

export default function AssistantPage() {
  const [messages, setMessages] = React.useState<Msg[]>([
    {
      role: "assistant",
      text: "I'm your research assistant. Every answer is sectioned — **Trend & Momentum**, **Volatility & Risk**, **Key Levels**, **Patterns**, and a **3M Scenario Outlook** with invalidation levels.\n\nEvery number comes from the deterministic engines, with evidence chips under each answer. Attach your portfolio and I'll review that too.",
    },
  ]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [attachPortfolio, setAttachPortfolio] = React.useState(false);
  const [holdingsCount, setHoldingsCount] = React.useState(0);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem("mp_holdings") ?? "[]");
      setHoldingsCount(h.length);
    } catch {}
  }, []);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      let holdings: any[] | undefined;
      if (attachPortfolio) {
        try {
          const h = JSON.parse(localStorage.getItem("mp_holdings") ?? "[]");
          if (h.length) holdings = h;
        } catch {}
      }
      const r = await api.chat(text, undefined, undefined, holdings);
      setMessages((m) => [
        ...m,
        { role: "assistant", text: r.reply, evidence: r.evidence, symbol: r.symbol, market: r.market },
      ]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `Engine unreachable — is the backend running on port 8000? (${e?.message ?? "error"})` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const downloadReport = async (msg: Msg) => {
    if (!msg.symbol) return;
    const r = await api.report(msg.symbol, msg.market ?? "stock");
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marketpilot-report-${msg.symbol.replace(/[/.]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <PageHeader
        title="AI Assistant"
        description="Evidence-backed research chat — sectioned deep analysis, never invented numbers."
      >
        <button
          onClick={() => setAttachPortfolio(!attachPortfolio)}
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
            attachPortfolio ? "border-primary/50 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
          )}
          title="Include your analyzed portfolio as context"
        >
          <Briefcase className="size-4" />
          Portfolio context {holdingsCount > 0 ? `(${holdingsCount})` : "(none saved)"}
        </button>
      </PageHeader>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardContent className="flex min-h-0 flex-1 flex-col p-4">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
                {m.role === "assistant" && (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15">
                    <Bot className="size-4 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[78%] rounded-lg border p-3",
                    m.role === "user" ? "bg-primary/10" : "bg-muted/50"
                  )}
                >
                  <Markdown text={m.text} />
                  {m.evidence && m.evidence.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Evidence
                      </span>
                      {m.evidence.map((e, j) => (
                        <Badge key={j} variant="secondary" className="font-mono">
                          {e.label}: {String(e.value)}
                        </Badge>
                      ))}
                      {m.symbol && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-7 text-xs"
                          onClick={() => downloadReport(m)}
                        >
                          <FileJson /> 1-Click Report
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">
                    <User className="size-4" />
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex gap-3">
                <div className="flex size-8 items-center justify-center rounded-md bg-primary/15">
                  <Bot className="size-4 animate-pulse text-primary" />
                </div>
                <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
                  Pulling live data, running indicators and scenario models…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                {s}
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask about any symbol — 'Detailed analysis of TCS.NS', 'BTC/USDT', 'market brief'…"
            />
            <Button onClick={() => send()} disabled={busy}>
              <Send />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
