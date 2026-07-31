import { yahooClient } from "../client/yahooClient";
import type { CandleHistory } from "../types";

const INTERVAL_MAP: Record<string, string> = {
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

/**
 * Fetch dan transformasi data candle sejarah harga dari Yahoo Finance.
 */
export async function fetchYahooCandles(code: string, range: string = "3y") {
  const cleanCode = code.trim().toUpperCase();
  const interval = INTERVAL_MAP[range] ?? "1d";
  const ticker = cleanCode === "IHSG" ? "^JKSE" : `${cleanCode}.JK`;

  // 1. Ambil data mentah dari YahooClient
  const chartData = await yahooClient.getChart(ticker, range, interval);
  const result = chartData?.chart?.result?.[0];

  if (!result?.meta || !result?.timestamp || !result?.indicators?.quote?.[0]) {
    return null;
  }

  const { meta, timestamp } = result;
  const quotes = result.indicators.quote[0];

  // 2. Parse, format, dan bersihkan candle invalid
  const history: CandleHistory[] = timestamp
    .map((ts, index) => {
      const open = quotes.open[index];
      const high = quotes.high[index];
      const low = quotes.low[index];
      const close = quotes.close[index];
      const volume = quotes.volume?.[index] ?? 0;

      // Filter candle kosong/nol
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
}
