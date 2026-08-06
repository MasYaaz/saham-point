import db from "../../db";

// ============================================================================
// INTERFACES ANALISIS DIVIDEN
// ============================================================================

export interface AnnualDividendSummary {
  year: number;
  total_dps: number;
  interim_dps: number;
  final_dps: number;
  special_dps: number;
  payout_count: number;
  eps: number | null;
  dpr: number | null; // Dividend Payout Ratio (%)
}

export interface DividendAnalysisResult {
  code: string;
  name: string;
  last_price: number;
  ttm_dps: number;
  current_yield: number; // Dividend Yield (%)
  cagr_3y: number | null; // CAGR Growth DPS 3 Tahun (%)
  cagr_5y: number | null; // CAGR Growth DPS 5 Tahun (%)
  consecutive_years_paid: number; // Streak beruntun bagi dividen (Tahun)
  safety_rating: "SAFE" | "MODERATE" | "HIGH_RISK" | "NO_DIVIDEND";
  safety_notes: string[];
  annual_breakdown: AnnualDividendSummary[];
  latest_event: {
    type: string;
    cash_dividend: number;
    ex_date: string;
    record_date: string;
    payment_date: string;
  } | null;
}

// ============================================================================
// HELPER KALKULASI METRIK
// ============================================================================

/**
 * Menghitung Compound Annual Growth Rate (CAGR) DPS.
 */
function calculateDpsCagr(
  startDps: number,
  endDps: number,
  years: number,
): number | null {
  if (startDps <= 0 || endDps <= 0 || years <= 0) return null;
  const cagr = (Math.pow(endDps / startDps, 1 / years) - 1) * 100;
  return Number(cagr.toFixed(2));
}

// ============================================================================
// FUNGSI UTAMA DIVIDEND ANALYZER
// ============================================================================

/**
 * Menganalisis histori & kinerja fundamental dividen suatu emiten saham.
 *
 * Fitur Utama:
 * - Kalkulasi TTM DPS (Trailing Twelve Months) & Dividend Yield saat ini.
 * - Agregasi dividen tahunan (Interim, Final, Special) & Dividend Payout Ratio (DPR).
 * - Perhitungan pertumbuhan dividen CAGR (3Y & 5Y) berbasis tahun penuh.
 * - Perhitungan Dividend Streak (Tahun beruntun membagikan dividen).
 * - Assessment kesehatan & keamanan dividen (Safety Rating & Notes).
 *
 * @param {string} ticker - Kode saham / ticker emiten (contoh: 'BBCA', 'ADRO').
 * @returns {DividendAnalysisResult} Ringkasan hasil analisis dividen emiten.
 */
export function analyzeEmitenDividend(ticker: string): DividendAnalysisResult {
  // 1. Inisialisasi Ticker & Query Profil Emiten
  const cleanCode = ticker.trim().toUpperCase().replace("IDX:", "");

  const emiten = db
    .query(
      `SELECT id, code, name, last_price FROM emiten WHERE UPPER(code) = ?`,
    )
    .get(cleanCode) as {
    id: number;
    code: string;
    name: string;
    last_price: number;
  } | null;

  if (!emiten) {
    throw new Error(`Emiten '${cleanCode}' tidak ditemukan di database.`);
  }

  // 2. Query Data Historis Dividen & EPS
  const rawDividends = db
    .query(
      `
      SELECT year, type, cash_dividend, ex_date, record_date, payment_date
      FROM dividend_histories
      WHERE emiten_id = ?
      ORDER BY ex_date DESC
    `,
    )
    .all(emiten.id) as Array<{
    year: number;
    type: string;
    cash_dividend: number;
    ex_date: string;
    record_date: string;
    payment_date: string;
  }>;

  const stockHistories = db
    .query(
      `
      SELECT year, eps, net_profit
      FROM stock_histories
      WHERE emiten_id = ? AND period = 'FY'
      ORDER BY year DESC
    `,
    )
    .all(emiten.id) as Array<{ year: number; eps: number; net_profit: number }>;

  const epsMap = new Map<number, number>();
  for (const sh of stockHistories) {
    if (sh.eps !== null && sh.eps !== undefined) {
      epsMap.set(sh.year, Number(sh.eps));
    }
  }

  // 3. Agregasi Dividen Tahunan & Perhitungan DPR
  const annualMap = new Map<number, AnnualDividendSummary>();

  for (const div of rawDividends) {
    const yr = div.year;
    if (!annualMap.has(yr)) {
      annualMap.set(yr, {
        year: yr,
        total_dps: 0,
        interim_dps: 0,
        final_dps: 0,
        special_dps: 0,
        payout_count: 0,
        eps: epsMap.get(yr) ?? null,
        dpr: null,
      });
    }

    const summary = annualMap.get(yr)!;
    summary.total_dps += div.cash_dividend;
    summary.payout_count += 1;

    const divType = div.type.toUpperCase();
    if (divType.includes("INTERIM")) {
      summary.interim_dps += div.cash_dividend;
    } else if (divType.includes("SPECIAL")) {
      summary.special_dps += div.cash_dividend;
    } else {
      summary.final_dps += div.cash_dividend;
    }
  }

  const annualBreakdown: AnnualDividendSummary[] = Array.from(
    annualMap.values(),
  )
    .map((item) => {
      let dpr: number | null = null;
      if (item.eps && item.eps > 0) {
        dpr = Number(((item.total_dps / item.eps) * 100).toFixed(2));
      }
      return {
        ...item,
        total_dps: Number(item.total_dps.toFixed(2)),
        interim_dps: Number(item.interim_dps.toFixed(2)),
        final_dps: Number(item.final_dps.toFixed(2)),
        special_dps: Number(item.special_dps.toFixed(2)),
        dpr,
      };
    })
    .sort((a, b) => b.year - a.year);

  // 4. Guard Clause & Type Narrowing
  const latestAnnual = annualBreakdown[0];

  if (!latestAnnual) {
    return {
      code: emiten.code,
      name: emiten.name,
      last_price: emiten.last_price,
      ttm_dps: 0,
      current_yield: 0,
      cagr_3y: null,
      cagr_5y: null,
      consecutive_years_paid: 0,
      safety_rating: "NO_DIVIDEND",
      safety_notes: ["Emiten belum pernah mencatatkan pembagian dividen."],
      annual_breakdown: [],
      latest_event: null,
    };
  }

  // Cari tahun laporan penuh terakhir yang sudah selesai (Completed Fiscal Year)
  const currentYear = new Date().getFullYear();
  const completedAnnuals = annualBreakdown.filter((a) => a.year < currentYear);
  const latestCompletedAnnual = completedAnnuals[0] ?? latestAnnual;

  // 5. Kalkulasi TTM DPS (Trailing Twelve Months) & Current Yield
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoStr = oneYearAgo.toISOString().slice(0, 10);

  const ttmDpsRaw = rawDividends
    .filter((d) => Boolean(d?.ex_date) && d.ex_date >= oneYearAgoStr)
    .reduce((sum, d) => sum + (d.cash_dividend ?? 0), 0);

  // Fallback ke total DPS tahun laporan penuh jika tidak ada event ex_date dalam 12 bulan terakhir
  const ttmDps = ttmDpsRaw > 0 ? ttmDpsRaw : latestCompletedAnnual.total_dps;

  const currentYield =
    emiten.last_price > 0
      ? Number(((ttmDps / emiten.last_price) * 100).toFixed(2))
      : 0;

  // 6. Kalkulasi Pertumbuhan Dividen (CAGR 3Y & 5Y berbasis Tahun Penuh)
  const baseYear = latestCompletedAnnual.year;
  const dpsBase = latestCompletedAnnual.total_dps;

  const summary3Y = annualBreakdown.find((a) => a.year === baseYear - 3);
  const cagr3Y = summary3Y
    ? calculateDpsCagr(summary3Y.total_dps, dpsBase, 3)
    : null;

  const summary5Y = annualBreakdown.find((a) => a.year === baseYear - 5);
  const cagr5Y = summary5Y
    ? calculateDpsCagr(summary5Y.total_dps, dpsBase, 5)
    : null;

  // 7. Perhitungan Dividend Streak (Tahun Beruntun Membagikan Dividen)
  let consecutiveYearsPaid = 0;
  let checkYear = latestAnnual.year;

  for (const item of annualBreakdown) {
    if (item.year === checkYear && item.total_dps > 0) {
      consecutiveYearsPaid++;
      checkYear--;
    } else {
      break;
    }
  }

  // 8. Assessment Keamanan & Kesehatan Dividen (Safety Rating)
  const safetyNotes: string[] = [];
  let safetyRating: DividendAnalysisResult["safety_rating"] = "SAFE";

  // Ambil data DPR terbaru dari tahun yang sudah memiliki angka EPS valid
  const latestWithDpr = annualBreakdown.find((a) => a.dpr !== null);
  const targetDpr = latestWithDpr?.dpr ?? null;

  if (targetDpr !== null && latestWithDpr) {
    if (targetDpr > 100) {
      safetyRating = "HIGH_RISK";
      safetyNotes.push(
        `Payout Ratio (${latestWithDpr.year}: DPR ${targetDpr}%) melebihi 100% laba bersih (berisiko tidak berkelanjutan).`,
      );
    } else if (targetDpr > 80) {
      safetyRating = "MODERATE";
      safetyNotes.push(
        `Payout Ratio tinggi (${latestWithDpr.year}: DPR ${targetDpr}%), menyisakan sedikit laba ditahan untuk ekspansi.`,
      );
    } else if (targetDpr < 20) {
      safetyNotes.push(
        `Payout Ratio konservatif (${latestWithDpr.year}: DPR ${targetDpr}%), dividen aman tetapi porsi pembagian rendah.`,
      );
    } else {
      safetyNotes.push(
        `Payout Ratio ideal (${latestWithDpr.year}: DPR ${targetDpr}%) antara 20% - 80% laba bersih.`,
      );
    }
  } else {
    safetyNotes.push(
      "Data EPS tahunan belum lengkap untuk menghitung Dividend Payout Ratio.",
    );
  }

  if (consecutiveYearsPaid >= 5) {
    safetyNotes.push(
      `Emiten konsisten membagikan dividen selama ${consecutiveYearsPaid} tahun berturut-turut.`,
    );
  } else if (consecutiveYearsPaid < 3) {
    if (safetyRating !== "HIGH_RISK") safetyRating = "MODERATE";
    safetyNotes.push(
      `Konsistensi pembayaran dividen masih di bawah 3 tahun berturut-turut.`,
    );
  }

  // 9. Formatting Object Event Terbaru & Final Return
  const latestRawEvent = rawDividends[0];
  const latestEvent: DividendAnalysisResult["latest_event"] = latestRawEvent
    ? {
        type: latestRawEvent.type,
        cash_dividend: latestRawEvent.cash_dividend,
        ex_date: latestRawEvent.ex_date,
        record_date: latestRawEvent.record_date,
        payment_date: latestRawEvent.payment_date,
      }
    : null;

  return {
    code: emiten.code,
    name: emiten.name,
    last_price: emiten.last_price,
    ttm_dps: Number(ttmDps.toFixed(2)),
    current_yield: currentYield,
    cagr_3y: cagr3Y,
    cagr_5y: cagr5Y,
    consecutive_years_paid: consecutiveYearsPaid,
    safety_rating: safetyRating,
    safety_notes: safetyNotes,
    annual_breakdown: annualBreakdown,
    latest_event: latestEvent,
  };
}
