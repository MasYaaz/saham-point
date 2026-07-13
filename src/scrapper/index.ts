import { safeLog } from "../cli/helper/safeLog";
import db from "../db";
import type { EmitenItem } from "../types";
import { initPersistentBrowser } from "../utils/browser";
import { fetchPriceYahoo } from "./helper/fetchPriceYahoo";
import { updateFundamental } from "./helper/updateFundamental";

/**
 * 2a. FUNGSI KHUSUS HARGA REAL-TIME (Dijalankan berkala saat bursa buka)
 * Mengambil antrian emiten yang harganya paling lama tidak diperbarui
 */
export async function syncMarketPrices(limit: number = 50): Promise<string> {
  // Mengambil emiten berdasarkan pembaruan harga terlama
  const queue = db
    .query(
      `
      SELECT id, code, description, last_price, beta, pbv, per, roe, der, price_updated_at, fundamental_updated_at 
      FROM emiten 
      ORDER BY price_updated_at ASC 
      LIMIT ?
      `,
    )
    .all(limit) as EmitenItem[];

  if (queue.length === 0) return "Antrian harga kosong.";

  let successCount = 0;
  let failCount = 0;

  for (let item of queue) {
    const priceSuccess = await fetchPriceYahoo(item);
    if (priceSuccess) successCount++;
    else failCount++;

    // Jeda tipis antar emiten karena hanya fetch 1 URL API Chart cepat per emiten
    const delay = Math.floor(Math.random() * (400 - 200 + 1)) + 200; // 200ms - 400ms
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return `[Price Sync] Selesai | Berhasil: ${successCount} | Gagal: ${failCount}`;
}

/**
 * FUNGSI KHUSUS FUNDAMENTAL & HISTORI
 * Mencari emiten yang historinya belum lengkap (< 4 tahun) atau yang data fundamentalnya paling usang
 * Sekaligus menyinkronkan harga pasar real-time agar seluruh kolom emiten terisi penuh.
 */
export async function syncDataAll(
  limit: number = 20,
  onProgress?: (
    currentCount: number,
    totalEmiten: number,
    code: string,
    status: "OK" | "FAIL" | "INCOMPLETE",
  ) => void,
): Promise<{ success: number; fail: number; failedLogs: string[] }> {
  const countRow = db.query("SELECT COUNT(*) as total FROM emiten").get() as
    | { total: number }
    | undefined;
  const totalEmiten = countRow?.total ?? 1;

  // Query dengan logika flag yang sudah kita perbaiki
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

  let successCount = 0;
  let failCount = 0;
  const failedLogs: string[] = [];

  // Init Browser
  const browserData = await initPersistentBrowser().catch((e) => {
    throw new Error(`CRITICAL_BROWSER_FAILURE: ${e.message}`);
  });
  const { browser, context } = browserData;

  try {
    // --- SESI 1: Scraping Utama ---
    for (const item of queue) {
      const code = item.code.toUpperCase();
      let status: "OK" | "FAIL" | "INCOMPLETE" = "OK";

      try {
        await fetchPriceYahoo(item).catch(() =>
          safeLog("warn", `[Yahoo] Gagal ${code}`),
        );
        const fundStatus = await updateFundamental(code, context);

        if (fundStatus === "INCOMPLETE") {
          // Cukup log saja, jangan masukkan ke retryQueue
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

      // Laporkan progres tanpa menghitung retryQueue
      if (onProgress)
        onProgress(successCount + failCount, totalEmiten, code, status);

      // BERSIHKAN MEMORI setiap kali selesai 1 emiten
      const pages = context.pages();
      for (const page of pages) {
        await page.close().catch(() => {});
      }

      await new Promise((r) => setTimeout(r, 500)); // Jeda lebih lama agar tidak terdeteksi bot
    }
  } finally {
    if (browser) await browser.close();
  }

  return { success: successCount, fail: failCount, failedLogs };
}
