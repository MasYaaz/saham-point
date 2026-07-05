import { YAHOO_HEADERS } from "../../config";
import type { YahooFinancialHistory } from "../../types";
import * as cheerio from "cheerio";

/**
 * 5. CORE PARSER & SCRAPER GABUNGAN YAHOO FINANCE (LANGSUNG SCRAPE PER & PBV HISTORIS)
 */
export async function scrapeFundamentalYahoo(
  code: string,
): Promise<Record<number, YahooFinancialHistory> | null> {
  const symbol =
    code.toUpperCase() === "IHSG" ? "^JKSE" : `${code.toUpperCase()}.JK`;

  // Cukup fetch 3 halaman laporan keuangan utama (Halaman key-statistics dibuang)
  const urls = [
    `https://finance.yahoo.com/quote/${symbol}/financials`,
    `https://finance.yahoo.com/quote/${symbol}/balance-sheet`,
    `https://finance.yahoo.com/quote/${symbol}/cash-flow`,
  ];

  try {
    const htmlSections: string[] = [];
    for (const url of urls) {
      const res = await fetch(url, { headers: YAHOO_HEADERS });
      const htmlText = res.ok ? await res.text() : "";
      htmlSections.push(htmlText);
      const delay = Math.floor(Math.random() * (100 - 50 + 1)) + 50;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const finalHistory: Record<number, YahooFinancialHistory> = {};
    const metricMapping: Record<string, keyof YahooFinancialHistory> = {
      "Total Revenue": "revenue",
      "Net Income Common Stockholders": "net_profit",
      "Basic EPS": "eps",
      EBITDA: "ebitda",
      "Total Assets": "total_assets",
      "Total Equity Gross Minority Interest": "total_equity",
      "Total Debt": "total_debt",
      "Cash And Cash Equivalents": "cash",
    };

    function cleanValue(raw: string): number {
      const cleanStr = raw.trim().replace(/,/g, "");
      if (cleanStr === "--" || cleanStr === "") return 0;
      if (cleanStr.endsWith("T"))
        return parseFloat(cleanStr) * 1_000_000_000_000;
      if (cleanStr.endsWith("B")) return parseFloat(cleanStr) * 1_000_000_000;
      if (cleanStr.endsWith("M")) return parseFloat(cleanStr) * 1_000_000;
      return parseFloat(cleanStr);
    }

    // Loop 1 & 2: Membaca Laporan Keuangan (Halaman 1, 2, dan 3)
    for (let i = 0; i < 3; i++) {
      const html = htmlSections[i];
      if (!html) continue;
      const $ = cheerio.load(html);
      const currentTablePeriods: { index: number; year: number | string }[] =
        [];

      $(".tableHeader .row .column").each((idx, el) => {
        const text = $(el).text()?.trim() ?? "";
        if (!text || text === "Breakdown") return;

        const yearMatch = /(\d{4})/.exec(text);
        if (yearMatch && yearMatch[1]) {
          currentTablePeriods.push({
            index: idx,
            year: parseInt(yearMatch[1]),
          });
        } else if (text.toUpperCase() === "TTM") {
          currentTablePeriods.push({ index: idx, year: "TTM" });
        }
      });

      $(".tableBody .row").each((_, rowEl) => {
        const title = $(rowEl).find(".rowTitle").text().trim();
        const targetKey = metricMapping[title];

        if (targetKey) {
          const columns = $(rowEl).find(".column");
          currentTablePeriods.forEach((col) => {
            if (col.year === "TTM") return;
            const year = col.year as number;
            const rawText = $(columns[col.index]).text().trim();

            if (!finalHistory[year]) finalHistory[year] = {};
            finalHistory[year][targetKey] = cleanValue(rawText) as any;
          });
        }
      });
    }

    if (Object.keys(finalHistory).length === 0) return null;

    // --- AMBIL DATA HARGA HISTORIS AKHIR TAHUN DARI API CHART YAHOO ---
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
        const timestamps = (result.timestamp as number[]) ?? [];
        const closePrices =
          (result.indicators?.quote?.[0]?.close as (number | null)[]) ?? [];
        livePrice = parseFloat(result.meta?.regularMarketPrice ?? 0);

        // Petakan stempel waktu ke masing-masing tahun untuk mencari harga penutupan terakhir di tahun tersebut
        timestamps.forEach((ts, idx) => {
          const price = closePrices[idx];

          // Perbaikan: Pastikan price didefinisikan (bukan undefined/null) dan tipenya adalah number murni
          if (typeof price === "number" && price > 0) {
            const date = new Date(ts * 1000);
            const year = date.getFullYear();

            // Simpan terus harga terbaru di tahun tersebut (otomatis menangkap hari bursa terakhir di bulan Desember)
            historicalPrices[year] = price;
          }
        });
      }
    }

    // --- PROSES KALKULASI RASIO MANDIRI LUAR DALAM ---
    for (const [yearStr, values] of Object.entries(finalHistory)) {
      const year = parseInt(yearStr);
      const historyYear = finalHistory[year];
      if (!historyYear) continue;

      const totalEquity = values.total_equity ?? 0;
      const totalDebt = values.total_debt ?? 0;
      const eps = values.eps ?? 0;
      const netProfitRealNum = (values.net_profit as any) ?? 0;

      // 1. Profitabilitas & Solvabilitas Dasar
      historyYear.roe =
        totalEquity > 0
          ? parseFloat(((netProfitRealNum / totalEquity) * 100).toFixed(2))
          : 0;
      historyYear.der =
        totalEquity > 0 ? parseFloat((totalDebt / totalEquity).toFixed(2)) : 0;

      // 2. Valuasi Pasar (PER & PBV) Menggunakan Harga Historis Akhir Tahun Bersangkutan
      // Jika tahun tersebut adalah tahun berjalan dan data historis akhir tahun belum ada, gunakan livePrice
      const yearPrice =
        historicalPrices[year] && historicalPrices[year] > 0
          ? historicalPrices[year]
          : livePrice;

      if (yearPrice > 0) {
        // PER = Harga Saham / EPS
        historyYear.per =
          eps > 0 ? parseFloat((yearPrice / eps).toFixed(2)) : 0;

        // PBV = Harga Saham / (Total Equity / Jumlah Saham)
        // Nilai BV (Book Value) didekati via rumus: Total Equity / (Net Profit / EPS)
        if (totalEquity > 0 && netProfitRealNum !== 0 && eps > 0) {
          const calculatedShares = netProfitRealNum / eps;
          const bookValuePerShare = totalEquity / calculatedShares;
          historyYear.pbv =
            bookValuePerShare > 0
              ? parseFloat((yearPrice / bookValuePerShare).toFixed(2))
              : 0;
        } else {
          historyYear.pbv = 0;
        }
      } else {
        historyYear.per = 0;
        historyYear.pbv = 0;
      }
    }

    return Object.keys(finalHistory).length > 0 ? finalHistory : null;
  } catch (error) {
    console.error(`[Scraper] Yahoo Financials Scrape Error:`, error);
    return null;
  }
}
