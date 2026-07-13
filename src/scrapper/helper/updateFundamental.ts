import { safeLog } from "../../cli/helper/safeLog";
import db from "../../db";
import type { EmitenItem } from "../../types";
import { scrapeFundamentalTradingView } from "./scrapeFundamentalTradingView";
import { scrapeTradingViewProfile } from "./scrapeProfileTradingView";

export type UpdateStatus = boolean | "INCOMPLETE";

/**
 * 4. Fungsi Sinkronisasi Data Fundamental & Histori Multi-Tahun
 * Sudah dilengkapi dengan proteksi internal timeout agar anti-freezing.
 */
export async function updateFundamental(
  code: string,
  context: any,
): Promise<UpdateStatus> {
  const EMITEN_TIMEOUT = 25000; // ⏱️ Batas waktu maksimal 25 detik per emiten

  // 1. Bungkus logika utama ke dalam sub-fungsi internal agar bisa di-race
  async function internalWorker(): Promise<UpdateStatus> {
    const stock = db
      .query("SELECT * FROM emiten WHERE code = ? LIMIT 1")
      .get(code) as EmitenItem | undefined;

    if (!stock) return false;

    const cleanCode = code.toUpperCase();
    const tvProfileSymbol = `IDX-${cleanCode}`;
    const nowStr = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
    )
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);

    let isProfileSuccess = false;
    let isFundamentalSuccess = false;
    let isDataIncomplete = false;
    let missingTabs: string[] = [];

    // ==========================================================================
    // TAHAP 1: FETCH & UPDATE DATA PROFIL
    // ==========================================================================
    try {
      const profileData = await scrapeTradingViewProfile(
        tvProfileSymbol,
        context,
      );
      if (profileData) {
        const dividend = profileData.last_dividend ?? 0;
        const rawYield =
          dividend > 0 && stock.last_price > 0
            ? (dividend / stock.last_price) * 100
            : 0;
        const divYield = Number(rawYield.toFixed(2));

        const newDescription =
          profileData.description || stock.description || "";
        const newMarketCap =
          profileData.market_cap && profileData.market_cap > 0
            ? profileData.market_cap
            : (stock.market_cap ?? null);
        const newDividend =
          profileData.last_dividend && profileData.last_dividend > 0
            ? profileData.last_dividend
            : (stock.dividend ?? null);
        const newDivYield =
          divYield > 0 ? divYield : (stock.dividend_yield ?? null);
        const newBeta =
          profileData.beta && profileData.beta !== 0
            ? profileData.beta
            : (stock.beta ?? null);
        const newPerProfile =
          profileData.per && profileData.per > 0
            ? profileData.per
            : (stock.per ?? null);

        db.run(
          `UPDATE emiten SET description = ?, market_cap = ?, dividend = ?, dividend_yield = ?, beta = ?, per = ?, is_profile_complete = 1 WHERE id = ?`,
          [
            newDescription,
            newMarketCap,
            newDividend,
            newDivYield,
            newBeta,
            newPerProfile,
            stock.id,
          ],
        );
        isProfileSuccess = true;
      } else {
        safeLog(
          "warn",
          `[Scraper] Gagal mengekstrak profil TradingView untuk [${code}]`,
        );
      }
    } catch (err: any) {
      safeLog(
        "warn",
        `[Scraper] Error saat memproses profil TradingView [${code}]: ${err?.message || err}`,
      );
    }

    // ==========================================================================
    // TAHAP 2: FETCH & UPDATE DATA FUNDAMENTAL HISTORIS
    // ==========================================================================
    try {
      const result = await scrapeFundamentalTradingView(cleanCode, context);

      if (result && result.data && Object.keys(result.data).length > 0) {
        const scrapedFundamentalData = result.data;
        missingTabs = result.incompleteTabs;
        isDataIncomplete = missingTabs.length > 0;

        // 1. Logika Summary: Prioritas TTM > Current > FY Terbaru
        const years = Object.keys(scrapedFundamentalData)
          .filter((k) => !isNaN(Number(k)))
          .map(Number)
          .sort((a, b) => b - a);
        const latestYear = years[0];

        const isValidSummary = (obj: any) => {
          if (!obj) return false;
          return (
            (obj.pbv !== undefined && obj.pbv !== null) ||
            (obj.roe !== undefined && obj.roe !== null) ||
            (obj.der !== undefined && obj.der !== null) ||
            (obj.per !== undefined && obj.per !== null)
          );
        };

        let summarySource = null;
        let sourceKey = null;

        if (isValidSummary(scrapedFundamentalData["ttm"])) {
          summarySource = scrapedFundamentalData["ttm"];
          sourceKey = "ttm";
        } else if (isValidSummary(scrapedFundamentalData["current"])) {
          summarySource = scrapedFundamentalData["current"];
          sourceKey = "current";
        } else if (
          latestYear &&
          isValidSummary(scrapedFundamentalData[latestYear])
        ) {
          summarySource = scrapedFundamentalData[latestYear];
          sourceKey = String(latestYear);
        }

        if (summarySource) {
          const newPbv =
            summarySource.pbv !== null && summarySource.pbv !== undefined
              ? summarySource.pbv
              : (stock.pbv ?? null);
          const newRoe =
            summarySource.roe !== null && summarySource.roe !== undefined
              ? summarySource.roe
              : (stock.roe ?? null);
          const newDer =
            summarySource.der !== null && summarySource.der !== undefined
              ? summarySource.der
              : (stock.der ?? null);
          const newPerFund =
            summarySource.per !== null && summarySource.per !== undefined
              ? summarySource.per
              : (stock.per ?? null);

          db.run(
            `UPDATE emiten SET pbv = ?, roe = ?, der = ?, per = ? WHERE id = ?`,
            [newPbv, newRoe, newDer, newPerFund, stock.id],
          );
        }

        // 2. Upsert data ke stock_histories
        const upsertHistory = db.prepare(`
          INSERT INTO stock_histories (
            emiten_id, year, period, created_at, updated_at, revenue, gross_profit, operating_income, ebit, net_profit, eps, average_basic_shares_outstanding, ebitda, total_assets, total_liabilities, total_equity, total_debt, net_debt, cash_flow_operating, cash_flow_investing, cash_flow_financing, free_cash_flow, roe, der, pbv, per
          ) VALUES (
            $emiten_id, $year, 'FY', $now, $now, $revenue, $gross_profit, $operating_income, $ebit, $net_profit, $eps, $average_basic_shares_outstanding, $ebitda, $total_assets, $total_liabilities, $total_equity, $total_debt, $net_debt, $cash_flow_operating, $cash_flow_investing, $cash_flow_financing, $free_cash_flow, $roe, $der, $pbv, $per
          )
          ON CONFLICT(emiten_id, period, year) DO UPDATE SET
            revenue = COALESCE(excluded.revenue, stock_histories.revenue),
            gross_profit = COALESCE(excluded.gross_profit, stock_histories.gross_profit),
            operating_income = COALESCE(excluded.operating_income, stock_histories.operating_income),
            ebit = COALESCE(excluded.ebit, stock_histories.ebit),
            net_profit = COALESCE(excluded.net_profit, stock_histories.net_profit),
            eps = COALESCE(excluded.eps, stock_histories.eps),
            average_basic_shares_outstanding = COALESCE(excluded.average_basic_shares_outstanding, stock_histories.average_basic_shares_outstanding),
            ebitda = COALESCE(excluded.ebitda, stock_histories.ebitda),
            total_assets = COALESCE(excluded.total_assets, stock_histories.total_assets),
            total_liabilities = COALESCE(excluded.total_liabilities, stock_histories.total_liabilities),
            total_equity = COALESCE(excluded.total_equity, stock_histories.total_equity),
            total_debt = COALESCE(excluded.total_debt, stock_histories.total_debt),
            net_debt = COALESCE(excluded.net_debt, stock_histories.net_debt),
            cash_flow_operating = COALESCE(excluded.cash_flow_operating, stock_histories.cash_flow_operating),
            cash_flow_investing = COALESCE(excluded.cash_flow_investing, stock_histories.cash_flow_investing),
            cash_flow_financing = COALESCE(excluded.cash_flow_financing, stock_histories.cash_flow_financing),
            free_cash_flow = COALESCE(excluded.free_cash_flow, stock_histories.free_cash_flow),
            roe = COALESCE(excluded.roe, stock_histories.roe),
            der = COALESCE(excluded.der, stock_histories.der),
            pbv = COALESCE(excluded.pbv, stock_histories.pbv),
            per = COALESCE(excluded.per, stock_histories.per),
            updated_at = excluded.updated_at;
        `);

        for (const [key, values] of Object.entries(scrapedFundamentalData)) {
          const year = parseInt(key, 10);
          if (isNaN(year)) continue;
          upsertHistory.run({
            $emiten_id: stock.id,
            $year: year,
            $now: nowStr,
            $revenue:
              values.revenue !== null && values.revenue !== undefined
                ? String(values.revenue)
                : null,
            $gross_profit: values.gross_profit ?? null,
            $operating_income: values.operating_income ?? null,
            $ebit: values.ebit ?? null,
            $net_profit:
              values.net_profit !== null && values.net_profit !== undefined
                ? String(values.net_profit)
                : null,
            $eps: values.eps ?? null,
            $average_basic_shares_outstanding:
              values.average_basic_shares_outstanding ?? null,
            $ebitda: values.ebitda ?? null,
            $total_assets: values.total_assets ?? null,
            $total_liabilities: values.total_liabilities ?? null,
            $total_equity: values.total_equity ?? null,
            $total_debt: values.total_debt ?? null,
            $net_debt: values.net_debt ?? null,
            $cash_flow_operating: values.cash_flow_operating ?? null,
            $cash_flow_investing: values.cash_flow_investing ?? null,
            $cash_flow_financing: values.cash_flow_financing ?? null,
            $free_cash_flow: values.free_cash_flow ?? null,
            $roe: values.roe ?? null,
            $der: values.der ?? null,
            $pbv: values.pbv ?? null,
            $per: values.per ?? null,
          });
        }

        isDataIncomplete = result.incompleteTabs.length > 0;

        if (!isDataIncomplete) {
          db.run(
            `UPDATE emiten SET fundamental_updated_at = ?, is_fundamental_complete = 1 WHERE id = ?`,
            [nowStr, stock.id],
          );
        } else {
          db.run(`UPDATE emiten SET is_fundamental_complete = 0 WHERE id = ?`, [
            stock.id,
          ]);
        }
        isFundamentalSuccess = true;
      } else {
        db.run(`UPDATE emiten SET is_fundamental_complete = 0 WHERE id = ?`, [
          stock.id,
        ]);
        safeLog(
          "warn",
          `[Scraper] Data fundamental TradingView kosong/null untuk [${code}]`,
        );
      }
    } catch (error) {
      safeLog(
        "error",
        `[Orchestrator] Gagal memproses data fundamental untuk emiten ${code}: ${error}`,
      );
      db.run(`UPDATE emiten SET is_fundamental_complete = 0 WHERE id = ?`, [
        stock.id,
      ]);
    }

    if (isDataIncomplete) {
      safeLog(
        "warn",
        `[Scraper] Data untuk [${code}] parsial. Tab yang gagal: ${missingTabs.join(", ")}`,
      );
      return "INCOMPLETE";
    }

    return isProfileSuccess || isFundamentalSuccess;
  }

  // 2. Buat mekanisme balapan waktu (Promise.race)
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Scraping [${code.toUpperCase()}] macet melampaui batas aman ${EMITEN_TIMEOUT / 1000} detik.`,
        ),
      );
    }, EMITEN_TIMEOUT);
  });

  try {
    const result = await Promise.race([internalWorker(), timeoutPromise]);
    clearTimeout(timeoutId); // 🧹 Bersihkan timer memori jika scraping beres tepat waktu
    return result;
  } catch (err: any) {
    clearTimeout(timeoutId); // 🧹 Bersihkan juga jika terkena timeout
    safeLog(
      "error",
      `\n🚨 [INTERNAL TIMEOUT] Emiten [${code.toUpperCase()}]: ${err.message}`,
    );
    // Kembalikan false agar dianggap FAIL, loop luar akan otomatis lanjut ke emiten berikutnya tanpa freeze!
    return false;
  }
}
