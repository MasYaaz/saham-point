import * as cheerio from "cheerio";
import type { TradingViewFinancialHistory } from "../../types";
import { safeLog } from "../../cli/helper/safeLog";
import { checkIfBlockedByCaptcha } from "../../utils/scrapper/browser";

type FinancialPeriodKey = number | "current" | "ttm";

interface TabConfig {
  suffix: string;
  mapping: Record<string, keyof TradingViewFinancialHistory>;
  waitSelector: string;
}

// ============================================================================
// 2. CONFIGURATION & METRIC MAPPINGS (Semua menggunakan lowercase untuk kecocokan aman)
// ============================================================================
const STATS_MAPPING: Record<string, keyof TradingViewFinancialHistory> = {
  "return on equity %": "roe",
  "return on equity": "roe",
  "debt to equity ratio": "der",
  "price to book ratio": "pbv",
  "price to book": "pbv",
  "price to earnings ratio": "per",
  "price to earnings": "per",
};

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

const BALANCE_MAPPING: Record<string, keyof TradingViewFinancialHistory> = {
  "total assets": "total_assets",
  "total liabilities": "total_liabilities",
  "total equity": "total_equity",
  "total debt": "total_debt",
  "net debt": "net_debt",
};

const CASH_FLOW_MAPPING: Record<string, keyof TradingViewFinancialHistory> = {
  "cash flow from operating activities": "cash_flow_operating",
  "cash flow from investing activities": "cash_flow_investing",
  "cash flow from financing activities": "cash_flow_financing",
  "free cash flow": "free_cash_flow",
};

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
// 3. UTILITIES & HELPERS
// ============================================================================
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

function normalizePeriodKey(rawYearText: string): FinancialPeriodKey {
  const text = rawYearText.trim().toLowerCase();
  if (text.includes("current")) return "current";
  if (text.includes("ttm")) return "ttm";
  const yearMatch = /(\d{4})/.exec(text);
  const yearDigits = yearMatch?.[1];
  return yearDigits ? parseInt(yearDigits, 10) : (text as unknown as number);
}

// ============================================================================
// 4. PARSER CORE ENGINE (CHEERIO)
// ============================================================================
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

function parseRowTitle($row: cheerio.Cheerio<any>): string {
  // Strategi Utama: Ambil langsung dari atribut data-name (jauh lebih aman dari perubahan class HTML)
  const dataName = $row.attr("data-name")?.trim();
  if (dataName) return dataName;

  // Fallback alternatif jika atribut data-name kosong
  const fromHighlight = $row
    .find(".titleColumn-v0BbAiJS .highlightText-v0BbAiJS")
    .first()
    .text()
    .trim();
  if (fromHighlight) return fromHighlight;
  return $row
    .find(".titleColumn-v0BbAiJS .titleText-v0BbAiJS")
    .first()
    .text()
    .trim();
}

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

    // Normalisasi title menjadi lowercase dan hilangkan space berlebih sebelum dicocokkan
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

export interface ScrapeResult {
  data: Record<string | number, TradingViewFinancialHistory>;
  incompleteTabs: string[];
}

/**
 * Helper untuk mengecek apakah setidaknya satu metrik di tab ini terisi
 */
function hasDataInTab(
  master: Record<string | number, TradingViewFinancialHistory>,
  mapping: Record<string, keyof TradingViewFinancialHistory>,
): boolean {
  const metricsInTab = Object.values(mapping);
  // Cek apakah ada record di masterHistory yang memiliki setidaknya satu nilai dari mapping tab ini
  return Object.values(master).some((periodData) =>
    metricsInTab.some(
      (metric) =>
        periodData[metric] !== null && periodData[metric] !== undefined,
    ),
  );
}

// ============================================================================
// 5. MAIN ORCHESTRATOR
// ============================================================================
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

  // Pelacakan status per tab lebih detail
  const tabStatus: { tab: string; state: "success" | "error" | "empty" }[] =
    TABS.map((t) => ({
      tab: t.suffix,
      state: "error",
    }));

  try {
    await Promise.allSettled(
      TABS.map(async (tab, index) => {
        const page = await context.newPage();
        try {
          await new Promise((r) => setTimeout(r, index * 500));
          const response = await page.goto(`${baseUrl}/${tab.suffix}`, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          });

          // 🛡️ 1. DETEKSI CAPTCHA / CLOUDFLARE DI SINI (Sebelum waitForSelector)
          const captchaCheck = await checkIfBlockedByCaptcha(
            page,
            response?.status(),
          );

          if (captchaCheck.isBlocked) {
            safeLog(
              "warn",
              `[Scraper] [${code}] Tab (${tab.suffix}) terhalang: ${captchaCheck.reason}`,
            );
            return; // Batalkan proses tab ini (state tetap 'error')
          }

          // Cek jika halaman tidak ditemukan atau error
          if (!response || !response.ok()) {
            return; // state tetap 'error'
          }

          // Tunggu hidrasi element
          await page
            .waitForSelector(tab.waitSelector, { timeout: 8000 })
            .catch(() => {});
          const html = await page.content();

          extractTableData(html, tab.mapping, masterHistory);

          if (hasDataInTab(masterHistory, tab.mapping)) {
            tabStatus[index]!.state = "success";
          } else {
            tabStatus[index]!.state = "empty";
          }
        } catch (tabErr) {
          // state tetap 'error'
        } finally {
          await page.close().catch(() => {});
        }
      }),
    );

    // Kumpulkan tab yang gagal/tidak lengkap
    const incompleteTabs = tabStatus
      .filter((s) => s.state !== "success")
      .map((s) => s.tab);

    // Jika semua tab gagal, return false
    if (incompleteTabs.length === TABS.length) {
      safeLog("warn", `[Scraper] Seluruh tab gagal untuk [${code}]`);
      return false;
    }

    // Pembersihan data kosong
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
