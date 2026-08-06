import db from "../../db";

// ============================================================================
// INTERFACES DIVIDEND SCREENER
// ============================================================================

export interface DividendScreenerOptions {
  minYield?: number; // Minimal TTM Yield (%) - Default: 5.0%
  maxDpr?: number; // Maksimal DPR (%) untuk cegah Dividend Trap - Default: 100%
  minStreak?: number; // Minimal tahun beruntun bagi dividen - Default: 3 tahun
  maxDer?: number; // Maksimal Debt-to-Equity Ratio - Default: 1.5
  minMarketCap?: number; // Minimal Kapitalisasi Pasar (IDR) - Default: 0
  limit?: number; // Jumlah max hasil - Default: 30
}

export interface DividendScreenerResultRow {
  code: string;
  name: string;
  sector: string;
  last_price: number;
  market_cap: number;
  pbv: number;
  per: number;
  der: number;
  ttm_dps: number;
  calculated_yield: number; // TTM Yield (%)
  latest_dpr_year: number | null;
  latest_dpr: number | null; // DPR (%) tahun laporan terakhir
  consecutive_years: number; // Streak tahun berturut-turut
}

// ============================================================================
// FUNGSI UTAMA DIVIDEND SCREENER
// ============================================================================

/**
 * Menyaring emiten saham berdasarkan kinerja dividen riil (TTM Yield, DPR, Streak, & Fundamental).
 *
 * @param {DividendScreenerOptions} options Filter kriteria penyaringan.
 * @returns Ringkasan kriteria dan array emiten yang lolos kriteria.
 */
export function screenDividends(options: DividendScreenerOptions = {}) {
  const minYield = options.minYield ?? 5.0;
  const maxDpr = options.maxDpr ?? 100.0;
  const minStreak = options.minStreak ?? 1;
  const maxDer = options.maxDer ?? 1.5;
  const minMarketCap = options.minMarketCap ?? 0;
  const limit = options.limit ?? 30;

  const currentYear = new Date().getFullYear();
  const streakStartYear = currentYear - minStreak;

  // Query SQLite dengan CTE untuk agregasi TTM DPS, DPR, dan Streak
  const query = `
    WITH TtmSummary AS (
      -- 1. Hitung TTM DPS (12 bulan terakhir)
      SELECT
        emiten_id,
        SUM(cash_dividend) AS ttm_dps
      FROM dividend_histories
      WHERE ex_date >= date('now', '-1 year')
      GROUP BY emiten_id
    ),
    LatestDprSummary AS (
      -- 2. Hitung DPR dari tahun laporan penuh (FY) terakhir yang ada angka EPS-nya
      SELECT
        dh.emiten_id,
        dh.year,
        ROUND((SUM(dh.cash_dividend) / sh.eps) * 100, 2) AS dpr,
        ROW_NUMBER() OVER (PARTITION BY dh.emiten_id ORDER BY dh.year DESC) as rn
      FROM dividend_histories dh
      JOIN stock_histories sh ON sh.emiten_id = dh.emiten_id AND sh.year = dh.year AND sh.period = 'FY'
      WHERE sh.eps > 0
      GROUP BY dh.emiten_id, dh.year
    ),
    StreakSummary AS (
      -- 3. Hitung jumlah tahun unik pembagian dividen dalam rentang N tahun terakhir
      SELECT
        emiten_id,
        COUNT(DISTINCT year) AS consecutive_years
      FROM dividend_histories
      WHERE year >= ? AND cash_dividend > 0
      GROUP BY emiten_id
    )
    SELECT
      e.code,
      e.name,
      e.sector,
      e.last_price,
      e.market_cap,
      e.pbv,
      e.per,
      e.der,
      ROUND(COALESCE(t.ttm_dps, 0), 2) AS ttm_dps,
      ROUND((COALESCE(t.ttm_dps, 0) / e.last_price) * 100, 2) AS calculated_yield,
      dpr_s.year AS latest_dpr_year,
      dpr_s.dpr AS latest_dpr,
      COALESCE(st.consecutive_years, 0) AS consecutive_years
    FROM emiten e
    JOIN TtmSummary t ON t.emiten_id = e.id
    LEFT JOIN LatestDprSummary dpr_s ON dpr_s.emiten_id = e.id AND dpr_s.rn = 1
    LEFT JOIN StreakSummary st ON st.emiten_id = e.id
    WHERE e.last_price > 0
      AND (COALESCE(t.ttm_dps, 0) / e.last_price) * 100 >= ?
      AND e.der <= ?
      AND e.market_cap >= ?
      AND (dpr_s.dpr IS NULL OR dpr_s.dpr <= ?)
      AND COALESCE(st.consecutive_years, 0) >= ?
    ORDER BY calculated_yield DESC
    LIMIT ?
  `;

  const rows = db
    .query(query)
    .all(
      streakStartYear,
      minYield,
      maxDer,
      minMarketCap,
      maxDpr,
      minStreak,
      limit,
    ) as DividendScreenerResultRow[];

  return {
    filter_applied: {
      min_yield_pct: minYield,
      max_dpr_pct: maxDpr,
      min_streak_years: minStreak,
      max_der: maxDer,
      min_market_cap: minMarketCap,
      limit,
    },
    count: rows.length,
    data: rows,
  };
}
