import { YAHOO_HEADERS } from "../../config";
import type { YahooFinancialHistory } from "../../types";
import * as cheerio from "cheerio";
import { parseRawMoney } from "../../utils/parseMoney";

// ============================================================================
// 1. UTILITIES & HELPERS
// ============================================================================

async function getYearlyRate(year: number): Promise<number> {
  const rates: Record<number, number> = {
    2026: 16200,
    2025: 16000,
    2024: 15800,
    2023: 15500,
    2022: 15700,
    2021: 14200,
  };
  return rates[year] || 16000;
}

// ============================================================================
// 2. NETWORK FETCHERS
// ============================================================================

async function fetchYahooHtmlPages(symbol: string): Promise<string[]> {
  const urls = [
    `https://finance.yahoo.com/quote/${symbol}/financials`,
    `https://finance.yahoo.com/quote/${symbol}/balance-sheet`,
    `https://finance.yahoo.com/quote/${symbol}/cash-flow`,
  ];

  const htmlSections: string[] = [];
  for (const url of urls) {
    const res = await fetch(url, { headers: YAHOO_HEADERS });
    htmlSections.push(res.ok ? await res.text() : "");
    const delay = Math.floor(Math.random() * (100 - 50 + 1)) + 50;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return htmlSections;
}

async function fetchHistoricalPrices(symbol: string) {
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5y&interval=1d`;
  const chartRes = await fetch(chartUrl, {
    headers: {
      "User-Agent": YAHOO_HEADERS["User-Agent"],
      Referer: "https://finance.yahoo.com/",
    },
  });

  const historicalPrices: Record<number, number> = {};
  let livePrice = 0;

  if (chartRes.ok) {
    const chartBody: any = await chartRes.json();
    const result = chartBody?.chart?.result?.[0];

    if (result) {
      livePrice = parseFloat(result.meta?.regularMarketPrice ?? 0);
      const timestamps = (result.timestamp as number[]) ?? [];
      const closePrices =
        (result.indicators?.quote?.[0]?.close as (number | null)[]) ?? [];

      timestamps.forEach((ts, idx) => {
        const price = closePrices[idx];
        if (typeof price === "number" && price > 0) {
          const year = new Date(ts * 1000).getFullYear();
          historicalPrices[year] = price;
        }
      });
    }
  }

  return { historicalPrices, livePrice };
}

// ============================================================================
// 3. DATA PARSERS (DOM)
// ============================================================================

async function parseYahooFinancialTables(htmlSections: string[]) {
  const firstValidHtml = htmlSections.find((html) => html.length > 0) || "";
  const $global = cheerio.load(firstValidHtml);
  const globalCurrencyText = $global("span")
    .filter((_, el) => $global(el).text().includes("Currency in"))
    .text();
  const isUSD = globalCurrencyText.includes("USD");

  const finalHistory: Record<number, any> = {};
  const metricMapping: Record<string, string> = {
    "Total Revenue": "revenue",
    "Net Income Common Stockholders": "net_profit",
    "Operating Income": "operating_income",
    "Free Cash Flow": "free_cash_flow",
    "Capital Expenditure": "capital_expenditure",
    "Interest Expense": "interest_expense",
    "Basic EPS": "eps",
    EBITDA: "ebitda",
    "Total Assets": "total_assets",
    "Total Equity Gross Minority Interest": "total_equity",
    "Total Debt": "total_debt",
    "End Cash Position": "cash",
    "Ordinary Shares Number": "shares_outstanding",
  };

  for (let i = 0; i < 3; i++) {
    const html = htmlSections[i];
    if (!html) continue;

    const $ = cheerio.load(html);
    const pageCurrencyText = $("span")
      .filter((_, el) => $(el).text().includes("Currency in"))
      .text();
    const isThousands = pageCurrencyText.toLowerCase().includes("thousands");

    const currentTablePeriods: { index: number; year: number | string }[] = [];

    $(".tableHeader .row .column").each((idx, el) => {
      const text = $(el).text()?.trim() ?? "";
      if (!text || text === "Breakdown") return;
      const yearMatch = /(\d{4})/.exec(text);
      if (yearMatch && yearMatch[1]) {
        currentTablePeriods.push({ index: idx, year: parseInt(yearMatch[1]) });
      } else if (text.toUpperCase() === "TTM") {
        currentTablePeriods.push({ index: idx, year: "TTM" });
      }
    });

    const yearMultipliers: Record<number, number> = {};
    for (const col of currentTablePeriods) {
      if (col.year !== "TTM") {
        const y = col.year as number;
        yearMultipliers[y] = isUSD ? await getYearlyRate(y) : 1;
      }
    }

    $(".tableBody .row").each((_, rowEl) => {
      const title = $(rowEl).find(".rowTitle").text().trim();
      const targetKey = metricMapping[title];

      if (targetKey) {
        const columns = $(rowEl).find(".column");

        currentTablePeriods.forEach((col) => {
          if (col.year === "TTM") return;
          const year = col.year as number;

          const rawText = $(columns[col.index]).text().trim();
          const cleaned = parseRawMoney(rawText, isThousands);

          const multiplier = yearMultipliers[year] || 1;
          const convertedValue =
            targetKey === "shares_outstanding"
              ? cleaned
              : parseFloat((cleaned * multiplier).toFixed(2));

          if (!finalHistory[year]) {
            finalHistory[year] = {
              revenue: "",
              net_profit: "",
              eps: 0,
              ebitda: 0,
              total_assets: 0,
              total_equity: 0,
              total_debt: 0,
              cash: 0,
              roe: 0,
              der: 0,
              per: 0,
              pbv: 0,
              operating_income: 0,
              interest_expense: 0,
              capital_expenditure: 0,
              free_cash_flow: 0,
            };
          }

          if (targetKey === "revenue" || targetKey === "net_profit") {
            finalHistory[year][targetKey] = String(convertedValue);
          } else {
            finalHistory[year][targetKey] = convertedValue;
          }
        });
      }
    });
  }

  return { parsedData: finalHistory, isUSD };
}

// ============================================================================
// 4. BUSINESS LOGIC (RATIO CALCULATOR)
// ============================================================================

async function calculateFinancialRatios(
  parsedData: Record<number, any>,
  historicalPrices: Record<number, number>,
  livePrice: number,
  isUSD: boolean,
): Promise<Record<number, YahooFinancialHistory>> {
  const getEffectiveRate = async (year: number) =>
    isUSD ? await getYearlyRate(year) : 1;

  // Helper untuk pembulatan 2 angka
  const round2 = (num: number): number => parseFloat(num.toFixed(2));

  for (const [yearStr, values] of Object.entries(parsedData)) {
    const year = parseInt(yearStr);
    const historyYear = parsedData[year];
    const dynamicCurrencyMultiplier = await getEffectiveRate(year);

    const totalEquity = Number(values.total_equity ?? 0);
    const totalDebt = Number(values.total_debt ?? 0);
    const rawEps = Number(values.eps ?? 0);
    const netProfitRealNum = Number(values.net_profit ?? 0);
    const sharesOutstanding = Number(values.shares_outstanding ?? 0);

    // Hitung ROE dan DER
    historyYear.roe =
      totalEquity > 0 ? round2((netProfitRealNum / totalEquity) * 100) : 0;
    historyYear.der = totalEquity > 0 ? round2(totalDebt / totalEquity) : 0;

    const yearPrice =
      historicalPrices[year] && historicalPrices[year] > 0
        ? historicalPrices[year]
        : livePrice;

    if (yearPrice > 0 && totalEquity > 0 && netProfitRealNum !== 0) {
      if (sharesOutstanding > 0) {
        const rawCalculatedEps = netProfitRealNum / sharesOutstanding;
        const normalizedEps = rawCalculatedEps * dynamicCurrencyMultiplier;

        historyYear.eps = round2(normalizedEps);
        historyYear.per =
          historyYear.eps !== 0 ? round2(yearPrice / historyYear.eps) : 0;

        const bookValuePerShare =
          (totalEquity * dynamicCurrencyMultiplier) / sharesOutstanding;
        historyYear.pbv =
          bookValuePerShare > 0 ? round2(yearPrice / bookValuePerShare) : 0;
      } else {
        let normalizedEps = rawEps * dynamicCurrencyMultiplier;
        if (normalizedEps === 0) {
          const directionalPer = netProfitRealNum > 0 ? 15 : -15;
          normalizedEps = yearPrice / directionalPer;
        }

        historyYear.eps = round2(normalizedEps);
        historyYear.per =
          historyYear.eps !== 0 ? round2(yearPrice / historyYear.eps) : 0;

        const calculatedPbv = historyYear.per * (historyYear.roe / 100);
        historyYear.pbv = round2(calculatedPbv);
      }
    } else {
      historyYear.eps = 0;
      historyYear.per = 0;
      historyYear.pbv = 0;
    }

    delete historyYear.shares_outstanding;
  }

  return parsedData as Record<number, YahooFinancialHistory>;
}

// ============================================================================
// 5. MAIN ORCHESTRATOR (FUNGSI YANG DIPANGGIL DARI LUAR)
// ============================================================================

export async function scrapeFundamentalYahoo(
  code: string,
): Promise<Record<number, YahooFinancialHistory> | null> {
  const symbol =
    code.toUpperCase() === "IHSG" ? "^JKSE" : `${code.toUpperCase()}.JK`;

  try {
    // 1. Ambil HTML Pages (Network)
    const htmlSections = await fetchYahooHtmlPages(symbol);

    // 2. Parsing HTML ke Data Mentah (DOM/Cheerio)
    const { parsedData, isUSD } = await parseYahooFinancialTables(htmlSections);
    if (Object.keys(parsedData).length === 0) return null;

    // 3. Ambil Harga Saham (Network API)
    const { historicalPrices, livePrice } = await fetchHistoricalPrices(symbol);

    // 4. Kalkulasi Akhir & Formatting (Business Logic)
    const finalData = await calculateFinancialRatios(
      parsedData,
      historicalPrices,
      livePrice,
      isUSD,
    );
    return finalData;
  } catch (error) {
    console.error(`[Scraper] Yahoo Financials Scrape Error:`, error);
    return null;
  }
}
