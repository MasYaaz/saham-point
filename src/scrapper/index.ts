import db from "../db";
import type { EmitenItem } from "../types";
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
    status: "OK" | "FAIL",
  ) => void,
): Promise<{ success: number; fail: number; failedLogs: string[] }> {
  // 1. Hitung total baris semua saham yang ada di database emiten
  const countRow = db.query("SELECT COUNT(*) as total FROM emiten").get() as
    | { total: number }
    | undefined;
  const totalEmiten = countRow?.total ?? 1; // Fallback ke 1 agar tidak terjadi pembagian dengan angka 0

  // 2. Ambil antrean berdasarkan data fundamental yang paling usang atau histori belum lengkap
  const queue = db
    .query(
      ` 
        SELECT e.id, e.code, e.description, e.last_price, e.beta, e.pbv, 
              e.per, e.roe, e.der, e.price_updated_at, e.fundamental_updated_at 
        FROM emiten e 
        LEFT JOIN ( 
            SELECT emiten_id, COUNT(*) as total 
            FROM stock_histories 
            WHERE period = 'FY' 
            GROUP BY emiten_id 
        ) h ON e.id = h.emiten_id 
        -- Tambahkan filter di bawah ini:
        WHERE e.fundamental_updated_at < date('now', '-3 months') 
          OR e.fundamental_updated_at IS NULL
        ORDER BY CASE 
            WHEN IFNULL(h.total, 0) < 4 THEN 0 
            ELSE 1 
        END ASC, 
        e.fundamental_updated_at ASC 
        LIMIT ? 
    `,
    )
    .all(limit) as EmitenItem[];

  if (queue.length === 0) {
    return { success: 0, fail: 0, failedLogs: ["Antrian fundamental kosong."] };
  }

  let successCount = 0;
  let failCount = 0;
  const failedLogs: string[] = [];
  const totalItems = queue.length;

  for (let i = 0; i < totalItems; i++) {
    const item = queue[i];

    // PROTEKSI SAFETY: Pengecekan aman jika item atau code bernilai undefined
    if (!item || !item.code) {
      failCount++;
      continue;
    }

    const code = item.code.toUpperCase();
    let currentStatus: "OK" | "FAIL" = "OK";

    try {
      // ──────────────────────────────────────────────────────────────
      // AKSUB-PROSES 1: SINKRONISASI HARGA REAL-TIME (Yahoo Chart API)
      // ──────────────────────────────────────────────────────────────
      let priceSuccess = false;
      try {
        priceSuccess = await fetchPriceYahoo(item);
      } catch (priceErr: any) {
        failedLogs.push(
          `[Price Sync Error] ${code}: ${priceErr?.message || "Gagal fetch harga"}`,
        );
      }

      // ──────────────────────────────────────────────────────────────
      // AKSUB-PROSES 2: SINKRONISASI DATA FUNDAMENTAL & HISTORI
      // ──────────────────────────────────────────────────────────────
      const fundSuccess = await updateFundamental(code);

      // Emiten dianggap sukses jika data fundamental berhasil masuk
      if (fundSuccess) {
        successCount++;
      } else {
        failCount++;
        currentStatus = "FAIL";
        failedLogs.push(
          `${code}: Data profile atau finansial dari Yahoo kosong/null`,
        );
      }
    } catch (error: any) {
      failCount++;
      currentStatus = "FAIL";
      failedLogs.push(
        `${code}: ${error?.message || "Terjadi kesalahan sistem"}`,
      );
    }

    // Pemicu callback progress ke TUI / CLI
    if (onProgress) {
      const currentSyncedRow = db
        .query(
          `
          SELECT COUNT(DISTINCT emiten_id) as total 
          FROM stock_histories 
          WHERE period = 'FY'
          `,
        )
        .get() as { total: number } | undefined;
      const currentSyncedCount = currentSyncedRow?.total ?? successCount;

      onProgress(currentSyncedCount, totalEmiten, code, currentStatus);
    }

    // Jeda dinamis agar scraping natural dan menghindari rate-limit Yahoo Finance
    const delay = Math.floor(Math.random() * (300 - 150 + 1)) + 150;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return { success: successCount, fail: failCount, failedLogs };
}
