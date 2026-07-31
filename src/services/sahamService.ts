import db from "../db";
import type {
  EmitenBasicInfo,
  EmitenDbRow,
  TradingViewFinancialHistory,
} from "../types";

/**
 * Mencari emiten berdasarkan kode ticker atau nama perusahaan dari database SQLite.
 *
 * @param query Kata kunci pencarian (misal: "BBRI", "Alfamart", "Telkom")
 * @param limit Batas maksimal hasil pencarian (default: 10)
 */
export function searchEmiten(
  query: string,
  limit: number = 10,
): EmitenBasicInfo[] {
  if (!query || query.trim() === "") return [];

  const cleanQuery = `%${query.trim().toLowerCase()}%`;

  return db
    .query(
      `SELECT code, name, sector
       FROM emiten
       WHERE LOWER(code) LIKE ? OR LOWER(name) LIKE ?
       LIMIT ?`,
    )
    .all(cleanQuery, cleanQuery, limit) as EmitenBasicInfo[];
}

/**
 * Mengambil profil ringkas emiten beserta seluruh riwayat laporan keuangan tahunannya.
 *
 * @param code Kode ticker saham (misal: "BBCA", "TLKM")
 * @returns Profil emiten dan histori keuangan, atau `null` jika ticker tidak ditemukan.
 */
export function getEmitenProfile(code: string) {
  const formattedCode = code.trim().toUpperCase();

  const emiten = db
    .query("SELECT * FROM emiten WHERE code = ? LIMIT 1")
    .get(formattedCode) as EmitenDbRow | undefined;

  if (!emiten) return null;

  const histories = db
    .query(
      `SELECT * FROM stock_histories
       WHERE emiten_id = ?
       ORDER BY year DESC`,
    )
    .all(emiten.id) as TradingViewFinancialHistory[];

  return { ...emiten, histories };
}

/**
 * Mengambil riwayat laporan keuangan tahunan murni untuk emiten tertentu.
 *
 * @param code Kode ticker saham
 * @returns Array laporan keuangan terurut dari tahun terbaru, atau `null` jika tidak ditemukan.
 */
export function getEmitenHistories(code: string) {
  const formattedCode = code.trim().toUpperCase();

  const emiten = db
    .query("SELECT id FROM emiten WHERE code = ? LIMIT 1")
    .get(formattedCode) as { id: number } | undefined;

  if (!emiten) return null;

  return db
    .query(
      `SELECT
         year, period, revenue, gross_profit, operating_income, ebit, net_profit, eps,
         average_basic_shares_outstanding, ebitda, total_assets, total_liabilities,
         total_equity, total_debt, net_debt, cash_flow_operating, cash_flow_investing,
         cash_flow_financing, free_cash_flow, roe, der, pbv, per
       FROM stock_histories
       WHERE emiten_id = ?
       ORDER BY year DESC`,
    )
    .all(emiten.id) as TradingViewFinancialHistory[];
}

/**
 * Menganalisis tren pertumbuhan tahunan (YoY - Year-over-Year)
 * untuk Pendapatan (Revenue) dan Laba Bersih (Net Profit).
 *
 * @param code Kode ticker saham
 * @returns Array tren pertumbuhan tahunan dalam persen (%), atau `null` jika emiten tidak ditemukan.
 */
export function getEmitenGrowth(code: string) {
  const formattedCode = code.trim().toUpperCase();

  const emiten = db
    .query("SELECT id FROM emiten WHERE code = ? LIMIT 1")
    .get(formattedCode) as { id: number } | undefined;

  if (!emiten) return null;

  const histories = db
    .query(
      `SELECT year, revenue, net_profit
       FROM stock_histories
       WHERE emiten_id = ?
       ORDER BY year ASC`,
    )
    .all(emiten.id) as Array<{
    year: number;
    revenue: number | null;
    net_profit: number | null;
  }>;

  return histories.map((curr, idx, arr) => {
    // Tahun pertama tidak memiliki acuan YoY
    if (idx === 0) {
      return { ...curr, revenue_growth_yoy: 0, profit_growth_yoy: 0 };
    }

    const prev = arr[idx - 1];

    const revGrowth =
      prev?.revenue && curr.revenue
        ? ((curr.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100
        : 0;

    const profGrowth =
      prev?.net_profit && curr.net_profit
        ? ((curr.net_profit - prev.net_profit) / Math.abs(prev.net_profit)) *
          100
        : 0;

    return {
      ...curr,
      revenue_growth_yoy: parseFloat(revGrowth.toFixed(2)),
      profit_growth_yoy: parseFloat(profGrowth.toFixed(2)),
    };
  });
}

/**
 * Mengkalkulasi estimasi status nilai wajar berbasis rasio PER saat ini
 * dibandingkan dengan rata-rata PER historis 5 tahun.
 *
 * @param code Kode ticker saham
 * @returns Objek analisis valuasi PER, atau `null` jika data historis tidak mencukupi.
 */
export function getEmitenValuation(code: string) {
  const formattedCode = code.trim().toUpperCase();

  const data = db
    .query(
      `SELECT
         e.last_price,
         e.per AS current_per,
         AVG(h.per) AS avg_5y_per
       FROM emiten e
       JOIN stock_histories h ON e.id = h.emiten_id
       WHERE e.code = ? AND h.per IS NOT NULL AND h.per != 0
       GROUP BY e.id`,
    )
    .get(formattedCode) as
    | {
        last_price: number;
        current_per: number | null;
        avg_5y_per: number | null;
      }
    | undefined;

  if (!data || !data.current_per || !data.avg_5y_per) {
    return null;
  }

  const discount = data.avg_5y_per - data.current_per;
  const status =
    discount > 0
      ? "Undervalued vs Historical Average"
      : "Overvalued vs Historical Average";

  return {
    code: formattedCode,
    status,
    current_per: data.current_per,
    avg_historical_per: parseFloat(data.avg_5y_per.toFixed(2)),
    potensi_upside_per_points: parseFloat(discount.toFixed(2)),
  };
}
