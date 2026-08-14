export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Point {
  time: number;
  value: number;
}

export function smaPoints(c: Candle[], n: number): Point[] {
  const out: Point[] = [];
  let sum = 0;
  for (let i = 0; i < c.length; i++) {
    sum += c[i].close;
    if (i >= n) sum -= c[i - n].close;
    if (i >= n - 1) out.push({ time: c[i].time, value: sum / n });
  }
  return out;
}

export function emaPoints(c: Candle[], n: number): Point[] {
  if (c.length === 0) return [];
  const k = 2 / (n + 1);
  const out: Point[] = [];
  let prev = c[0].close;
  for (let i = 1; i < c.length; i++) {
    prev = c[i].close * k + prev * (1 - k);
    if (i >= n - 1) out.push({ time: c[i].time, value: prev });
  }
  return out;
}

export function vwapPoints(c: Candle[]): Point[] {
  let pv = 0;
  let vv = 0;
  const out: Point[] = [];
  for (const bar of c) {
    const tp = (bar.high + bar.low + bar.close) / 3;
    if (bar.volume > 0) {
      pv += tp * bar.volume;
      vv += bar.volume;
      out.push({ time: bar.time, value: pv / vv });
    }
  }
  return out;
}

export function bollingerPoints(c: Candle[], n = 20, k = 2): { upper: Point[]; lower: Point[] } {
  const upper: Point[] = [];
  const lower: Point[] = [];
  for (let i = n - 1; i < c.length; i++) {
    let sum = 0;
    let sq = 0;
    for (let j = i - n + 1; j <= i; j++) {
      sum += c[j].close;
      sq += c[j].close * c[j].close;
    }
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
    upper.push({ time: c[i].time, value: mean + k * sd });
    lower.push({ time: c[i].time, value: mean - k * sd });
  }
  return { upper, lower };
}
