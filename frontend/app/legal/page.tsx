"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";

const SECTIONS: Record<string, { title: string; body: string[] }> = {
  disclaimer: {
    title: "Risk Disclaimer",
    body: [
      "MarketPilot AI is a research and education workstation. Nothing on this platform — including prices, indicators, forecasts, scenario bands, backtests, AI-generated explanations, suggestions, or portfolio commentary — constitutes financial advice, investment advice, trading advice, or a recommendation to buy or sell any security, cryptocurrency, or financial instrument.",
      "All forecasts are probabilistic scenario models. They describe ranges of plausible outcomes with explicit uncertainty labels — they are not predictions of the future, and they are never promises of returns. Historical validation metrics (hit rate, directional accuracy, MAE, RMSE) describe how the model behaved on past data only; past performance does not guarantee future results.",
      "Trading and investing involve substantial risk of loss. Leveraged instruments, derivatives, and cryptoassets can result in losses exceeding your initial capital. You are solely responsible for every decision you make. Consult a SEBI-registered investment adviser (or the equivalent licensed professional in your jurisdiction) before acting on any information.",
      "Market data is provided by third-party sources (Yahoo Finance via yfinance, crypto exchanges via CCXT, CoinGecko) and may be delayed, inaccurate, or unavailable. When live data is unavailable, the interface may display clearly-labeled synthetic fallback data (source: mock) — never trade from it.",
    ],
  },
  terms: {
    title: "Terms of Use",
    body: [
      "By using MarketPilot AI you accept these terms. The software is provided \"as is\", without warranty of any kind, express or implied, including fitness for a particular purpose.",
      "You agree to use the platform for lawful research and educational purposes only, and to comply with the terms of the underlying market-data providers (Yahoo Finance, CoinGecko, and each connected exchange). Redistribution or commercial use of provider data may require separate licensing — check provider terms.",
      "The maintainers are not liable for any direct, indirect, incidental, or consequential damages — including trading losses — arising from the use of, or inability to use, this software or any data it displays.",
      "Backtests are simulations with simplifying assumptions (next-bar-open execution, configurable commission, no slippage or market impact). Real-world results will differ.",
    ],
  },
  privacy: {
    title: "Privacy",
    body: [
      "MarketPilot AI runs locally on your machine. Your portfolio uploads, trade journal entries, and chat messages are processed by your own backend instance and stored only in your browser's localStorage — nothing is transmitted to or stored on any third-party server operated by this project.",
      "Requests for market data go directly from your machine to the data providers (Yahoo Finance, exchanges, CoinGecko); those providers see your IP address per their own privacy policies.",
      "If you configure an optional LLM provider (MP_LLM_PROVIDER / MP_LLM_API_KEY), chat evidence packs are sent to that provider for phrasing. Do not configure this if you do not want analysis text leaving your machine.",
      "You can wipe all local data at any time by clearing your browser's site data.",
    ],
  },
};

export default function LegalPage() {
  const [tab, setTab] = React.useState("disclaimer");
  const s = SECTIONS[tab];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Legal & Risk" description="Read these before trusting any number on this terminal.">
        <Tabs
          tabs={[
            { id: "disclaimer", label: "Risk Disclaimer" },
            { id: "terms", label: "Terms of Use" },
            { id: "privacy", label: "Privacy" },
          ]}
          active={tab}
          onChange={setTab}
        />
      </PageHeader>
      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          {s.body.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed text-secondary-foreground">
              {p}
            </p>
          ))}
          <p className="border-t pt-4 text-xs text-muted-foreground">
            Last updated: August 2026 · MarketPilot AI v1.0
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
