import { safeLog } from "../cli/helper/safeLog";
import db from "../db";
import type { EmitenItem } from "../types";
import { initPersistentBrowser } from "../utils/browser";
import { fetchPriceYahoo } from "./helper/fetchPriceYahoo";
import { updateFundamental } from "./helper/updateFundamental";

/**
 * FIX (stuck setelah ~menit ke-10, ketahuan di putaran/batch kedua):
 * `page.close()` di loop cleanup dan `browser.close()` di blok `finally`
 * sebelumnya TIDAK dibungkus timeout sama sekali — beda dengan seluruh
 * operasi Playwright lain di codebase ini (page.goto 12s, waitForSelector
 * 8s, EMITEN_TIMEOUT 40s). `.catch(() => {})` hanya menangkap promise yang
 * REJECT, bukan promise yang hang (tidak pernah resolve/reject).
 *
 * Kalau browser process jadi tidak responsif (mis. karena masih ada
 * koneksi/page menggantung dari item sebelumnya — termasuk "zombie"
 * internalWorker yang selamat dari EMITEN_TIMEOUT tapi masih berjalan di
 * background, lihat catatan di updateFundamental.ts), maka `browser.close()`
 * di akhir batch bisa menunggu SELAMANYA. Karena syncDataAll() dipanggil
 * dengan `await` di dalam while-loop runSyncDataAll(), seluruh proses sync
 * ikut freeze permanen persis di titik ini — gejalanya terlihat seperti
 * "macet di putaran kedua" padahal sumbernya di ekor putaran pertama.
 *
 * withTimeout membungkus promise apa pun dengan batas waktu: kalau lewat,
 * di-log dan dianggap selesai (gagal dengan aman) alih-alih menggantungkan
 * seluruh proses. Ini fail-safe, bukan fix akar masalah kenapa browser bisa
 * jadi tidak responsif — untuk itu perlu diagnosis lebih lanjut di
 * utils/browser.ts (lihat catatan di bawah fungsi ini).
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
  // FIX BUG #4: `retryQueue` sebelumnya dideklarasikan tapi tidak pernah
  // diisi maupun diproses (sisa refactor "SESI 2" yang belum jadi) —
  // dihapus karena menyesatkan pembaca kode. Jika retry per-batch memang
  // diperlukan di masa depan, implementasikan ulang secara utuh (push item
  // yang gagal ke sini, lalu proses di sesi kedua sebelum fungsi return).

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

      // Laporkan progres
      if (onProgress)
        onProgress(successCount + failCount, totalEmiten, code, status);

      // BERSIHKAN MEMORI setiap kali selesai 1 emiten
      // FIX: page.close() dibungkus watchdog 8s per page — sebelumnya bisa
      // hang selamanya jika page tsb sedang stuck (mis. masih dipegang oleh
      // zombie internalWorker yang lolos dari EMITEN_TIMEOUT), yang akan
      // membekukan seluruh loop item berikutnya.
      const pages = context.pages();
      for (const page of pages) {
        await withTimeout(
          page.close().catch(() => null),
          8000,
          `page.close() setelah item ${code}`,
        );
      }

      await new Promise((r) => setTimeout(r, 500)); // Jeda lebih lama agar tidak terdeteksi bot
    }
  } finally {
    // FIX (akar paling mungkin dari "stuck setelah menit ke-10 / putaran
    // kedua"): browser.close() dibungkus watchdog 15s. Kalau browser process
    // tidak responsif, kita LEPASKAN await-nya di sini supaya
    // runSyncDataAll() bisa lanjut ke batch berikutnya alih-alih freeze
    // permanen. Konsekuensinya: proses browser lama berpotensi jadi zombie
    // di OS (leak) sampai initPersistentBrowser() pada panggilan berikutnya
    // mendeteksi/menangani ini — cek utils/browser.ts untuk memastikan ada
    // penanganan browser lama yang tidak sehat (mis. re-launch bersih, atau
    // paksa kill process by PID) supaya tidak menumpuk chrome zombie di server.
    if (browser) {
      await withTimeout(browser.close(), 15000, "browser.close()");
    }
  }

  return { success: successCount, fail: failCount, failedLogs };
}
