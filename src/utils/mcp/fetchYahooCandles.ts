import type { CandleHistory, YahooChartResponse } from "../../types";

/**
 * Helper: Fetch data dari Yahoo Finance API
 */
export async function fetchYahooCandles(code: string, range: string = "3y") {
  const intervalMap: Record<string, string> = {
    "1d": "5m",
    "5d": "15m",
    "1mo": "1d",
    "3mo": "1d",
    "6mo": "1d",
    "1y": "1d",
    "2y": "1d",
    "3y": "1d",
    "5y": "1wk",
    "10y": "1mo",
    max: "1mo",
  };

  const interval = intervalMap[range] ?? "1d";
  const ticker = code === "IHSG" ? "^JKSE" : `${code}.JK`;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) return null;

    const chartData = (await res.json()) as YahooChartResponse;
    const result = chartData.chart?.result?.[0];

    if (
      !result?.meta ||
      !result?.timestamp ||
      !result?.indicators?.quote?.[0]
    ) {
      return null;
    }

    const { meta, timestamp } = result;
    const quotes = result.indicators.quote[0];

    // Filter & Sanitize candle yang null / invalid dari Yahoo
    const history: CandleHistory[] = timestamp
      .map((ts, index) => {
        const open = quotes.open[index];
        const high = quotes.high[index];
        const low = quotes.low[index];
        const close = quotes.close[index];
        const volume = quotes.volume?.[index] ?? 0;

        // Buang data jika ada atribut OHLC yang null/undefined/0
        if (
          open == null ||
          high == null ||
          low == null ||
          close == null ||
          close === 0
        ) {
          return null;
        }

        return {
          date: new Date(ts * 1000).toISOString().split("T")[0] ?? "",
          open,
          high,
          low,
          close,
          volume,
        };
      })
      .filter((item): item is CandleHistory => item !== null);

    return { meta, ticker, interval, history };
  } catch (error) {
    console.error(`Error fetching Yahoo candles for ${code}:`, error);
    return null;
  }
}
