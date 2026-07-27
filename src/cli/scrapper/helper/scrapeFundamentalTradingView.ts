import * as cheerio from "cheerio";
import type { TradingViewFinancialHistory } from "../../../types";
import { safeLog } from "../../../cli/helper/safeLog";
import { checkIfBlockedByCaptcha } from "../../../utils/scrapper/browser";

// ============================================================================
// TYPE DEFINITIONS & INTERFACES
// ============================================================================

type FinancialPeriodKey = number | "current" | "ttm";

interface TabConfig {
  suffix: string;
  mapping: Record<string, keyof TradingViewFinancialHistory>;
  waitSelector: string;
}

export interface ScrapeResult {
  data: Record<string | number, TradingViewFinancialHistory>;
  incompleteTabs: string[];
}

// ============================================================================
// CONFIGURATION & METRIC MAPPINGS
// (Catatan: Semua kunci string menggunakan huruf kecil untuk pencocokan aman)
// ============================================================================

/** Pemetaan metrik rasio & statistik fundamental */
const STATS_MAPPING: Record<string, keyof TradingViewFinancialHistory> = {
  "return on equity %": "roe",
  "return on equity": "roe",
  "debt to equity ratio": "der",
  "price to book ratio": "pbv",
  "price to book": "pbv",
  "price to earnings ratio": "per",
  "price to earnings": "per",
};

/** Pemetaan metrik Laporan Laba Rugi (Income Statement) */
const INCOME_MAPPING: Record<string, keyof TradingViewFinancialHistory> = {
  "total revenue": "revenue",
  "total interest income": "revenue",
  "gross profit": "gross_profit",
  "operating income": "operating_income",
  "net income": "net_profit",
  "basic earnings per share (basic eps)": "eps",
  "average basic shares outstanding": "average_basic_shares_outstanding",
  ebitda: "ebitda",
  ebit: "ebit",
};

/** Pemetaan metrik Neraca Keuangan (Balance Sheet) */
const BALANCE_MAPPING: Record<string, keyof TradingViewFinancialHistory> = {
  "total assets": "total_assets",
  "total liabilities": "total_liabilities",
  "total equity": "total_equity",
  "total debt": "total_debt",
  "net debt": "net_debt",
};

/** Pemetaan metrik Arus Kas (Cash Flow) */
const CASH_FLOW_MAPPING: Record<string, keyof TradingViewFinancialHistory> = {
  "cash flow from operating activities": "cash_flow_operating",
  "cash flow from investing activities": "cash_flow_investing",
  "cash flow from financing activities": "cash_flow_financing",
  "free cash flow": "free_cash_flow",
};

/** Konfigurasi 4 tab laporan keuangan TradingView */
const TABS: TabConfig[] = [
  {
    suffix: "financials-statistics-and-ratios/?statistics-period=FY",
    mapping: STATS_MAPPING,
    waitSelector: '.container-v0BbAiJS[data-name="Return on equity %"]',
  },
  {
    suffix: "financials-income-statement/?statements-period=FY",
    mapping: INCOME_MAPPING,
    waitSelector:
      '.container-v0BbAiJS[data-name="Total revenue"], .container-v0BbAiJS[data-name="Total interest income"]',
  },
  {
    suffix: "financials-balance-sheet/?statements-period=FY",
    mapping: BALANCE_MAPPING,
    waitSelector: '.container-v0BbAiJS[data-name="Total assets"]',
  },
  {
    suffix: "financials-cash-flow/?statements-period=FY",
    mapping: CASH_FLOW_MAPPING,
    waitSelector: '.container-v0BbAiJS[data-name="Free cash flow"]',
  },
];

// ============================================================================
// UTILITY & PARSING HELPERS
// ============================================================================

/**
 * Mengonversi string nilai mentah TradingView menjadi angka numerik murni.
 * Mendukung pengenal skala besar (K, M, B, T) dan tanda minus Unicode (`−`).
 *
 * @param raw - String nilai mentah (misal: "1.25B", "-500.5M", "—").
 * @returns Nilai numerik terkonversi atau `null` jika kosong/tidak valid.
 */
export function parseTradingViewValue(
  raw: string | undefined | null,
): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\u200e\u200f\u202a-\u202e\u00a0]/g, "").trim();
  if (!cleaned || cleaned === "—" || cleaned === "-" || cleaned === "") {
    return null;
  }
  const isNegative = cleaned.startsWith("−") || cleaned.startsWith("-");
  const withoutSign = cleaned.replace(/^[−-]/, "").trim();
  const match = /^([\d.,]+)\s*([KMBT])?$/i.exec(withoutSign);

  if (!match) {
    const plain = parseFloat(withoutSign.replace(/,/g, ""));
    if (isNaN(plain)) return null;
    return isNegative ? -plain : plain;
  }
  const numPartText = match[1];
  if (!numPartText) return null;
  const numPart = parseFloat(numPartText.replace(/,/g, ""));
  if (isNaN(numPart)) return null;
  const suffix = match[2]?.toUpperCase();
  const multiplier =
    suffix === "K"
      ? 1e3
      : suffix === "M"
        ? 1e6
        : suffix === "B"
          ? 1e9
          : suffix === "T"
            ? 1e12
            : 1;
  const value = numPart * multiplier;
  return parseFloat((isNegative ? -value : value).toFixed(4));
}

/**
 * Normalisasi teks header periode laporan menjadi kunci yang konsisten (Tahun / "current" / "ttm").
 */
function normalizePeriodKey(rawYearText: string): FinancialPeriodKey {
  const text = rawYearText.trim().toLowerCase();
  if (text.includes("current")) return "current";
  if (text.includes("ttm")) return "ttm";
  const yearMatch = /(\d{4})/.exec(text);
  const yearDigits = yearMatch?.[1];
  return yearDigits ? parseInt(yearDigits, 10) : (text as unknown as number);
}

// ============================================================================
// CHEERIO HTML PARSER ENGINE
// ============================================================================

/**
 * Ekstrak daftar periode waktu (kolom header) dari DOM laporan keuangan.
 */
function parsePeriodHeaders($: cheerio.CheerioAPI): FinancialPeriodKey[] {
  const periods: FinancialPeriodKey[] = [];
  const $header = $(".values-t0cbVcS5")
    .filter((_, el) => !$(el).hasClass("values-v0BbAiJS"))
    .first();

  $header.find(".container-FFNwcYy3").each((_, col) => {
    const rawText = $(col).text().trim();
    if (rawText) {
      periods.push(normalizePeriodKey(rawText));
    }
  });
  return periods;
}

/**
 * Ekstrak judul metrik dari baris tabel TradingView.
 * Mengutamakan atribut `data-name` agar tahan terhadap perubahan CSS class.
 */
function parseRowTitle($row: cheerio.Cheerio<any>): string {
  // Strategi Utama: Ambil langsung dari atribut data-name
  const dataName = $row.attr("data-name")?.trim();
  if (dataName) return dataName;

  // Fallback 1: Text dari class highlightText
  const fromHighlight = $row
    .find(".titleColumn-v0BbAiJS .highlightText-v0BbAiJS")
    .first()
    .text()
    .trim();
  if (fromHighlight) return fromHighlight;

  // Fallback 2: Text dari class titleText
  return $row
    .find(".titleColumn-v0BbAiJS .titleText-v0BbAiJS")
    .first()
    .text()
    .trim();
}

/**
 * Membedah isi tabel HTML dan memasukkan data metrik ke dalam objek `masterHistory`.
 */
function extractTableData(
  html: string,
  metricMapping: Record<string, keyof TradingViewFinancialHistory>,
  masterHistory: Record<string | number, TradingViewFinancialHistory>,
) {
  const $ = cheerio.load(html);
  const periods = parsePeriodHeaders($);

  for (const period of periods) {
    if (!masterHistory[period]) {
      masterHistory[period] = {};
    }
  }

  $(".container-v0BbAiJS[data-name]").each((_, rowEl) => {
    const $row = $(rowEl);
    const title = parseRowTitle($row);

    const normalizedTitle = title.toLowerCase().trim().replace(/\s+/g, " ");
    const targetKey = metricMapping[normalizedTitle];
    if (!targetKey) return;

    const $columns = $row.find(".values-v0BbAiJS .container-FFNwcYy3");
    $columns.each((colIdx, colEl) => {
      const period = periods[colIdx];
      if (period === undefined) return;
      const periodBucket = masterHistory[period];
      if (!periodBucket) return;

      const $col = $(colEl);
      const isLocked = $col.find(".lockButton-a0w1cyOL").length > 0;
      const value = isLocked
        ? null
        : parseTradingViewValue($col.find(".value-FFNwcYy3").first().text());

      periodBucket[targetKey] =
        value !== null ? parseFloat(value.toFixed(2)) : null;
    });
  });
}

/**
 * Memeriksa apakah setidaknya satu metrik pada tab tertentu berhasil terekstrak ke dalam `masterHistory`.
 */
function hasDataInTab(
  master: Record<string | number, TradingViewFinancialHistory>,
  mapping: Record<string, keyof TradingViewFinancialHistory>,
): boolean {
  const metricsInTab = Object.values(mapping);
  return Object.values(master).some((periodData) =>
    metricsInTab.some(
      (metric) =>
        periodData[metric] !== null && periodData[metric] !== undefined,
    ),
  );
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Orchestrator Utama: Membuka 4 tab laporan keuangan TradingView secara paralel,
 * memeriksa proteksi Captcha, mengekstraksi data fundamental historis, dan
 * mengembalikan hasil terstruktur.
 *
 * @param code - Kode emiten saham (misal: "BBCA", "IHSG").
 * @param context - Instance `BrowserContext` Playwright aktif.
 * @returns Objek `ScrapeResult` jika berhasil, atau `false` jika seluruh tab gagal.
 */
export async function scrapeFundamentalTradingView(
  code: string,
  context: any,
): Promise<ScrapeResult | false> {
  const symbol =
    code.toUpperCase() === "IHSG"
      ? "IDX-COMPOSITE"
      : `IDX-${code.toUpperCase()}`;
  const baseUrl = `https://www.tradingview.com/symbols/${symbol}`;
  const masterHistory: Record<string | number, TradingViewFinancialHistory> =
    {};

  // Pelacakan status hasil eksekusi per tab
  const tabStatus: { tab: string; state: "success" | "error" | "empty" }[] =
    TABS.map((t) => ({
      tab: t.suffix,
      state: "error",
    }));

  try {
    // Membuka dan mengeksekusi 4 tab laporan keuangan secara terpisah namun paralel
    await Promise.allSettled(
      TABS.map(async (tab, index) => {
        const page = await context.newPage();
        try {
          // Beri jeda kecil antar tab agar tidak memicu deteksi bot agresif
          await new Promise((r) => setTimeout(r, index * 500));
          const response = await page.goto(`${baseUrl}/${tab.suffix}`, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          });

          // 1. Deteksi Proteksi Captcha / Cloudflare sebelum menunggu selector
          const captchaCheck = await checkIfBlockedByCaptcha(
            page,
            response?.status(),
          );

          if (captchaCheck.isBlocked) {
            safeLog(
              "warn",
              `[Scraper] [${code}] Tab (${tab.suffix}) terhalang: ${captchaCheck.reason}`,
            );
            return;
          }

          // 2. Cek validitas status respons HTTP
          if (!response || !response.ok()) {
            return;
          }

          // 3. Tunggu hidrasi elemen tabel utama (Timeout 8s)
          await page
            .waitForSelector(tab.waitSelector, { timeout: 8000 })
            .catch(() => {});
          const html = await page.content();

          // 4. Ekstrak data tabel ke masterHistory
          extractTableData(html, tab.mapping, masterHistory);

          if (hasDataInTab(masterHistory, tab.mapping)) {
            tabStatus[index]!.state = "success";
          } else {
            tabStatus[index]!.state = "empty";
          }
        } catch (tabErr) {
          // Kesalahan tab akan ditangkap di sini, state tetap 'error'
        } finally {
          await page.close().catch(() => {});
        }
      }),
    );

    // Kumpulkan daftar tab yang tidak berhasil diambil
    const incompleteTabs = tabStatus
      .filter((s) => s.state !== "success")
      .map((s) => s.tab);

    // Jika seluruh tab gagal, anggap proses scraping emiten ini gagal
    if (incompleteTabs.length === TABS.length) {
      safeLog("warn", `[Scraper] Seluruh tab gagal untuk [${code}]`);
      return false;
    }

    // Pembersihan entri periode yang seluruh metriknya kosong (null)
    const cleanedHistory: Record<string | number, TradingViewFinancialHistory> =
      {};
    for (const [period, metrics] of Object.entries(masterHistory)) {
      if (Object.values(metrics).some((val) => val !== null)) {
        cleanedHistory[period] = metrics;
      }
    }

    if (Object.keys(cleanedHistory).length === 0) return false;

    return { data: cleanedHistory, incompleteTabs };
  } catch (error) {
    safeLog("error", `[Scraper] Master Error untuk ${code}: ${error}`);
    return false;
  }
}
