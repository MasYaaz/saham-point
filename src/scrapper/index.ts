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
 * 2b. FUNGSI KHUSUS FUNDAMENTAL & HISTORI (Dijalankan saat bursa tutup / maintenance / akselerasi TUI)
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

  const queue = db
    .query(
      `
      SELECT id, code FROM emiten 
      WHERE fundamental_updated_at < date('now', '-3 months') OR fundamental_updated_at IS NULL 
      ORDER BY fundamental_updated_at ASC LIMIT ?
    `,
    )
    .all(limit) as EmitenItem[];

  if (queue.length === 0)
    return { success: 0, fail: 0, failedLogs: ["Antrian kosong."] };

  let successCount = 0;
  let failCount = 0;
  const failedLogs: string[] = [];
  const retryQueue: EmitenItem[] = [];

  // 1. Berikan proteksi Timeout global saat init browser agar tidak stuck selamanya
  const browserPromise = initPersistentBrowser();
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Browser Init Timeout")), 30000),
  );

  let browserData;
  try {
    browserData = (await Promise.race([browserPromise, timeoutPromise])) as any;
  } catch (e: any) {
    return {
      success: 0,
      fail: queue.length,
      failedLogs: [`Gagal inisialisasi browser: ${e.message}`],
    };
  }

  const { browser, context } = browserData;

  try {
    // --- SESI 1: Scraping Utama ---
    for (const item of queue) {
      const code = item.code.toUpperCase();
      let status: "OK" | "FAIL" | "INCOMPLETE" = "OK";

      try {
        // 2. Pastikan fetchPriceYahoo di dalam internalnya sudah punya AbortController timeout!
        await fetchPriceYahoo(item).catch(() =>
          console.warn(`[Yahoo] Gagal fetch harga ${code}`),
        );

        const fundStatus = await updateFundamental(code, context);

        if (fundStatus === "INCOMPLETE") {
          retryQueue.push(item);
          status = "INCOMPLETE";
          // Kita tidak tambah success/fail dulu, tunggu hasil di Sesi 2
        } else if (fundStatus === false) {
          failCount++;
          status = "FAIL";
          failedLogs.push(`${code}: Scraping gagal total.`);
        } else {
          successCount++;
        }
      } catch (err: any) {
        failCount++;
        status = "FAIL";
        failedLogs.push(`${code}: ${err.message}`);
      }

      if (onProgress)
        onProgress(
          successCount + failCount + retryQueue.length,
          totalEmiten,
          code,
          status,
        );
      await new Promise((r) => setTimeout(r, 200));
    }

    // --- SESI 2: Perbaikan Data Bolong (Retry Stage) ---
    if (retryQueue.length > 0) {
      console.log(
        `\n🛠️ Memperbaiki ${retryQueue.length} emiten dengan data tidak lengkap...`,
      );

      for (const item of retryQueue) {
        try {
          const retryStatus = await updateFundamental(item.code, context);

          if (retryStatus === true) {
            successCount++;
          } else {
            // Jika kesempatan kedua masih gagal/incomplete, baru kita masukkan ke kelompok FAIL
            failCount++;
            failedLogs.push(`${item.code}: Gagal dilengkapi pada sesi retry.`);
          }
        } catch (retryErr: any) {
          failCount++;
          failedLogs.push(`${item.code} (Retry Error): ${retryErr.message}`);
        }
      }
    }
  } finally {
    // Pastikan browser WAJIB ditutup agar lock file dilepas
    await browser.close().catch(() => {});
  }

  return { success: successCount, fail: failCount, failedLogs };
}
