import db from "../../db";
import type { EmitenItem } from "../../types";
import { fetchPriceTradingView } from "../tradingviewServices/fetchScreener";
import {
  fetchStockHistories,
  type FullStockMetrics,
} from "../tradingviewServices/fetchStockHistories";

export const stockHistoriesSyncState = {
  isActive: false,
};

export async function syncStockHistories(
  onProgress?: (
    currentCount: number,
    totalQueue: number,
    code: string,
    status: "OK" | "FAIL" | "INCOMPLETE",
  ) => void,
): Promise<string> {
  stockHistoriesSyncState.isActive = true;
  const startTime = performance.now();

  let successCount = 0;
  let failCount = 0;
  let processedCount = 0;

  try {
    // 1. Ambil antrean emiten dari database
    const queue = db
      .query(
        `
        SELECT * FROM emiten
        WHERE (
          (is_profile_complete = 0 OR is_fundamental_complete = 0)
          AND (
            fundamental_updated_at = '2000-01-01 00:00:00'
            OR fundamental_updated_at < datetime('now', '-2 hours')
          )
        ) OR (
          (is_profile_complete = 1 AND is_fundamental_complete = 1)
          AND fundamental_updated_at < datetime('now', '-90 days')
        )
        ORDER BY
          is_fundamental_complete ASC,
          is_profile_complete ASC,
          fundamental_updated_at ASC
      `,
      )
      .all() as EmitenItem[];

    if (queue.length === 0) {
      return "Antrean sinkronisasi kosong";
    }

    // Perbarui harga antrean
    await fetchPriceTradingView(queue).catch(() => {});

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO stock_histories (
        emiten_id, period, year, revenue, gross_profit,
        operating_income, ebit, net_profit, eps,
        average_basic_shares_outstanding, ebitda, total_assets,
        total_liabilities, total_equity, total_debt, net_debt,
        cash_flow_operating, cash_flow_investing, cash_flow_financing,
        free_cash_flow, roe, der, pbv, per, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        datetime('now'), datetime('now')
      )
    `);

    // 2. Loop pemrosesan data
    for (const item of queue) {
      if (!stockHistoriesSyncState.isActive) {
        break;
      }

      const code = item.code.toUpperCase();
      const symbol = `IDX:${code}`;
      let status: "OK" | "FAIL" | "INCOMPLETE" = "OK";
      processedCount++;

      try {
        const historyResult = await fetchStockHistories(symbol);

        const combinedMetrics = {
          ...(historyResult?.by_quarter ?? {}),
          ...(historyResult?.by_fy ?? {}),
        };

        if (!historyResult || Object.keys(combinedMetrics).length === 0) {
          failCount++;
          status = "INCOMPLETE";

          db.run(
            "UPDATE emiten SET fundamental_updated_at = datetime('now') WHERE code = ?",
            [code],
          );
        } else {
          db.transaction((dataMap: Record<string, FullStockMetrics>) => {
            for (const [periodStr, metrics] of Object.entries(dataMap)) {
              const parts = periodStr.split("-");
              const year = parts[0]
                ? parseInt(parts[0], 10)
                : new Date().getFullYear();
              const rawPeriod = parts[1] ?? "";
              const period = ["Q1", "Q2", "Q3", "Q4", "FY"].includes(rawPeriod)
                ? rawPeriod
                : "FY";

              insertStmt.run(
                item.id,
                period,
                year,
                metrics.revenue !== null ? String(metrics.revenue) : null,
                metrics.gross_profit ?? 0,
                metrics.operating_income ?? 0,
                metrics.ebit ?? 0,
                metrics.net_profit !== null ? String(metrics.net_profit) : null,
                metrics.eps ?? 0,
                metrics.shares_outstanding ?? 0,
                metrics.ebitda ?? 0,
                metrics.total_assets ?? 0,
                metrics.total_liabilities ?? 0,
                metrics.total_equity ?? 0,
                metrics.total_debt ?? 0,
                metrics.net_debt ?? 0,
                metrics.cash_flow_operating ?? 0,
                metrics.cash_flow_investing ?? 0,
                metrics.cash_flow_financing ?? 0,
                metrics.free_cash_flow ?? 0,
                metrics.roe ?? 0,
                metrics.der ?? 0,
                metrics.pbv ?? 0,
                metrics.per ?? 0,
              );
            }

            db.run(
              "UPDATE emiten SET is_fundamental_complete = 1, fundamental_updated_at = datetime('now') WHERE code = ?",
              [code],
            );
          })(combinedMetrics);

          successCount++;
        }
      } catch {
        failCount++;
        status = "FAIL";

        db.run(
          "UPDATE emiten SET fundamental_updated_at = datetime('now') WHERE code = ?",
          [code],
        );
      }

      if (onProgress) {
        onProgress(processedCount, queue.length, code, status);
      }

      await new Promise((r) => setTimeout(r, 300));
    }

    const duration = ((performance.now() - startTime) / 1000 / 60).toFixed(2);
    return `Total: ${queue.length} | Sukses: ${successCount} | Gagal: ${failCount} (${duration}m)`;
  } finally {
    stockHistoriesSyncState.isActive = false;
  }
}
