import db from "../db";
import type { EmitenDbRow, GorenganSuspect } from "../types";
import { safeLog } from "../utils/safeLog";
import { promisePool } from "../utils/mcp/promisePool"; // Dipindah ke helper terpisah
import { getActiveUmaStocks } from "./idxServices/getUMAService";
import { fetchYahooCandles } from "./yahooServices/fetchCandle";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ScreenerUndervaluedParams {
  maxPbv?: number;
  minRoe?: number;
  maxDer?: number;
  limit?: number;
}

export interface ScreenerMarketCapParams {
  minMarketCap?: number;
  maxMarketCap?: number | null;
  sort?: "asc" | "desc" | string;
  limit?: number;
}

export interface ScreenerTechnicalParams {
  strategy?: "breakout" | "reversal" | "volatile" | string;
  limit?: number;
}

export interface ScreenerDividendParams {
  minYield?: number;
  limit?: number;
}

interface CandidateStock {
  code: string;
  name: string;
  sector: string;
  last_price: number;
  market_cap: number | null;
  per: number | null;
  pbv: number | null;
  roe: number | null;
  isUma: boolean;
  umaTitle?: string;
}

// ============================================================================
// LOCAL DATABASE SCREENERS (FAST / SYNCHRONOUS)
// ============================================================================

export function getUndervaluedStocks({
  maxPbv = 1.5,
  minRoe = 10.0,
  maxDer = 2.0,
  limit = 50,
}: ScreenerUndervaluedParams = {}) {
  const result = db
    .query(
      `SELECT code, name, sector, last_price, market_cap, pbv, per, roe, der, dividend_yield
       FROM emiten
       WHERE pbv IS NOT NULL AND pbv > 0 AND pbv <= ?
         AND roe IS NOT NULL AND roe >= ?
         AND der IS NOT NULL AND der <= ?
         AND per IS NOT NULL AND per > 0
       ORDER BY roe DESC, pbv ASC LIMIT ?`,
    )
    .all(maxPbv, minRoe, maxDer, limit) as EmitenDbRow[];

  return {
    filter_applied: {
      max_pbv: maxPbv,
      min_roe: minRoe,
      max_der: maxDer,
      limit,
    },
    count: result.length,
    data: result,
  };
}

export function getMarketCapStocks({
  minMarketCap = 0,
  maxMarketCap = null,
  sort = "desc",
  limit = 25,
}: ScreenerMarketCapParams = {}) {
  const sortDirection = sort.toLowerCase() === "asc" ? "ASC" : "DESC";
  const validMinCap = isNaN(minMarketCap) ? 0 : minMarketCap;

  let queryStr = `
    SELECT code, name, sector, last_price, market_cap, pbv, per, roe, der, dividend_yield
    FROM emiten
    WHERE market_cap IS NOT NULL AND market_cap >= ?
  `;
  const params: any[] = [validMinCap];

  if (maxMarketCap !== null && !isNaN(maxMarketCap)) {
    queryStr += ` AND market_cap <= ?`;
    params.push(maxMarketCap);
  }

  queryStr += ` ORDER BY market_cap ${sortDirection} LIMIT ?`;
  params.push(limit);

  const result = db.query(queryStr).all(...params) as EmitenDbRow[];

  return {
    filter_applied: {
      min_market_cap: validMinCap,
      max_market_cap: maxMarketCap,
      sort: sortDirection.toLowerCase(),
      limit,
    },
    count: result.length,
    data: result,
  };
}

export function getTechnicalScreener({
  strategy = "breakout",
  limit = 30,
}: ScreenerTechnicalParams = {}) {
  let queryStr = "";

  if (strategy === "reversal") {
    queryStr = `
      SELECT code, name, sector, last_price, previous_close, day_high, day_low, beta FROM emiten
      WHERE last_price > previous_close AND day_low >= previous_close AND previous_close > 0
      ORDER BY (last_price - previous_close) / previous_close DESC LIMIT ?`;
  } else if (strategy === "volatile") {
    queryStr = `
      SELECT code, name, sector, last_price, previous_close, day_high, day_low, beta FROM emiten
      WHERE day_high > day_low AND beta >= 1.2
      ORDER BY (day_high - day_low) / day_low DESC LIMIT ?`;
  } else {
    queryStr = `
      SELECT code, name, sector, last_price, previous_close, day_high, day_low, beta FROM emiten
      WHERE last_price >= day_high AND last_price > previous_close AND previous_close > 0
      ORDER BY (last_price - previous_close) / previous_close DESC LIMIT ?`;
  }

  const result = db.query(queryStr).all(limit) as EmitenDbRow[];

  const formattedResult = result.map((row) => {
    const changePercent =
      row.previous_close && row.last_price
        ? ((row.last_price - row.previous_close) / row.previous_close) * 100
        : 0;
    const dayRangePercent =
      row.day_low && row.day_high
        ? ((row.day_high - row.day_low) / row.day_low) * 100
        : 0;
    return {
      ...row,
      daily_change_percent: parseFloat(changePercent.toFixed(2)),
      day_range_percent: parseFloat(dayRangePercent.toFixed(2)),
    };
  });

  return {
    strategy_applied: strategy,
    limit_applied: limit,
    count: formattedResult.length,
    data: formattedResult,
  };
}

export function getDividendHunters({
  minYield = 5.0,
  limit = 30,
}: ScreenerDividendParams = {}) {
  const result = db
    .query(
      `SELECT code, name, sector, last_price, market_cap, pbv, per, der, dividend_yield
       FROM emiten
       WHERE dividend_yield >= ? AND der <= 1.5 AND market_cap > 0
       ORDER BY dividend_yield DESC LIMIT ?`,
    )
    .all(minYield, limit) as EmitenDbRow[];

  return {
    filter_applied: { min_dividend_yield: minYield, limit },
    count: result.length,
    data: result,
  };
}

export function getCashRichStocks(limit: number = 25) {
  const result = db
    .query(
      `SELECT e.code, e.name, e.sector, e.last_price, h.free_cash_flow, h.total_debt, h.net_debt, h.year
       FROM emiten e JOIN stock_histories h ON e.id = h.emiten_id
       WHERE h.year = (SELECT MAX(year) FROM stock_histories WHERE emiten_id = e.id)
         AND h.free_cash_flow > 0 AND h.net_debt < 0
       ORDER BY h.free_cash_flow DESC LIMIT ?`,
    )
    .all(limit) as any[];

  return {
    description:
      "Emiten dengan Free Cash Flow positif dan kondisi Kas bersih melampaui Total Utang (Net Debt Negatif)",
    count: result.length,
    data: result,
  };
}

export function getGrowthStocks(limit: number = 25) {
  const result = db
    .query(
      `SELECT e.code, e.name, h1.net_profit as latest_net_profit, h2.net_profit as prev_net_profit, h1.year as latest_year
       FROM emiten e
       JOIN stock_histories h1 ON e.id = h1.emiten_id
       JOIN stock_histories h2 ON e.id = h2.emiten_id AND h2.year = (h1.year - 1)
       WHERE h1.year = (SELECT MAX(year) FROM stock_histories WHERE emiten_id = e.id)
         AND h1.net_profit IS NOT NULL AND h2.net_profit IS NOT NULL AND h1.net_profit > h2.net_profit
       ORDER BY (h1.net_profit - h2.net_profit) / ABS(h2.net_profit) DESC LIMIT ?`,
    )
    .all(limit);

  return {
    description:
      "Menyaring emiten dengan pertumbuhan laba bersih positif pada tahun laporan keuangan terbaru",
    count: result.length,
    data: result,
  };
}

export function getRankedStocks(
  sortBy: string = "market_cap",
  limit: number = 25,
) {
  const queryStr =
    sortBy === "dividend_yield"
      ? `SELECT code, name, sector, last_price, market_cap, pbv, per, dividend_yield FROM emiten ORDER BY dividend_yield DESC LIMIT ?`
      : `SELECT code, name, sector, last_price, market_cap, pbv, per, dividend_yield FROM emiten ORDER BY market_cap DESC LIMIT ?`;

  const result = db.query(queryStr).all(limit) as EmitenDbRow[];

  return {
    metric: sortBy,
    count: result.length,
    data: result,
  };
}

// ============================================================================
// HYBRID / HEAVY ASYNC SCREENERS (EXTERNAL API + CANDLE ANALYSIS)
// ============================================================================

/**
 * Mengambil daftar saham terindikasi spekulatif (gorengan) dengan menjadikan
 * pengumuman UMA resmi BEI sebagai patokan utama kandidat, diperkaya data fundamental dan candle.
 */
export async function getGorenganStocks(
  limit: number = 25,
): Promise<GorenganSuspect[]> {
  let candidateList: CandidateStock[] = [];

  // 1. TAHAP 1: Ambil kandidat utama dari UMA Service IDX (30 hari terakhir)
  try {
    const umaList = await getActiveUmaStocks(30);

    if (umaList && umaList.length > 0) {
      for (const umaItem of umaList) {
        const dbRow = db
          .query(
            `SELECT code, name, sector, last_price, market_cap, per, pbv, roe
             FROM emiten WHERE code = ?`,
          )
          .get(umaItem.code) as EmitenDbRow | null;

        candidateList.push({
          code: umaItem.code,
          name: dbRow?.name || umaItem.name,
          sector: dbRow?.sector || "N/A",
          last_price: dbRow?.last_price || 0,
          market_cap: dbRow?.market_cap || null,
          per: dbRow?.per || null,
          pbv: dbRow?.pbv || null,
          roe: dbRow?.roe || null,
          isUma: true,
          umaTitle: umaItem.title,
        });
      }
    }
  } catch (error) {
    safeLog(
      "warn",
      `[GorenganScreener] Gagal mengambil data UMA IDX, beralih ke database lokal. Error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // Fallback: Jika UMA Service tidak mengembalikan data, gunakan database lokal
  if (candidateList.length === 0) {
    const rows = db
      .query(
        `SELECT e.code, e.name, e.sector, e.last_price, e.market_cap, e.per, e.pbv, e.roe
         FROM emiten e
         WHERE (e.last_price < 1000 OR e.market_cap < 1000000000000)
           AND e.last_price IS NOT NULL AND e.last_price > 0
           AND e.market_cap IS NOT NULL AND e.market_cap > 0`,
      )
      .all() as EmitenDbRow[];

    candidateList = rows.map((r) => ({
      code: r.code,
      name: r.name,
      sector: r.sector,
      last_price: r.last_price,
      market_cap: r.market_cap,
      per: r.per,
      pbv: r.pbv,
      roe: r.roe,
      isUma: false,
    }));
  }

  const maxCandidatesToCheck = Math.max(limit * 2, 30);
  const topCandidates = candidateList.slice(0, maxCandidatesToCheck);

  // 2. TAHAP 2: Analisis Perilaku Candle & Perhitungan Skor Spekulatif
  const evaluatedStocks = await promisePool(
    topCandidates,
    5,
    async (stock): Promise<GorenganSuspect | null> => {
      try {
        const candleRes = await fetchYahooCandles(stock.code, "3mo");
        if (!candleRes || !candleRes.history || candleRes.history.length < 20) {
          return null;
        }

        const { history } = candleRes;
        const latestCandle = history[history.length - 1];
        const last20Candles = history.slice(-20);

        if (!latestCandle || !latestCandle.close || latestCandle.close <= 0) {
          return null;
        }

        const realTimePrice = latestCandle.close;
        const totalVolume20 = last20Candles.reduce(
          (acc, c) => acc + (c.volume || 0),
          0,
        );
        const avgVolume20 = totalVolume20 / last20Candles.length;

        if (
          !avgVolume20 ||
          avgVolume20 <= 0 ||
          !latestCandle.volume ||
          latestCandle.volume <= 0
        ) {
          return null;
        }

        const volumeSpikeRatio = latestCandle.volume / avgVolume20;

        const candle5DaysAgo = history[Math.max(0, history.length - 5)];
        const price5dReturn =
          candle5DaysAgo && candle5DaysAgo.close > 0
            ? ((realTimePrice - candle5DaysAgo.close) / candle5DaysAgo.close) *
              100
            : 0;

        const last5Candles = history.slice(-5);
        const greenCandlesCount = last5Candles.filter(
          (c) => c.close > c.open,
        ).length;

        let score = 0;
        const reasons: string[] = [];

        // Evaluasi Kriteria & Pembobotan Skor
        if (stock.isUma) {
          score += 5;
          reasons.push(
            `Terdaftar dalam pengumuman resmi Unusual Market Activity BEI (${stock.umaTitle || "Pengumuman UMA"})`,
          );
        }

        if (realTimePrice < 200) {
          score += 2;
          reasons.push(
            `Kategori saham lapis bawah dengan harga nominal rendah (Rp ${realTimePrice})`,
          );
        }

        if (stock.market_cap && stock.market_cap < 500_000_000_000) {
          score += 2;
          reasons.push(
            `Kapitalisasi pasar mikro sebesar Rp ${(stock.market_cap / 1e9).toFixed(1)} miliar`,
          );
        }

        if (
          stock.pbv !== null &&
          stock.roe !== null &&
          stock.pbv > 2.5 &&
          stock.roe < 3
        ) {
          score += 3;
          reasons.push(
            `Valuasi PBV tinggi (${stock.pbv.toFixed(2)}x) tidak sebanding dengan ROE rendah (${stock.roe.toFixed(2)}%)`,
          );
        }

        if (stock.per !== null && (stock.per < 0 || stock.per > 60)) {
          score += 2;
          reasons.push(
            `Rasio PER anomali atau mencatatkan kerugian (${stock.per.toFixed(1)}x)`,
          );
        }

        if (volumeSpikeRatio >= 3.0) {
          score += 4;
          reasons.push(
            `Lonjakan volume transaksi mendadak sebesar ${volumeSpikeRatio.toFixed(1)}x dari rata-rata 20 hari`,
          );
        } else if (volumeSpikeRatio >= 1.8) {
          score += 2;
          reasons.push(
            `Peningkatan volume transaksi harian mencapai ${volumeSpikeRatio.toFixed(1)}x rata-rata 20 hari`,
          );
        }

        if (price5dReturn >= 20.0) {
          score += 4;
          reasons.push(
            `Kenaikan harga ekstrim sebesar +${price5dReturn.toFixed(1)}% dalam 5 hari terakhir`,
          );
        } else if (price5dReturn >= 10.0) {
          score += 2;
          reasons.push(
            `Kenaikan harga signifikan sebesar +${price5dReturn.toFixed(1)}% dalam 5 hari terakhir`,
          );
        }

        if (greenCandlesCount >= 4 && price5dReturn >= 10) {
          score += 2;
          reasons.push(
            `Pola pergerakan harga konsisten naik (${greenCandlesCount} dari 5 hari terakhir ditutup menguat)`,
          );
        }

        return {
          code: stock.code,
          name: stock.name,
          sector: stock.sector,
          last_price: realTimePrice,
          market_cap: stock.market_cap,
          gorengan_score: score,
          reasons,
          per: stock.per,
          pbv: stock.pbv,
          roe: stock.roe,
          candle_signals: {
            volume_spike_ratio: parseFloat(volumeSpikeRatio.toFixed(2)),
            recent_5d_return_pct: parseFloat(price5dReturn.toFixed(2)),
            consecutive_green_days: greenCandlesCount,
          },
        };
      } catch (err) {
        return null;
      }
    },
  );

  return evaluatedStocks
    .filter((stock): stock is GorenganSuspect => stock !== null)
    .sort((a, b) => b.gorengan_score - a.gorengan_score);
}
