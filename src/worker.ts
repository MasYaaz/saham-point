import cron from "node-cron";
import { safeLog } from "./utils/safeLog";
import {
  syncMarketData,
  syncMarketPrice,
} from "./services/scraperService/syncMarketData";

let isSyncing = false;

async function executeSync(
  syncFn: () => Promise<string>,
  label: string,
): Promise<void> {
  if (isSyncing) {
    safeLog(
      "warn",
      `[Worker] Sinkronisasi (${label}) dilewati karena proses lain masih berjalan.`,
    );
    return;
  }

  isSyncing = true;
  try {
    const status = await syncFn();
    safeLog("info", `[Sync Success] ${label}: ${status}`);
  } catch (error) {
    safeLog(
      "error",
      `[Sync Error] Gagal pada ${label}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    isSyncing = false;
  }
}

export function startMarketWorker(): void {
  safeLog("info", "[Worker] Scheduler bursa saham aktif (Asia/Jakarta).");

  // Jalankan sinkronisasi awal saat worker pertama kali dipanggil
  executeSync(syncMarketData, "Initial Startup Sync");

  /**
   * Scheduler Sinkronisasi Harga Pasar Real-Time (Setiap 1 menit, Senin-Jumat, 09:00 - 16:59 WIB)
   */
  const task = cron.schedule(
    "*/1 9-16 * * 1-5",
    async () => {
      await executeSync(syncMarketPrice, "Cron Market Price Sync");
    },
    {
      timezone: "Asia/Jakarta",
    },
  );

  // Graceful Shutdown Handler
  const handleShutdown = (signal: string) => {
    safeLog(
      "info",
      `[Worker] Menerima sinyal ${signal}. Mematikan scheduler...`,
    );
    task.stop();
  };

  process.once("SIGINT", () => handleShutdown("SIGINT"));
  process.once("SIGTERM", () => handleShutdown("SIGTERM"));
}
