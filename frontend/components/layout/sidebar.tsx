"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, List, Bitcoin, ArrowRightLeft, Activity, Scale,
  Telescope, FlaskConical, Wallet, Bot, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shares", label: "Shares", icon: List },
  { href: "/crypto", label: "Crypto", icon: Bitcoin },
  { href: "/forex", label: "Forex", icon: ArrowRightLeft },
  { href: "/analysis", label: "Asset Analysis", icon: Activity },
  { href: "/compare", label: "Compare", icon: Scale },
  { href: "/forecast", label: "Forecast Lab", icon: Telescope },
  { href: "/backtest", label: "Strategy & Backtest", icon: FlaskConical },
  { href: "/portfolio", label: "Portfolio & Journal", icon: Wallet },
  { href: "/assistant", label: "AI Assistant", icon: Bot },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-card/60 backdrop-blur">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary/15">
          <Telescope className="size-4 text-primary" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">MarketPilot AI</div>
          <div className="text-[10px] text-muted-foreground">Research Workstation</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3 text-[10px] leading-relaxed text-muted-foreground">
        <Link
          href="/legal"
          className="mb-2 flex items-center gap-1.5 rounded-md px-1 py-1 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <ShieldCheck className="size-3.5" /> Legal & Risk
        </Link>
        Forecasts are probabilistic scenario models for research only. Not financial advice.
      </div>
    </aside>
  );
}
