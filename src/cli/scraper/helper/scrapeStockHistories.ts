import * as cheerio from "cheerio";
import type { TradingViewFinancialHistory } from "../../../types";
import { safeLog } from "../../../utils/safeLog";
import { checkIfBlockedByCaptcha } from "../../../utils/scrapper/browserManager";
import { parseRawData } from "../../../utils/scrapper/parseRawData";

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
    waitSelector:
      '[data-name="Return on equity %"], [data-name="Return on equity"]',
  },
  {
    suffix: "financials-income-statement/?statements-period=FY",
    mapping: INCOME_MAPPING,
    waitSelector:
      '[data-name="Total revenue"], [data-name="Total interest income"]',
  },
  {
    suffix: "financials-balance-sheet/?statements-period=FY",
    mapping: BALANCE_MAPPING,
    waitSelector: '[data-name="Total assets"]',
  },
  {
    suffix: "financials-cash-flow/?statements-period=FY",
    mapping: CASH_FLOW_MAPPING,
    waitSelector: '[data-name="Free cash flow"]',
  },
];

// ============================================================================
// UTILITY & PARSING HELPERS
// ============================================================================

function normalizePeriodKey(rawYearText: string): FinancialPeriodKey | null {
  const text = rawYearText.trim().toLowerCase();
  if (text.includes("current")) return "current";
  if (text.includes("ttm")) return "ttm";

  const yearMatch = /(?:^|\s)(19\d\d|20\d\d)(?:\s|$)/.exec(text);
  if (yearMatch?.[1]) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 1990 && year <= 2035) return year;
  }
  return null;
}

// ============================================================================
// CHEERIO HTML PARSER ENGINE
// ============================================================================

function parsePeriodHeaders($: cheerio.CheerioAPI): FinancialPeriodKey[] {
  let periods: FinancialPeriodKey[] = [];

  $("div").each((_, el) => {
    const $children = $(el).children();
    if ($children.length < 3) return;

    const candidatePeriods: FinancialPeriodKey[] = [];
    $children.each((_, child) => {
      const rawText = $(child).text().trim();
      const key = normalizePeriodKey(rawText);
      if (key !== null) {
        candidatePeriods.push(key);
      }
    });

    if (
      candidatePeriods.length >= 3 &&
      candidatePeriods.length >= Math.floor($children.length * 0.7) &&
      candidatePeriods.length > periods.length
    ) {
      periods = candidatePeriods;
    }
  });

  return periods;
}

function extractTableData(
  html: string,
  metricMapping: Record<string, keyof TradingViewFinancialHistory>,
  masterHistory: Record<string | number, TradingViewFinancialHistory>,
) {
  const $ = cheerio.load(html);
  const periods = parsePeriodHeaders($);

  if (periods.length === 0) return;

  for (const period of periods) {
    if (!masterHistory[period]) {
      masterHistory[period] = {};
    }
  }

  $("[data-name]").each((_, rowEl) => {
    const $row = $(rowEl);
    const title = $row.attr("data-name")?.trim();
    if (!title) return;

    const normalizedTitle = title.toLowerCase().trim().replace(/\s+/g, " ");
    const targetKey = metricMapping[normalizedTitle];
    if (!targetKey) return;

    const $valuesArea = $row
      .children()
      .filter((_, el) => $(el).children().length === periods.length)
      .first();

    const $columns = $valuesArea.children();

    $columns.each((colIdx, colEl) => {
      const period = periods[colIdx];
      if (period === undefined) return;

      const periodBucket = masterHistory[period];
      if (!periodBucket) return;

      const $col = $(colEl);

      const isLocked =
        $col.find('button[title*="Upgrade"]').length > 0 ||
        $col.find('button[class*="lock"]').length > 0 ||
        ($col.find("svg").length > 0 && !$col.text().match(/\d/));

      const cellText = $col.text().trim();
      const value = isLocked ? null : parseRawData(cellText);

      periodBucket[targetKey] =
        value !== null ? parseFloat(value.toFixed(2)) : null;
    });
  });
}

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

          if (!response || !response.ok()) {
            return;
          }

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
          // Handled
        } finally {
          await page.close().catch(() => {});
        }
      }),
    );

    const incompleteTabs = tabStatus
      .filter((s) => s.state !== "success")
      .map((s) => s.tab);

    if (incompleteTabs.length === TABS.length) {
      safeLog("warn", `[Scraper] Seluruh tab gagal untuk [${code}]`);
      return false;
    }

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
