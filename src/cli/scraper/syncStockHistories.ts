import { safeLog } from "../../utils/safeLog";
import db from "../../db";
import type { EmitenItem } from "../../types";
import {
  createBatchContext,
  getOrInitBrowser,
} from "../../utils/scrapper/browserManager";
import { fetchPriceTradingView } from "../../services/tradingViewService";
import { updateFundamental } from "./helper/updateStockHistories";

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T | null> {
  let timeoutId: any;
  const timeoutGuard = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      safeLog(
        "error",
        `[Watchdog] "${label}" melebihi batas aman ${ms}ms — dilewati paksa agar sync tidak macet permanen.`,
      );
      resolve(null);
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutGuard]);
    clearTimeout(timeoutId);
    return result;
  } catch (err: any) {
    clearTimeout(timeoutId);
    safeLog("error", `[Watchdog] "${label}" error: ${err?.message || err}`);
    return null;
  }
}

/**
 * Menyinkronkan data fundamental mendalam dan histori emiten (`stock_histories`).
 */
export async function syncStockHistories(
  limit: number = 50,
  onProgress?: (
    currentCount: number,
    totalEmiten: number,
    code: string,
    status: "OK" | "FAIL" | "INCOMPLETE",
  ) => void,
): Promise<{ success: number; fail: number; failedLogs: string[] }> {
  const countRow = db.query("SELECT COUNT(*) as total FROM emiten").get() as
    { total: number } | undefined;
  const totalEmiten = countRow?.total ?? 1;

  const queue = db
    .query(
      `
    SELECT *
    FROM emiten
    WHERE (
      (is_profile_complete = 0 OR is_fundamental_complete = 0)
      AND (fundamental_updated_at < datetime('now', '-2 hours') OR fundamental_updated_at = '2000-01-01 00:00:00')
    ) OR (
      is_profile_complete = 1 AND is_fundamental_complete = 1
      AND (fundamental_updated_at < date('now', '-3 months') OR fundamental_updated_at = '2000-01-01 00:00:00')
    )
    ORDER BY (is_profile_complete + is_fundamental_complete) ASC, fundamental_updated_at ASC
    LIMIT ?
  `,
    )
    .all(limit) as EmitenItem[];

  if (queue.length === 0) {
    return { success: 0, fail: 0, failedLogs: ["Antrian kosong."] };
  }

  // Quick refresh harga & rasio dasar antrean sebelum deep scrape
  await fetchPriceTradingView(queue).catch((err) =>
    safeLog(
      "warn",
      `[TradingView] Gagal memperbarui harga antrean: ${err?.message || err}`,
    ),
  );

  let successCount = 0;
  let failCount = 0;
  let processedCount = 0;
  const failedLogs: string[] = [];

  const browser = await getOrInitBrowser().catch((e) => {
    throw new Error(`CRITICAL_BROWSER_FAILURE: ${e.message}`);
  });

  const context = await createBatchContext(browser).catch((e) => {
    throw new Error(`CRITICAL_CONTEXT_FAILURE: ${e.message}`);
  });

  try {
    for (const item of queue) {
      const code = item.code.toUpperCase();
      let status: "OK" | "FAIL" | "INCOMPLETE" = "OK";
      processedCount++;

      try {
        const fundStatus = await updateFundamental(code, context);

        if (fundStatus === "INCOMPLETE") {
          status = "INCOMPLETE";
        } else if (fundStatus === false) {
          failCount++;
          status = "FAIL";
          failedLogs.push(`${code}: Scraping gagal.`);
        } else {
          successCount++;
        }
      } catch (err: any) {
        failCount++;
        status = "FAIL";
        failedLogs.push(`${code}: ${err?.message || err}`);
      }

      if (onProgress) {
        onProgress(processedCount, totalEmiten, code, status);
      }

      const pages = context.pages();
      for (const page of pages) {
        try {
          await withTimeout(
            page.close().catch(() => null),
            8000,
            `page.close() setelah item ${code}`,
          );
        } catch {
          break;
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    await context.close().catch(() => {});
  }

  return { success: successCount, fail: failCount, failedLogs };
}
