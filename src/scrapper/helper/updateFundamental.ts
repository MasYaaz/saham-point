import db from "../../db";
import type { EmitenItem } from "../../types";
import { scrapeFundamentalTradingView } from "./scrapeFundamentalTradingView";
import { scrapeTradingViewProfile } from "./scrapeProfileTradingView";

export type UpdateStatus = boolean | "INCOMPLETE";
/**
 * 4. Fungsi Sinkronisasi Data Fundamental & Histori Multi-Tahun
 */
export async function updateFundamental(
  code: string,
  context: any,
): Promise<UpdateStatus> {
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

      const newDescription = profileData.description || stock.description || "";
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
        `UPDATE emiten SET description = ?, market_cap = ?, dividend = ?, dividend_yield = ?, beta = ?, per = ? WHERE id = ?`,
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
      console.warn(
        `[Scraper] Gagal mengekstrak profil TradingView untuk [${code}]`,
      );
    }
  } catch (err: any) {
    console.error(
      `[Scraper] Error saat memproses profil TradingView [${code}]:`,
      err?.message || err,
    );
  }

  // ==========================================================================
  // TAHAP 2: FETCH & UPDATE DATA FUNDAMENTAL HISTORIS
  // ==========================================================================
  try {
    const result = await scrapeFundamentalTradingView(cleanCode, context);

    // 🛡️ FIX: Pastikan mengecek result.data, bukan result-nya langsung
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

      // Tentukan prioritas sumber yang BENAR-BENAR ada isinya
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
          emiten_id, year, period, created_at, updated_at, revenue, cost_of_goods_sold, gross_profit,
          operating_expenses_excl_cogs, operating_income, ebit, pretax_income, income_tax,
          net_income_before_discontinued, discontinued_operations, after_tax_other_income_expense,
          net_profit, preferred_dividends, diluted_net_income_to_common, eps, diluted_eps,
          average_basic_shares_outstanding, diluted_shares_outstanding, ebitda, total_assets,
          total_liabilities, total_equity, total_liabilities_and_equity, total_debt, net_debt,
          cash_flow_operating, cash_flow_investing, cash_flow_financing, free_cash_flow, roe, der, pbv, per
        ) VALUES (
          $emiten_id, $year, 'FY', $now, $now, $revenue, $cost_of_goods_sold, $gross_profit,
          $operating_expenses_excl_cogs, $operating_income, $ebit, $pretax_income, $income_tax,
          $net_income_before_discontinued, $discontinued_operations, $after_tax_other_income_expense,
          $net_profit, $preferred_dividends, $diluted_net_income_to_common, $eps, $diluted_eps,
          $average_basic_shares_outstanding, $diluted_shares_outstanding, $ebitda, $total_assets,
          $total_liabilities, $total_equity, $total_liabilities_and_equity, $total_debt, $net_debt,
          $cash_flow_operating, $cash_flow_investing, $cash_flow_financing, $free_cash_flow, $roe, $der, $pbv, $per
        ) ON CONFLICT(emiten_id, period, year) DO UPDATE SET
          revenue = excluded.revenue, cost_of_goods_sold = excluded.cost_of_goods_sold, gross_profit = excluded.gross_profit,
          operating_expenses_excl_cogs = excluded.operating_expenses_excl_cogs, operating_income = excluded.operating_income,
          ebit = excluded.ebit, pretax_income = excluded.pretax_income, income_tax = excluded.income_tax,
          net_income_before_discontinued = excluded.net_income_before_discontinued, discontinued_operations = excluded.discontinued_operations,
          after_tax_other_income_expense = excluded.after_tax_other_income_expense, net_profit = excluded.net_profit,
          preferred_dividends = excluded.preferred_dividends, diluted_net_income_to_common = excluded.diluted_net_income_to_common,
          eps = excluded.eps, diluted_eps = excluded.diluted_eps, average_basic_shares_outstanding = excluded.average_basic_shares_outstanding,
          diluted_shares_outstanding = excluded.diluted_shares_outstanding, ebitda = excluded.ebitda, total_assets = excluded.total_assets,
          total_liabilities = excluded.total_liabilities, total_equity = excluded.total_equity, total_liabilities_and_equity = excluded.total_liabilities_and_equity,
          total_debt = excluded.total_debt, net_debt = excluded.net_debt, cash_flow_operating = excluded.cash_flow_operating,
          cash_flow_investing = excluded.cash_flow_investing, cash_flow_financing = excluded.cash_flow_financing,
          free_cash_flow = excluded.free_cash_flow, roe = excluded.roe, der = excluded.der, pbv = excluded.pbv, per = excluded.per,
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
          $cost_of_goods_sold: values.cost_of_goods_sold ?? 0,
          $gross_profit: values.gross_profit ?? 0,
          $operating_expenses_excl_cogs:
            values.operating_expenses_excl_cogs ?? 0,
          $operating_income: values.operating_income ?? 0,
          $ebit: values.ebit ?? 0,
          $pretax_income: values.pretax_income ?? 0,
          $income_tax: values.income_tax ?? 0,
          $net_income_before_discontinued:
            values.net_income_before_discontinued ?? 0,
          $discontinued_operations: values.discontinued_operations ?? 0,
          $after_tax_other_income_expense:
            values.after_tax_other_income_expense ?? 0,
          $net_profit:
            values.net_profit !== null && values.net_profit !== undefined
              ? String(values.net_profit)
              : null,
          $preferred_dividends: values.preferred_dividends ?? 0,
          $diluted_net_income_to_common:
            values.diluted_net_income_to_common ?? 0,
          $eps: values.eps ?? 0,
          $diluted_eps: values.diluted_eps ?? 0,
          $average_basic_shares_outstanding:
            values.average_basic_shares_outstanding ?? 0,
          $diluted_shares_outstanding: values.diluted_shares_outstanding ?? 0,
          $ebitda: values.ebitda ?? 0,
          $total_assets: values.total_assets ?? 0,
          $total_liabilities: values.total_liabilities ?? 0,
          $total_equity: values.total_equity ?? 0,
          $total_liabilities_and_equity:
            values.total_liabilities_and_equity ?? 0,
          $total_debt: values.total_debt ?? 0,
          $net_debt: values.net_debt ?? 0,
          $cash_flow_operating: values.cash_flow_operating ?? 0,
          $cash_flow_investing: values.cash_flow_investing ?? 0,
          $cash_flow_financing: values.cash_flow_financing ?? 0,
          $free_cash_flow: values.free_cash_flow ?? 0,
          $roe: values.roe ?? 0,
          $der: values.der ?? 0,
          $pbv: values.pbv ?? 0,
          $per: values.per ?? 0,
        });
      }
      isFundamentalSuccess = true;
    } else {
      console.warn(
        `[Scraper] Data fundamental TradingView kosong/null untuk [${code}]`,
      );
    }
  } catch (error) {
    console.error(
      `[Orchestrator] Gagal memproses data fundamental untuk emiten ${code}:`,
      error,
    );
  }

  // ==========================================================================
  // TAHAP 3: POST-PROCESS ANTRIAN & RETURN (INTEGRATED)
  // ==========================================================================
  const totalSuccess = isProfileSuccess || isFundamentalSuccess;

  if (totalSuccess) {
    db.run(`UPDATE emiten SET fundamental_updated_at = ? WHERE id = ?`, [
      nowStr,
      stock.id,
    ]);
  }

  // 🛡️ FIX: Kembalikan status INCOMPLETE di bagian paling akhir agar tidak merusak flow Tahap 3
  if (isDataIncomplete) {
    console.warn(
      `[Scraper] Data untuk [${code}] parsial. Tab yang gagal: ${missingTabs.join(", ")}`,
    );
    return "INCOMPLETE";
  }

  return totalSuccess;
}
