import db from "../../db";
import { syncDataAll } from "../../scrapper";
import { safeLog } from "./safeLog";

export const fundamentalSyncState = {
  isActive: false,
};

export async function runSyncDataAll(
  onProgressUpdate: (
    sudahTerprosesGlobal: number,
    totalEmitenGlobal: number,
    code: string,
    status: "OK" | "FAIL" | "INCOMPLETE",
    sisaTerkini: number,
    batchProcessed: number,
    currentLimit: number,
  ) => void,
): Promise<{ updated: boolean }> {
  function getSisaAntrean(): number {
    const row = db
      .query(
        `SELECT COUNT(*) as sisa FROM emiten 
       WHERE (
         (is_profile_complete = 0 OR is_fundamental_complete = 0) 
         AND (fundamental_updated_at < datetime('now', '-2 hours') OR fundamental_updated_at = '2000-01-01 00:00:00')
       ) OR (
         is_profile_complete = 1 AND is_fundamental_complete = 1 
         AND (fundamental_updated_at < date('now', '-3 months') OR fundamental_updated_at = '2000-01-01 00:00:00')
       )`,
      )
      .get() as { sisa: number } | undefined;
    return row?.sisa ?? 0;
  }

  // 1. Cek sisa awal (Hanya dijalankan sekali di awal)
  const sisaAwal = getSisaAntrean();
  if (sisaAwal === 0) {
    return { updated: false };
  }

  const originalWarn = console.warn;
  console.warn = () => {};
  const startTime = performance.now();
  const BATCH_SIZE = 20;

  let totalSuccessGlobal = 0;
  let totalFailGlobal = 0;
  const allFailedLogs: string[] = [];

  const countRow = db.query("SELECT COUNT(*) as total FROM emiten").get() as
    | { total: number }
    | undefined;
  const totalEmitenGlobal = countRow?.total ?? 1;

  // FIX: Hitung posisi awal terproses global di memori
  let sudahTerprosesGlobal = Math.max(0, totalEmitenGlobal - sisaAwal);

  // FIX BUG #5: Emiten berstatus INCOMPLETE/FAIL bisa masuk antrean lagi
  // di batch berikutnya dalam sesi yang sama. Tanpa pelacakan kode yang
  // sudah pernah dihitung, sudahTerprosesGlobal bisa di-increment berkali-kali
  // untuk emiten yang sama sehingga melebihi totalEmitenGlobal (progress > 100%).
  // Set ini memastikan setiap kode hanya menambah counter global sekali per sesi.
  const processedCodesGlobal = new Set<string>();

  // Loop utama
  while (fundamentalSyncState.isActive) {
    const sisaAwalBatch = getSisaAntrean();
    if (sisaAwalBatch === 0) {
      fundamentalSyncState.isActive = false;
      break;
    }

    let batchProcessed = 0;
    const currentLimit = Math.min(BATCH_SIZE, sisaAwalBatch);

    try {
      const result = await syncDataAll(
        currentLimit,
        (_currentSuccess, totalEmiten, code, status) => {
          batchProcessed++;

          // FIX BUG #5: hanya increment counter global jika kode ini
          // belum pernah dihitung sebelumnya di sesi ini.
          if (!processedCodesGlobal.has(code)) {
            processedCodesGlobal.add(code);
            sudahTerprosesGlobal++;
          }

          if (status === "FAIL" || status === "INCOMPLETE") {
            const nowStr = new Date(
              new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
            )
              .toISOString()
              .replace("T", " ")
              .substring(0, 19);

            // FIX BUG #3 (klarifikasi kontrak): updateFundamental() SENGAJA
            // tidak menyentuh fundamental_updated_at saat status INCOMPLETE/FAIL.
            // Baris ini adalah satu-satunya sumber kebenaran untuk menerapkan
            // cooldown 2 jam sebelum emiten tsb masuk antrean lagi, supaya
            // tidak terjadi retry-loop instan untuk emiten yang terus gagal.
            db.run(
              "UPDATE emiten SET fundamental_updated_at = ? WHERE code = ?",
              [nowStr, code],
            );
          }

          const sisaTerkini = Math.max(0, sisaAwalBatch - batchProcessed);

          if (!fundamentalSyncState.isActive) return;

          onProgressUpdate(
            // FIX BUG #5: clamp agar tidak pernah melebihi total (jaga-jaga
            // untuk skenario tepi, mis. jumlah emiten berubah di tengah sesi).
            Math.min(sudahTerprosesGlobal, totalEmitenGlobal),
            totalEmitenGlobal,
            code,
            status,
            sisaTerkini,
            batchProcessed,
            currentLimit,
          );
        },
      );

      if (!fundamentalSyncState.isActive) break;

      totalSuccessGlobal += result.success;
      totalFailGlobal += result.fail;

      if (result.failedLogs.length > 0) {
        allFailedLogs.push(...result.failedLogs);
      }
    } catch (batchError: any) {
      // Proteksi tambahan agar jika syncDataAll crash (misal Playwright error fatal), loop tidak stuck
      safeLog(
        "error",
        `\n[CLI Error] Kritis pada batch ini: ${batchError.message}`,
      );

      // FIX 3: Jika kegagalan disebabkan oleh kerusakan browser (Bukan masalah emiten),
      // matikan putaran loop secara terhormat demi menyelamatkan siklus CPU container Docker.
      if (batchError.message.includes("CRITICAL_BROWSER_FAILURE")) {
        safeLog(
          "error",
          "❌ Menghentikan sinkronisasi secara paksa karena mesin browser bermasalah.",
        );
        fundamentalSyncState.isActive = false;
        break;
      }

      const sisaBelumTerproses = Math.max(0, currentLimit - batchProcessed);
      totalFailGlobal += sisaBelumTerproses;
      sudahTerprosesGlobal += sisaBelumTerproses; // Tetap majukan counter agar tidak loop selamanya

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Jeda aman antar batch
    for (let i = 0; i < 20; i++) {
      if (!fundamentalSyncState.isActive) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.warn = originalWarn;

  if (getSisaAntrean() === 0) {
    const endTime = performance.now();
    const duration = ((endTime - startTime) / 1000 / 60).toFixed(2);
    safeLog(
      "log",
      `\n\n 🏆 [Selesai] Seluruh data emiten berhasil disinkronisasi!`,
    );
    safeLog(
      "log",
      `───────────────────────────────────────────────────────────────`,
    );
    safeLog("log", ` ⏱️  Total Waktu Eksekusi : ${duration} menit`);
    safeLog("log", ` 📈 Total Sukses Disuntik: ${totalSuccessGlobal} Emiten`);
    safeLog("log", ` 📉 Total Gagal / Kosong : ${totalFailGlobal} Emiten`);
    safeLog(
      "log",
      `───────────────────────────────────────────────────────────────\n`,
    );
  }

  return { updated: true };
}
