import db from "../../db";
import type { EmitenDbRow } from "../../types";
import { log } from "../../utils/log";
import { promisePool } from "../../utils/mcp/promisePool";
import { getActiveUmaStocks } from "../idxServices/getUMA";
import { fetchYahooCandles } from "../yahooServices/fetchCandle";

interface GorenganSuspect {
  code: string;
  name: string;
  sector: string;
  last_price: number;
  market_cap: number | null;
  gorengan_score: number;
  reasons: string[];
  per: number | null;
  pbv: number | null;
  roe: number | null;
  candle_signals?: {
    volume_spike_ratio: number; // Rasio volume terhadap rata-rata 20 hari
    recent_5d_return_pct: number; // Persentase kenaikan harga 5 hari terakhir
    consecutive_green_days?: number; // Jumlah penutupan harga hijau beruntun
  };
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
    log(
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
