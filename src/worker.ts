#!/usr/bin/env bun
import cron from "node-cron";
import { safeLog } from "./utils/safeLog";
import { syncMarketData } from "./cli/scraper/syncMarketData";

/** Flag untuk mencegah eksekusi bertumpuk jika sinkronisasi sebelumnya belum selesai */
let isSyncing = false;

/**
 * Memulai scheduler latar belakang untuk sinkronisasi data bursa saham.
 * Seluruh jadwal dikunci menggunakan zona waktu Asia/Jakarta (WIB).
 */
function initBackgroundWorker(): void {
  safeLog("info", "[Worker] Scheduler bursa saham aktif (Asia/Jakarta).");

  /**
   * Scheduler Sinkronisasi Harga Pasar Real-Time
   * Dijalankan setiap 1 menit pada hari kerja (Senin-Jumat) pukul 09:00 - 16:59 WIB.
   */
  const task = cron.schedule(
    "*/1 9-16 * * 1-5",
    async () => {
      if (isSyncing) {
        safeLog(
          "warn",
          "[Worker] Sinkronisasi sebelumnya masih berjalan, melewati siklus ini.",
        );
        return;
      }

      isSyncing = true;

      try {
        const logStatus = await syncMarketData();
        safeLog("info", logStatus);
      } catch (error) {
        safeLog(
          "error",
          `[Worker Error] Gagal mengeksekusi sinkronisasi harga: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        isSyncing = false;
      }
    },
    {
      timezone: "Asia/Jakarta",
    },
  );

  // Handling penghentian proses secara bersih (Graceful Shutdown)
  const handleShutdown = (signal: string) => {
    safeLog(
      "info",
      `[Worker] Menerima sinyal ${signal}. Mematikan scheduler...`,
    );
    task.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
}

// Jalankan worker secara langsung
initBackgroundWorker();
