#!/usr/bin/env bun
import cron from "node-cron";
import { syncMarketPrices } from "./cli/scrapper";

export function initBackgroundWorker() {
  console.log(
    "[Worker] Schedulers bursa saham aktif (Locked to Asia/Jakarta Time).",
  );

  /**
   * 1. SCHEDULER HARGA SAHAM (Setiap 1 menit, Senin-Jumat jam 09:00-16:59 WIB)
   */
  cron.schedule(
    "*/1 9-16 * * 1-5",
    async () => {
      // console.log(
      //   "[Worker] Menjalankan antrean fetch harga saham real-time...",
      // );
      try {
        const logStatus = await syncMarketPrices(30);
        // console.log(`${logStatus}`);
      } catch (error) {
        // console.error("[Worker Error] Gagal mengeksekusi sync harga:", error);
      }
    },
    {
      timezone: "Asia/Jakarta",
    },
  );
}
