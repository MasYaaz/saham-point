import { YAHOO_HEADERS } from "../../config";
import db from "../../db";
import type { EmitenItem, YahooProfileData } from "../../types";
import { scrapeFundamentalYahoo } from "./scrapeFundamentalYahoo";
import { scrapeProfileYahoo } from "./scrapeProfileYahoo";

/**
 * 4. Fungsi Sinkronisasi Data Fundamental & Histori Multi-Tahun
 */
export async function updateFundamental(code: string): Promise<boolean> {
  const stock = db
    .query("SELECT * FROM emiten WHERE code = ? LIMIT 1")
    .get(code) as EmitenItem | undefined;

  if (!stock) return false;
  const symbol = `${code.toUpperCase()}.JK`;
  const nowStr = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  )
    .toISOString()
    .replace("T", " ")
    .substring(0, 19);

  // Flag untuk mendeteksi apakah minimal ada salah satu data yang berhasil diproses
  let isProfileSuccess = false;
  let isFundamentalSuccess = false;

  // ==========================================
  // TAHAP 1: FETCH & UPDATE DATA PROFIL
  // ==========================================
  let profileData: YahooProfileData | null = null;
  try {
    const profileResponse = await fetch(
      `https://finance.yahoo.com/quote/${symbol}`,
      { headers: YAHOO_HEADERS },
    );

    if (profileResponse.ok) {
      const profileHtml = await profileResponse.text();
      profileData = scrapeProfileYahoo(profileHtml);

      if (profileData) {
        const divYield =
          profileData.last_dividend > 0 && stock.last_price > 0
            ? (profileData.last_dividend / stock.last_price) * 100
            : 0;

        // Validasi ketat untuk tipe data number agar terhindar dari NaN atau null
        const safePer =
          typeof profileData.per === "number" && !isNaN(profileData.per)
            ? profileData.per
            : (stock.per ?? 0);

        db.run(
          `UPDATE emiten SET description = ?, market_cap = ?, dividend = ?, dividend_yield = ?, beta = ?, per = ?, fundamental_updated_at = ? WHERE id = ?`,
          [
            profileData.description ?? stock.description ?? "",
            profileData.market_cap ?? stock.market_cap ?? 0,
            profileData.last_dividend ?? stock.dividend ?? 0,
            divYield ?? stock.dividend_yield ?? 0,
            profileData.beta ?? stock.beta ?? 1.0,
            safePer,
            nowStr,
            stock.id,
          ],
        );
        isProfileSuccess = true;
      }
    } else {
      console.warn(
        `[Scraper] Gagal fetch profil Yahoo untuk [${code}] status: ${profileResponse.status}`,
      );
    }
  } catch (err: any) {
    console.error(
      `[Scraper] Error saat memproses profil [${code}]:`,
      err?.message || err,
    );
  }

  // ==========================================
  // TAHAP 2: FETCH & UPDATE DATA FUNDAMENTAL HISTORIS
  // ==========================================
  try {
    const scrapedYahooData = await scrapeFundamentalYahoo(code);

    if (scrapedYahooData && Object.keys(scrapedYahooData).length > 0) {
      const availableYears = Object.keys(scrapedYahooData)
        .map(Number)
        .sort((a, b) => b - a);

      const latestYear = availableYears[0];
      const currentFund = latestYear ? scrapedYahooData[latestYear] : null;
      const totalEquityTerbaru = currentFund?.total_equity ?? 0;

      // Hitung PBV secara mandiri jika market cap ada
      const targetMarketCap = profileData
        ? profileData.market_cap
        : (stock.market_cap ?? 0);
      const pbvCurrent =
        totalEquityTerbaru > 0 &&
        typeof targetMarketCap === "number" &&
        targetMarketCap > 0
          ? parseFloat((targetMarketCap / totalEquityTerbaru).toFixed(2))
          : 0;

      // Update rasio-rasio hasil kalkulasi fundamental tahunan terbaru ke tabel emiten
      db.run(
        `UPDATE emiten SET pbv = ?, roe = ?, der = ?, fundamental_updated_at = ? WHERE id = ?`,
        [
          pbvCurrent ?? stock.pbv ?? 0,
          currentFund?.roe ?? stock.roe ?? 0,
          currentFund?.der ?? stock.der ?? 0,
          nowStr,
          stock.id,
        ],
      );

      // Upsert data ke stock_histories
      const upsertHistory = db.prepare(`
        INSERT INTO stock_histories (emiten_id, year, period, revenue, net_profit, eps, roe, der, pbv, per, created_at, updated_at)
        VALUES ($emiten_id, $year, 'FY', $revenue, $net_profit, $eps, $roe, $der, $pbv, $per, $now, $now)
        ON CONFLICT(emiten_id, period, year)
        DO UPDATE SET revenue = excluded.revenue, net_profit = excluded.net_profit, eps = excluded.eps, roe = excluded.roe, der = excluded.der, pbv = excluded.pbv, per = excluded.per, updated_at = excluded.updated_at;
      `);

      for (const [yearStr, values] of Object.entries(scrapedYahooData)) {
        upsertHistory.run({
          $emiten_id: stock.id,
          $year: parseInt(yearStr),
          $revenue: String(values.revenue ?? "0"),
          $net_profit: String(values.net_profit ?? "0"),
          $eps: values.eps ?? 0,
          $roe: values.roe ?? 0,
          $der: values.der ?? 0,
          $pbv: values.pbv ?? 0,
          $per: values.per ?? 0,
          $now: nowStr,
        });
      }
      isFundamentalSuccess = true;
    } else {
      console.warn(
        `[Scraper] Data fundamental Yahoo kosong/null untuk [${code}]`,
      );
    }
  } catch (err: any) {
    console.error(
      `[Scraper] Error saat memproses fundamental [${code}]:`,
      err?.message || err,
    );
  }

  // ==========================================
  // TAHAP 3: POST-PROCESS ANTRIAN & RETURN
  // ==========================================
  db.run(`UPDATE emiten SET fundamental_updated_at = ? WHERE id = ?`, [
    nowStr,
    stock.id,
  ]);

  return isProfileSuccess || isFundamentalSuccess;
}
