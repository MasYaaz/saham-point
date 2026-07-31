import { safeLog } from "../../../utils/safeLog";
import db from "../../../db";
import type { EmitenItem } from "../../../types";
import { scrapeFundamentalTradingView } from "./scrapeStockHistories";

export type UpdateStatus = boolean | "INCOMPLETE";

/**
 * Memperbarui data histori keuangan multi-tahun suatu emiten ke tabel `stock_histories`.
 *
 * Menggunakan Playwright untuk mengambil data 4 tab laporan keuangan TradingView.
 * Dilengkapi dengan mekanisme `Promise.race` (timeout guard 40 detik) dan cancellation flag.
 */
export async function updateFundamental(
  code: string,
  context: any,
): Promise<UpdateStatus> {
  const EMITEN_TIMEOUT = 40000;
  const cancelled = { value: false };

  async function internalWorker(): Promise<UpdateStatus> {
    const stock = db
      .query("SELECT * FROM emiten WHERE code = ? LIMIT 1")
      .get(code) as EmitenItem | undefined;

    if (!stock) return false;

    const cleanCode = code.toUpperCase();
    const nowStr = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
    )
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);

    let isFundamentalSuccess = false;
    let isDataIncomplete = false;
    let missingTabs: string[] = [];

    // =========================================================================
    // FETCH & UPDATE DATA FUNDAMENTAL HISTORIS (MULTI-TAB PLAYWRIGHT)
    // =========================================================================
    try {
      const result = await scrapeFundamentalTradingView(cleanCode, context);

      if (cancelled.value) return false;

      if (result && result.data && Object.keys(result.data).length > 0) {
        const scrapedFundamentalData = result.data;
        missingTabs = result.incompleteTabs;
        isDataIncomplete = missingTabs.length > 0;

        // 1. Penentuan Rangkuman Fundamental (TTM > Current > FY Terbaru)
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
        if (isValidSummary(scrapedFundamentalData["ttm"])) {
          summarySource = scrapedFundamentalData["ttm"];
        } else if (isValidSummary(scrapedFundamentalData["current"])) {
          summarySource = scrapedFundamentalData["current"];
        } else if (
          latestYear &&
          isValidSummary(scrapedFundamentalData[latestYear])
        ) {
          summarySource = scrapedFundamentalData[latestYear];
        }

        // Update ringkasan rasio ke tabel emiten sebagai fallback
        if (summarySource) {
          db.run(
            `UPDATE emiten SET
              pbv = COALESCE(?, pbv),
              roe = COALESCE(?, roe),
              der = COALESCE(?, der),
              per = COALESCE(?, per)
            WHERE id = ?`,
            [
              summarySource.pbv ?? null,
              summarySource.roe ?? null,
              summarySource.der ?? null,
              summarySource.per ?? null,
              stock.id,
            ],
          );
        }

        // 2. Upsert Data Laporan Keuangan ke `stock_histories`
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
            $revenue: values.revenue ? String(values.revenue) : null,
            $gross_profit: values.gross_profit ?? null,
            $operating_income: values.operating_income ?? null,
            $ebit: values.ebit ?? null,
            $net_profit: values.net_profit ? String(values.net_profit) : null,
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

        isFundamentalSuccess = true;

        if (!isDataIncomplete) {
          db.run(
            `UPDATE emiten SET fundamental_updated_at = ?, is_fundamental_complete = 1, is_profile_complete = 1 WHERE id = ?`,
            [nowStr, stock.id],
          );
        } else {
          db.run(`UPDATE emiten SET is_fundamental_complete = 0 WHERE id = ?`, [
            stock.id,
          ]);
        }
      } else {
        safeLog(
          "warn",
          `[Scraper] Data fundamental TradingView kosong/null untuk [${code}]`,
        );
        isDataIncomplete = true;
        missingTabs = ["ALL_TABS_EMPTY_OR_FAILED"];
        db.run(`UPDATE emiten SET is_fundamental_complete = 0 WHERE id = ?`, [
          stock.id,
        ]);
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

    return isFundamentalSuccess;
  }

  // =========================================================================
  // TIMEOUT GUARD (Promise.race)
  // =========================================================================
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      cancelled.value = true;
      reject(
        safeLog(
          "error",
          `Scraping [${code.toUpperCase()}] macet melampaui batas aman ${EMITEN_TIMEOUT / 1000} detik.`,
        ),
      );
    }, EMITEN_TIMEOUT);
  });

  try {
    const result = await Promise.race([internalWorker(), timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (err: any) {
    clearTimeout(timeoutId);
    safeLog(
      "error",
      `\n🚨 [INTERNAL TIMEOUT] Emiten [${code.toUpperCase()}]: ${err.message}`,
    );
    return false;
  }
}
