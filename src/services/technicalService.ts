import { fetchYahooCandles } from "./yahooService";
import { computeTechnicalIndicators } from "../utils/mcp/technicalIndicator";

/**
 * Mengambil ringkasan indikator teknikal beserta status evaluasinya
 */
export async function getTechnicalIndicators(
  code: string,
  range: string = "3y",
) {
  const formattedCode = code.toUpperCase();
  const fetched = await fetchYahooCandles(formattedCode, range);

  if (!fetched) return null;

  const indicators = computeTechnicalIndicators(fetched.history);

  return {
    code: formattedCode,
    meta: {
      symbol: formattedCode,
      yahoo_ticker: fetched.ticker,
      range,
      interval: fetched.interval,
      currency: fetched.meta.currency,
      total_bars_analyzed: fetched.history.length,
    },
    indicators,
  };
}

/**
 * Mengambil data candlestick OHLCV lengkap beserta opsional indikator
 */
export async function getTechnicalData(
  code: string,
  range: string = "1mo",
  calcIndicators: boolean = false,
) {
  const formattedCode = code.toUpperCase();
  const fetched = await fetchYahooCandles(formattedCode, range);

  if (!fetched) return null;

  const summaryIndicators = calcIndicators
    ? computeTechnicalIndicators(fetched.history)
    : undefined;

  return {
    meta: {
      symbol: formattedCode,
      yahoo_ticker: fetched.ticker,
      range,
      interval: fetched.interval,
      currency: fetched.meta.currency,
    },
    indicators: summaryIndicators,
    data: fetched.history,
  };
}
