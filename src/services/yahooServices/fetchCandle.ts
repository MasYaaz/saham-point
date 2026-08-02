import { yahooClient } from "../../client/yahooClient";
import type { CandleHistory } from "../../types";

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
 * Helper untuk format timestamp UNIX ke YYYY-MM-DD berbasis Timezone Indonesia (WIB)
 */
function formatLocalDate(ts: number): string {
  const date = new Date(ts * 1000);
  // Menggunakan Intl untuk mengunci timezone WIB/Asia/Jakarta
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date); // Output format: YYYY-MM-DD
}

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

  const seenDates = new Set<string>();

  // 2. Parse, format timezone, dan hilangkan candle invalid/duplikat
  const history: CandleHistory[] = timestamp
    .map((ts, index) => {
      const open = quotes.open?.[index];
      const high = quotes.high?.[index];
      const low = quotes.low?.[index];
      const close = quotes.close?.[index];
      const volume = quotes.volume?.[index] ?? 0;

      // Filter data invalid/kosong/nol
      if (
        typeof open !== "number" ||
        typeof high !== "number" ||
        typeof low !== "number" ||
        typeof close !== "number" ||
        close === 0 ||
        isNaN(close)
      ) {
        return null;
      }

      const dateStr = formatLocalDate(ts);

      // Cek & cegah tanggal duplikat (biasa terjadi pada data intraday/Yahoo glitch)
      if (seenDates.has(dateStr)) {
        return null;
      }
      seenDates.add(dateStr);

      return {
        date: dateStr,
        open,
        high,
        low,
        close,
        volume: typeof volume === "number" && !isNaN(volume) ? volume : 0,
      };
    })
    .filter((item): item is CandleHistory => item !== null);

  // Pastikan urutan kronologis terlama -> terbaru (Oldest -> Newest)
  history.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return { meta, ticker, interval, history };
}
