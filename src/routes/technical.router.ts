import { Hono } from "hono";
import { fetchYahooCandles } from "../utils/endpoint/fetchYahooCandles";
import { computeTechnicalIndicators } from "../utils/endpoint/technicalIndicator";
export const technicalRouter = new Hono();

// ============================================================================
// ROUTES
// ============================================================================

/**
 * Endpoint NEW: GET /api/technical/:code/indicators
 * Mengembalikan HANYA ringkasan indikator teknikal (hemat payload & token AI)
 * Default range dipasang "1y" agar sampel cukup untuk kalkulasi SMA200 / Ichimoku.
 */
technicalRouter.get("/:code/indicators", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const range = c.req.query("range") ?? "1y";

  try {
    const fetched = await fetchYahooCandles(code, range);
    if (!fetched) {
      return c.json(
        {
          success: false,
          message: `Data teknikal untuk ${code} tidak ditemukan`,
        },
        404,
      );
    }

    const indicators = computeTechnicalIndicators(fetched.history);

    return c.json({
      success: true,
      code,
      meta: {
        symbol: code,
        yahoo_ticker: fetched.ticker,
        range,
        interval: fetched.interval,
        currency: fetched.meta.currency,
        total_bars_analyzed: fetched.history.length,
      },
      indicators,
    });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: "Gagal memproses indikator teknikal",
        error: err.message,
      },
      500,
    );
  }
});

/**
 * Endpoint Existing: GET /api/technical/:code
 * Mengembalikan Data Candlestick OHLCV + Opsional Indikator jika ?indicators=true
 */
technicalRouter.get("/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const range = c.req.query("range") ?? "1mo";
  const calcIndicators = c.req.query("indicators") === "true";

  try {
    const fetched = await fetchYahooCandles(code, range);
    if (!fetched) {
      return c.json(
        {
          success: false,
          message: `Data teknikal untuk ${code} tidak ditemukan`,
        },
        404,
      );
    }

    const summaryIndicators = calcIndicators
      ? computeTechnicalIndicators(fetched.history)
      : undefined;

    return c.json({
      success: true,
      meta: {
        symbol: code,
        yahoo_ticker: fetched.ticker,
        range,
        interval: fetched.interval,
        currency: fetched.meta.currency,
      },
      indicators: summaryIndicators,
      data: fetched.history,
    });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: "Gagal memproses data teknikal",
        error: err.message,
      },
      500,
    );
  }
});
