import db from "../db";
import { tradingViewClient } from "../client/tradingViewClient";
import type { EmitenItem } from "../types";

// ============================================================================
// CONFIGURATION & COLUMNS
// ============================================================================

/** Kolom ringan khusus update harga real-time */
const PRICE_COLUMNS = [
  "close", // 0: last_price
  "change_abs", // 1: change_abs (untuk previous_close)
  "high", // 2: day_high
  "low", // 3: day_low
] as const;

/** Kolom lengkap untuk profil, rasio fundamental, & harga */
const FULL_COLUMNS = [
  "close", // 0: last_price
  "change_abs", // 1: change_abs
  "high", // 2: day_high
  "low", // 3: day_low
  "price_book_fq", // 4: pbv
  "price_earnings_ttm", // 5: per
  "return_on_equity_fq", // 6: roe
  "debt_to_equity_fq", // 7: der
  "beta_1_year", // 8: beta
  "description", // 9: description
  "market_cap_basic", // 10: market_cap
  "dps_common_stock_prim_issue_fy", // 11: dividend
] as const;

// ============================================================================
// HELPER
// ============================================================================

function getJakartaNowString(): string {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  )
    .toISOString()
    .replace("T", " ")
    .substring(0, 19);
}

function buildTickerMap(items: EmitenItem[]) {
  const tickerMap = new Map<string, EmitenItem>();
  const tickers: string[] = [];

  for (const item of items) {
    const tvTicker =
      item.code.toUpperCase() === "IHSG"
        ? "IDX:COMPOSITE"
        : `IDX:${item.code.toUpperCase()}`;
    tickerMap.set(tvTicker, item);
    tickers.push(tvTicker);
  }

  return { tickerMap, tickers };
}

// ============================================================================
// 1. FAST PRICE SYNC (UNTUK CRON WORKER 1 MENIT)
// ============================================================================

/**
 * Mengambil HANYA harga pasar real-time (last_price, previous_close, high, low).
 * Didesain sangat ringan dan cepat untuk dieksekusi berkala oleh background worker.
 */
export async function fetchPriceTradingView(
  items: EmitenItem[],
): Promise<{ successCount: number; failCount: number }> {
  if (items.length === 0) return { successCount: 0, failCount: 0 };

  const nowStr = getJakartaNowString();
  const { tickerMap, tickers } = buildTickerMap(items);

  try {
    const body = await tradingViewClient.scanIndonesia(
      tickers,
      PRICE_COLUMNS as any,
    );
    const rows = body?.data ?? [];

    let successCount = 0;
    let failCount = 0;

    const updateSuccessStmt = db.prepare(`
      UPDATE emiten
      SET
        last_price = $last_price,
        previous_close = $previous_close,
        day_high = $day_high,
        day_low = $day_low,
        dividend_yield = CASE
          WHEN dividend IS NOT NULL AND dividend > 0 AND $last_price > 0
          THEN ROUND((dividend / $last_price) * 100, 2)
          ELSE dividend_yield
        END,
        price_updated_at = $now
      WHERE id = $id
    `);

    const updateFailedStmt = db.prepare(`
      UPDATE emiten SET price_updated_at = $now WHERE id = $id
    `);

    const processedIds = new Set<number>();

    const runUpdates = db.transaction(() => {
      for (const row of rows) {
        const item = tickerMap.get(row.s);
        if (!item) continue;

        processedIds.add(item.id);
        const d = row.d;

        const lastPrice = parseFloat(d[0] ?? 0);
        const changeAbs = parseFloat(d[1] ?? 0);
        const dayHigh = parseFloat(d[2] ?? lastPrice);
        const dayLow = parseFloat(d[3] ?? lastPrice);

        if (lastPrice > 0) {
          updateSuccessStmt.run({
            $last_price: lastPrice,
            $previous_close: lastPrice - changeAbs,
            $day_high: dayHigh,
            $day_low: dayLow,
            $now: nowStr,
            $id: item.id,
          });
          successCount++;
        } else {
          updateFailedStmt.run({ $now: nowStr, $id: item.id });
          failCount++;
        }
      }

      for (const item of items) {
        if (!processedIds.has(item.id)) {
          updateFailedStmt.run({ $now: nowStr, $id: item.id });
          failCount++;
        }
      }
    });

    runUpdates();
    return { successCount, failCount };
  } catch (error) {
    const updateFailedStmt = db.prepare(
      `UPDATE emiten SET price_updated_at = ? WHERE id = ?`,
    );
    const markAllFailed = db.transaction(() => {
      for (const item of items) {
        updateFailedStmt.run(nowStr, item.id);
      }
    });
    markAllFailed();

    return { successCount: 0, failCount: items.length };
  }
}

// ============================================================================
// 2. FULL MARKET DATA SYNC (BERKALA / MANUAL SYNC)
// ============================================================================

/**
 * Mengambil SELURUH data pasar, profil perusahaan, market cap, dividen, dan rasio fundamental ringkas.
 * Dijalankan berkala atau saat melakukan sinkronisasi data menyeluruh.
 */
export async function fetchFullMarketDataTradingView(
  items: EmitenItem[],
): Promise<{ successCount: number; failCount: number }> {
  if (items.length === 0) return { successCount: 0, failCount: 0 };

  const nowStr = getJakartaNowString();
  const { tickerMap, tickers } = buildTickerMap(items);

  try {
    const body = await tradingViewClient.scanIndonesia(
      tickers,
      FULL_COLUMNS as any,
    );
    const rows = body?.data ?? [];

    let successCount = 0;
    let failCount = 0;

    const updateSuccessStmt = db.prepare(`
      UPDATE emiten
      SET
        last_price = $last_price,
        previous_close = $previous_close,
        day_high = $day_high,
        day_low = $day_low,
        pbv = COALESCE($pbv, pbv),
        per = COALESCE($per, per),
        roe = COALESCE($roe, roe),
        der = COALESCE($der, der),
        beta = COALESCE($beta, beta),
        description = CASE WHEN description = '' OR description IS NULL THEN $description ELSE description END,
        market_cap = COALESCE($market_cap, market_cap),
        dividend = COALESCE($dividend, dividend),
        dividend_yield = COALESCE($dividend_yield, dividend_yield),
        is_profile_complete = 1,
        price_updated_at = $now,
        fundamental_updated_at = $now
      WHERE id = $id
    `);

    const updateFailedStmt = db.prepare(`
      UPDATE emiten SET price_updated_at = $now WHERE id = $id
    `);

    const processedIds = new Set<number>();

    const runUpdates = db.transaction(() => {
      for (const row of rows) {
        const item = tickerMap.get(row.s);
        if (!item) continue;

        processedIds.add(item.id);
        const d = row.d;

        const lastPrice = parseFloat(d[0] ?? 0);
        const changeAbs = parseFloat(d[1] ?? 0);
        const dayHigh = parseFloat(d[2] ?? lastPrice);
        const dayLow = parseFloat(d[3] ?? lastPrice);

        if (lastPrice > 0) {
          const previousClose = lastPrice - changeAbs;
          const rawMarketCap = d[10] !== null ? parseFloat(d[10]) : null;
          const rawDividend = d[11] !== null ? parseFloat(d[11]) : null;

          let dividendYield: number | null = null;
          if (rawDividend && rawDividend > 0 && lastPrice > 0) {
            dividendYield = Number(
              ((rawDividend / lastPrice) * 100).toFixed(2),
            );
          }

          updateSuccessStmt.run({
            $last_price: lastPrice,
            $previous_close: previousClose,
            $day_high: dayHigh,
            $day_low: dayLow,
            $pbv: d[4] !== null ? parseFloat(d[4]) : null,
            $per: d[5] !== null ? parseFloat(d[5]) : null,
            $roe: d[6] !== null ? parseFloat(d[6]) : null,
            $der: d[7] !== null ? parseFloat(d[7]) : null,
            $beta: d[8] !== null ? parseFloat(d[8]) : null,
            $description: d[9] || "",
            $market_cap: rawMarketCap,
            $dividend: rawDividend,
            $dividend_yield: dividendYield,
            $now: nowStr,
            $id: item.id,
          });
          successCount++;
        } else {
          updateFailedStmt.run({ $now: nowStr, $id: item.id });
          failCount++;
        }
      }

      for (const item of items) {
        if (!processedIds.has(item.id)) {
          updateFailedStmt.run({ $now: nowStr, $id: item.id });
          failCount++;
        }
      }
    });

    runUpdates();
    return { successCount, failCount };
  } catch (error) {
    const updateFailedStmt = db.prepare(
      `UPDATE emiten SET price_updated_at = ? WHERE id = ?`,
    );
    const markAllFailed = db.transaction(() => {
      for (const item of items) {
        updateFailedStmt.run(nowStr, item.id);
      }
    });
    markAllFailed();

    return { successCount: 0, failCount: items.length };
  }
}
