import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  tone,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "bull" | "bear" | "neutral";
  hint?: string;
}) {
  return (
    <Card title={hint}>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div
          className={cn(
            "mt-1 font-mono text-xl font-semibold",
            tone === "bull" && "text-bull",
            tone === "bear" && "text-bear"
          )}
        >
          {value}
        </div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function Pct({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className={cn("font-mono", value > 0 ? "text-bull" : value < 0 ? "text-bear" : "text-muted-foreground", className)}>
      {value > 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}
