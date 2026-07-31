import db from "../db";
import type { EmitenDbRow, GorenganSuspect } from "../types";
import { fetchYahooCandles } from "./yahooService";

export interface ScreenerUndervaluedParams {
  maxPbv?: number;
  minRoe?: number;
  maxDer?: number;
  limit?: number;
}

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

export interface ScreenerMarketCapParams {
  minMarketCap?: number;
  maxMarketCap?: number | null;
  sort?: "asc" | "desc" | string;
  limit?: number;
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

export interface ScreenerTechnicalParams {
  strategy?: "breakout" | "reversal" | "volatile" | string;
  limit?: number;
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

export interface ScreenerDividendParams {
  minYield?: number;
  limit?: number;
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
  let queryStr = `SELECT code, name, sector, last_price, market_cap, pbv, per, dividend_yield FROM emiten `;
  queryStr +=
    sortBy === "dividend_yield"
      ? ` ORDER BY dividend_yield DESC LIMIT ? `
      : ` ORDER BY market_cap DESC LIMIT ? `;

  const result = db.query(queryStr).all(limit) as EmitenDbRow[];

  return {
    metric: sortBy,
    count: result.length,
    data: result,
  };
}

export async function getGorenganStocks(
  limit: number = 25,
): Promise<GorenganSuspect[]> {
  // 1. TAHAP 1: Filter awal kandidat dari DB SQLite
  const rows = db
    .query(
      `SELECT
         e.code,
         e.name,
         e.sector,
         e.last_price,
         e.market_cap,
         e.per,
         e.pbv,
         e.roe
       FROM emiten e
       WHERE (e.last_price < 1000 OR e.market_cap < 1000000000000)
         AND e.last_price IS NOT NULL AND e.last_price > 0
         AND e.market_cap IS NOT NULL AND e.market_cap > 0`,
    )
    .all() as Array<any>;

  const candidates: GorenganSuspect[] = [];

  // Hitung Skor Fundamental Awal
  for (const row of rows) {
    // Validasi Ekstra: Pastikan harga dan market cap valid
    if (!row.last_price || row.last_price <= 0) continue;
    if (!row.market_cap || row.market_cap <= 0) continue;

    const reasons: string[] = [];
    let score = 0;

    if (row.last_price < 200) {
      score += 2;
      reasons.push(`Penny stock (Rp ${row.last_price})`);
    }

    if (row.market_cap < 500_000_000_000) {
      score += 2;
      reasons.push(
        `Market Cap mikro (Rp ${(row.market_cap / 1e9).toFixed(1)}M)`,
      );
    }

    if (row.pbv !== null && row.roe !== null && row.pbv > 2.5 && row.roe < 3) {
      score += 3;
      reasons.push(
        `PBV mahal (${row.pbv.toFixed(2)}x) tapi ROE rendah (${row.roe.toFixed(2)}%)`,
      );
    }

    if (row.per !== null && (row.per < 0 || row.per > 80)) {
      score += 2;
      reasons.push(`PER Anomali/Rugi (${row.per.toFixed(1)}x)`);
    }

    if (score >= 2) {
      candidates.push({
        code: row.code,
        name: row.name,
        sector: row.sector,
        last_price: row.last_price,
        market_cap: row.market_cap,
        gorengan_score: score,
        reasons,
        per: row.per,
        pbv: row.pbv,
        roe: row.roe,
      });
    }
  }

  // Batasi top 30 kandidat teratas untuk diperiksa candlenya
  const topCandidates = candidates
    .sort((a, b) => b.gorengan_score - a.gorengan_score)
    .slice(0, 30);

  // 2. TAHAP 2: Analisis Perilaku Candle (Eliminasi jika candle kosong/nol)
  const candlePromises = topCandidates.map(
    async (stock): Promise<GorenganSuspect | null> => {
      const candleRes = await fetchYahooCandles(stock.code, "1mo");

      // 🛑 ELIMINASI: Jika data candle tidak ditemukan atau < 5 baris
      if (!candleRes || !candleRes.history || candleRes.history.length < 5) {
        return null;
      }

      const { history } = candleRes;
      const latestCandle = history[history.length - 1];
      const last20Candles = history.slice(-20);

      // 🛑 ELIMINASI: Jika candle terbaru tidak valid / harga close <= 0
      if (!latestCandle || !latestCandle.close || latestCandle.close <= 0) {
        return null;
      }

      // Hitung Rata-Rata Volume 20 Hari
      const avgVolume20 =
        last20Candles.reduce((acc, c) => acc + c.volume, 0) /
        last20Candles.length;

      // 🛑 ELIMINASI: Jika tidak ada aktivitas transaksi / volume 0 (saham mati)
      if (!avgVolume20 || avgVolume20 <= 0 || latestCandle.volume <= 0) {
        return null;
      }

      // Lonjakan Volume Hari Ini vs Rata-Rata 20 Hari
      const volumeSpikeRatio = latestCandle.volume / avgVolume20;

      // Kenaikan Harga 5 Hari Terakhir
      const candle5DaysAgo = history[Math.max(0, history.length - 5)];
      const price5dReturn =
        candle5DaysAgo && candle5DaysAgo.close > 0
          ? ((latestCandle.close - candle5DaysAgo.close) /
              candle5DaysAgo.close) *
            100
          : 0;

      let extraScore = 0;
      const additionalReasons: string[] = [];

      // Indikator 1: Volume Spike
      if (volumeSpikeRatio >= 3.0) {
        extraScore += 4;
        additionalReasons.push(
          `🚨 VOLUME SPIKE MENDADAK: ${volumeSpikeRatio.toFixed(1)}x dari rata-rata 20 hari`,
        );
      } else if (volumeSpikeRatio >= 1.8) {
        extraScore += 2;
        additionalReasons.push(
          `Volume transaksi meningkat (${volumeSpikeRatio.toFixed(1)}x rata-rata)`,
        );
      }

      // Indikator 2: Price Pump
      if (price5dReturn >= 15.0) {
        extraScore += 3;
        additionalReasons.push(
          `🚀 PUMP HARGA: Naik +${price5dReturn.toFixed(1)}% dalam 5 hari terakhir`,
        );
      }

      return {
        ...stock,
        gorengan_score: stock.gorengan_score + extraScore,
        reasons: [...stock.reasons, ...additionalReasons],
        candle_signals: {
          volume_spike_ratio: parseFloat(volumeSpikeRatio.toFixed(2)),
          recent_5d_return_pct: parseFloat(price5dReturn.toFixed(2)),
        },
      };
    },
  );

  const evaluatedStocks = await Promise.all(candlePromises);

  // 🧹 Filter & Hapus seluruh item bernilai null
  return evaluatedStocks
    .filter((stock): stock is GorenganSuspect => stock !== null)
    .sort((a, b) => b.gorengan_score - a.gorengan_score)
    .slice(0, limit);
}
