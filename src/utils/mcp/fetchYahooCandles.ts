import type { CandleHistory, YahooChartResponse } from "../../types";

/**
 * Helper: Fetch data dari Yahoo Finance API
 */
export async function fetchYahooCandles(code: string, range: string) {
  const intervalMap: Record<string, string> = {
    "1d": "5m",
    "5d": "15m",
    "1mo": "1d",
    "3mo": "1d",
    "6mo": "1wk",
    "1y": "1wk",
    "2y": "1mo",
    "5y": "1mo",
    "10y": "1mo",
    max: "3mo",
  };
  const interval = intervalMap[range] ?? "1d";
  const ticker = code === "IHSG" ? "^JKSE" : `${code}.JK`;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });

  if (!res.ok) return null;

  const chartData = (await res.json()) as YahooChartResponse;
  const result = chartData.chart?.result?.[0];

  if (!result?.meta || !result?.timestamp || !result?.indicators?.quote?.[0]) {
    return null;
  }

  const { meta, timestamp } = result;
  const quotes = result.indicators.quote[0];

  const history: CandleHistory[] = timestamp.map((ts, index) => ({
    date: new Date(ts * 1000).toISOString().split("T")[0] ?? "",
    open: quotes.open[index] ?? 0,
    high: quotes.high[index] ?? 0,
    low: quotes.low[index] ?? 0,
    close: quotes.close[index] ?? 0,
    volume: quotes.volume?.[index] ?? 0,
  }));

  return { meta, ticker, interval, history };
}
