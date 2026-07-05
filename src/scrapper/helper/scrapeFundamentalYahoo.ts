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

    const finalHistory: Record<
      number,
      YahooFinancialHistory & { shares_outstanding?: number }
    > = {};

    // Tambahkan TTM penampung khusus untuk membaca EPS TTM dari baris tabel jika dibutuhkan
    let ttmEpsRaw = 0;

    const metricMapping: Record<
      string,
      keyof YahooFinancialHistory | "shares_outstanding"
    > = {
      "Total Revenue": "revenue",
      "Net Income Common Stockholders": "net_profit",
      "Basic EPS": "eps",
      EBITDA: "ebitda",
      "Total Assets": "total_assets",
      "Total Equity Gross Minority Interest": "total_equity",
      "Total Debt": "total_debt",
      "Cash And Cash Equivalents": "cash",
      "Ordinary Shares Number": "shares_outstanding",
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
            const rawText = $(columns[col.index]).text().trim();
            const cleaned = cleanValue(rawText);

            if (col.year === "TTM") {
              // Tangkap EPS TTM secara khusus sebagai jangkar penentu basis mata uang laporan keuangan
              if (targetKey === "eps") {
                ttmEpsRaw = cleaned;
              }
              return;
            }

            const year = col.year as number;
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
              };
            }

            if (targetKey === "revenue" || targetKey === "net_profit") {
              finalHistory[year][targetKey] = String(cleaned);
            } else {
              (finalHistory[year] as any)[targetKey] = cleaned;
            }
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
    let trailingPeggedPer = 0; // fallback PER pasar bawaan Yahoo meta data jika tersedia

    if (chartRes.ok) {
      const chartBody: any = await chartRes.json();
      const result = chartBody?.chart?.result?.[0];
      if (result) {
        const timestamps = (result.timestamp as number[]) ?? [];
        const closePrices =
          (result.indicators?.quote?.[0]?.close as (number | null)[]) ?? [];
        livePrice = parseFloat(result.meta?.regularMarketPrice ?? 0);
        trailingPeggedPer = parseFloat(result.meta?.trailingPeggedPer ?? 0);

        timestamps.forEach((ts, idx) => {
          const price = closePrices[idx];
          if (typeof price === "number" && price > 0) {
            const date = new Date(ts * 1000);
            const year = date.getFullYear();
            historicalPrices[year] = price;
          }
        });
      }
    }

    // --- LOGIKA UTAMA: KALKULASI DINAMIS EXCH_RATE MULTIPLIER ---
    let dynamicCurrencyMultiplier = 1;

    // Jika total_equity rata-rata emiten terdeteksi bernilai kecil (< 500 Miliar),
    // hampir dipastikan ini adalah emiten bermata uang laporan USD (seperti AMMN).
    const sampleYear = Object.keys(finalHistory)[0];
    const sampleEquity = sampleYear
      ? Number(finalHistory[parseInt(sampleYear)]?.total_equity ?? 0)
      : 0;

    if (sampleEquity > 0 && sampleEquity < 500_000_000_000) {
      // Kita hitung implied currency exchange rate menggunakan triangulasi data:
      if (livePrice > 0 && ttmEpsRaw > 0) {
        // Jika ada data PER pasar ter-pegged, gunakan untuk mencari kurs murni
        const targetPer = trailingPeggedPer > 0 ? trailingPeggedPer : 15; // default 15x market standard
        dynamicCurrencyMultiplier = livePrice / ttmEpsRaw / (targetPer / 15);
      }

      // Batasan aman (sanity check): pastikan hasil pembagian dinamis berada di range logis nilai kurs USD/IDR dunia harian
      if (
        dynamicCurrencyMultiplier < 10000 ||
        dynamicCurrencyMultiplier > 22000
      ) {
        dynamicCurrencyMultiplier = 16100; // nilai jangkar aman darurat jika data TTM blackout
      }
    }

    // --- PROSES KALKULASI RASIO MANDIRI LUAR DALAM ---
    // --- PROSES KALKULASI RASIO MANDIRI LUAR DALAM ---
    for (const [yearStr, values] of Object.entries(finalHistory)) {
      const year = parseInt(yearStr);
      const historyYear = finalHistory[year];
      if (!historyYear) continue;

      const totalEquity = Number(values.total_equity ?? 0);
      const totalDebt = Number(values.total_debt ?? 0);
      const rawEps = Number(values.eps ?? 0);
      const netProfitRealNum = Number(values.net_profit ?? 0);
      const sharesOutstanding = Number(values.shares_outstanding ?? 0);

      // 1. Profitabilitas & Solvabilitas Murni
      historyYear.roe =
        totalEquity > 0
          ? parseFloat(((netProfitRealNum / totalEquity) * 100).toFixed(2))
          : 0;
      historyYear.der =
        totalEquity > 0 ? parseFloat((totalDebt / totalEquity).toFixed(2)) : 0;

      // Ambil harga bursa (IDR)
      const yearPrice =
        historicalPrices[year] && historicalPrices[year] > 0
          ? historicalPrices[year]
          : livePrice;

      // PERBAIKAN: Izinkan kalkulasi berjalan walaupun net profit bernilai negatif (rugi)
      if (yearPrice > 0 && totalEquity > 0 && netProfitRealNum !== 0) {
        if (sharesOutstanding > 0) {
          // Hitung EPS Rupiah dari pembagian Net Profit dan Shares Outstanding
          const rawCalculatedEps = netProfitRealNum / sharesOutstanding;
          const normalizedEps = rawCalculatedEps * dynamicCurrencyMultiplier;

          historyYear.eps = normalizedEps;

          // FIX PER: Bisa menghasilkan nilai negatif jika emiten sedang rugi harian
          historyYear.per =
            normalizedEps !== 0
              ? parseFloat((yearPrice / normalizedEps).toFixed(2))
              : 0;

          // FIX PBV: Hitung langsung dari Book Value per Share riil untuk memutus distorsi rumus triangulasi PER
          const bookValuePerShare =
            (totalEquity * dynamicCurrencyMultiplier) / sharesOutstanding;
          historyYear.pbv =
            bookValuePerShare > 0
              ? parseFloat((yearPrice / bookValuePerShare).toFixed(2))
              : 0;
        } else {
          // FALLBACK JIKA BARIS SHARES OUTSTANDING ABSEN
          let normalizedEps = rawEps * dynamicCurrencyMultiplier;

          if (normalizedEps === 0) {
            // Jika rawEps bawaan 0 tapi untung/rugi ada, gunakan PE bayangan 15x (atau -15x jika rugi)
            const directionalPer = netProfitRealNum > 0 ? 15 : -15;
            normalizedEps = yearPrice / directionalPer;
          }

          historyYear.eps = normalizedEps;
          historyYear.per = parseFloat((yearPrice / normalizedEps).toFixed(2));

          // Gunakan triangulasi hanya jika terpaksa karena tidak punya shares outstanding
          const calculatedPbv = historyYear.per * (historyYear.roe / 100);
          historyYear.pbv =
            calculatedPbv > 0 ? parseFloat(calculatedPbv.toFixed(2)) : 0;
        }
      } else {
        historyYear.eps = 0;
        historyYear.per = 0;
        historyYear.pbv = 0;
      }

      // Bersihkan temporary key agar database tetap ramping
      delete (historyYear as any).shares_outstanding;
    }

    return Object.keys(finalHistory).length > 0 ? (finalHistory as any) : null;
  } catch (error) {
    console.error(`[Scraper] Yahoo Financials Scrape Error:`, error);
    return null;
  }
}
