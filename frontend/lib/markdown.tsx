import * as React from "react";

/** Minimal renderer for the assistant's plain-markdown replies. */
export function Markdown({ text }: { text: string }) {
  const inline = (line: string, key: number) => {
    const parts = line.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
    return (
      <React.Fragment key={key}>
        {parts.map((p, i) => {
          if (p.startsWith("**") && p.endsWith("**"))
            return <strong key={i} className="text-foreground">{p.slice(2, -2)}</strong>;
          if (p.startsWith("_") && p.endsWith("_"))
            return <em key={i} className="text-muted-foreground">{p.slice(1, -1)}</em>;
          return <React.Fragment key={i}>{p}</React.Fragment>;
        })}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-secondary-foreground">
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (line.startsWith("### "))
          return (
            <div key={i} className="pt-2 text-xs font-semibold uppercase tracking-wider text-primary">
              {line.slice(4)}
            </div>
          );
        if (line.startsWith("- "))
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
              <span>{inline(line.slice(2), i)}</span>
            </div>
          );
        return <div key={i}>{inline(line, i)}</div>;
      })}
    </div>
  );
}
