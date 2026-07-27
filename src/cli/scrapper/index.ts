import { safeLog } from "../../cli/helper/safeLog";
import db from "../../db";
import type { EmitenItem } from "../../types";
import {
  createBatchContext,
  getOrInitBrowser,
} from "../../utils/scrapper/browser";
import { fetchPriceTradingView } from "./helper/fetchPriceTradingView";
import { updateFundamental } from "./helper/updateFundamental";

/**
 * Wrapper Promise dengan batas waktu (timeout guard).
 *
 * Mencegah alur sinkronisasi macet permanen (freeze) ketika operasi Playwright
 * (seperti `page.close()`) menggantung tanpa memberikan respon (resolve/reject)
 * saat Chromium menjadi tidak responsif.
 *
 * @param promise - Operasi asinkron yang akan dieksekusi.
 * @param ms - Batas waktu maksimal dalam milidetik.
 * @param label - Label identifikasi untuk pencatatan log.
 */
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
 * Menyinkronkan harga pasar dan rasio dasar secara real-time.
 * Memproses antrean emiten dalam 1 kali HTTP batch request ke TradingView Scanner API.
 *
 * @param limit - Jumlah maksimal emiten yang diproses (opsional, default: seluruh emiten).
 */
export async function syncMarketPrices(limit?: number): Promise<string> {
  // 1. Ambil antrean emiten berdasarkan pembaruan harga terlama
  const querySql =
    limit && limit > 0
      ? `
      SELECT id, code, description, last_price, beta, pbv, per, roe, der, price_updated_at, fundamental_updated_at
      FROM emiten
      ORDER BY price_updated_at ASC
      LIMIT ?
      `
      : `
      SELECT id, code, description, last_price, beta, pbv, per, roe, der, price_updated_at, fundamental_updated_at
      FROM emiten
      ORDER BY price_updated_at ASC
      `;

  const queue = (
    limit && limit > 0
      ? db.query(querySql).all(limit)
      : db.query(querySql).all()
  ) as EmitenItem[];

  if (queue.length === 0) return "Antrian harga kosong.";

  console.log(`[Price Sync] Memproses ${queue.length} emiten sekaligus...`);

  // 2. Eksekusi batch update via TradingView Scanner
  const { successCount, failCount } = await fetchPriceTradingView(queue);

  return `[Price Sync] Selesai | Total Diproses: ${queue.length} | Berhasil: ${successCount} | Gagal: ${failCount}`;
}

/**
 * Menyinkronkan data fundamental mendalam dan histori emiten.
 * Mengombinasikan pembaruan harga cepat (TradingView Batch) dan deep scraping (Playwright).
 *
 * @param limit - Jumlah emiten per batch (default: 50).
 * @param onProgress - Callback opsional untuk memantau progres real-time.
 */
export async function syncDataAll(
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

  // 1. Ambil antrean emiten yang data fundamentalnya paling usang/belum lengkap
  const queue = db
    .query(
      `
    SELECT id, code
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

  if (queue.length === 0)
    return { success: 0, fail: 0, failedLogs: ["Antrian kosong."] };

  // 2. Perbarui harga & rasio dasar seluruh antrean sekaligus (~200ms)
  await fetchPriceTradingView(queue).catch((err) =>
    safeLog(
      "warn",
      `[TradingView] Gagal memperbarui harga antrean: ${err.message}`,
    ),
  );

  let successCount = 0;
  let failCount = 0;
  const failedLogs: string[] = [];

  // 3. Inisialisasi Browser & BrowserContext
  const browser = await getOrInitBrowser().catch((e) => {
    throw new Error(`CRITICAL_BROWSER_FAILURE: ${e.message}`);
  });

  const context = await createBatchContext(browser).catch((e) => {
    throw new Error(`CRITICAL_CONTEXT_FAILURE: ${e.message}`);
  });

  try {
    // 4. Sesi Deep Scraping via Playwright
    for (const item of queue) {
      const code = item.code.toUpperCase();
      let status: "OK" | "FAIL" | "INCOMPLETE" = "OK";

      try {
        const fundStatus = await updateFundamental(code, context);

        if (fundStatus === "INCOMPLETE") {
          status = "INCOMPLETE";
          safeLog(
            "warn",
            `[Scraper] Data ${code} tidak lengkap, akan dicoba di putaran berikutnya.`,
          );
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
        failedLogs.push(`${code}: ${err.message}`);
      }

      // Laporkan progres via callback jika tersedia
      if (onProgress)
        onProgress(successCount + failCount, totalEmiten, code, status);

      // 5. Pembersihan tab browser per emiten
      const pages = context.pages();
      for (const page of pages) {
        try {
          await withTimeout(
            page.close().catch(() => null),
            8000,
            `page.close() setelah item ${code}`,
          );
        } catch (pageErr) {
          safeLog(
            "warn",
            `[Watchdog] Tab close timeout pada ${code}. Menghentikan pembersihan sisa tab karena Chromium tidak responsif.`,
          );
          break;
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    // 6. Tutup context batch (Instance browser utama tetap dipertahankan di memori)
    await context.close().catch(() => {});
  }

  return { success: successCount, fail: failCount, failedLogs };
}
