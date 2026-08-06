import { syncCorporateActions } from "../src/services/syncStockService/syncCorporateAction";
import { log } from "../src/utils/log";
import db from "../src/db";

async function testSyncCorporateActions() {
  log("info", "[Test CA] Memulai pengujian syncCorporateActions...");
  const startTime = performance.now();

  try {
    // 1. Cek jumlah data sebelum sync
    const countBefore = (
      db.query("SELECT COUNT(*) as count FROM corporate_actions").get() as {
        count: number;
      }
    ).count;
    log("info", `[Test CA] Jumlah baris DB sebelum sync: ${countBefore}`);

    // 2. Jalankan service sync
    const result = await syncCorporateActions();
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);

    // 3. Cek jumlah data setelah sync
    const countAfter = (
      db.query("SELECT COUNT(*) as count FROM corporate_actions").get() as {
        count: number;
      }
    ).count;

    log("info", `[Test CA Success] Hasil Service: "${result}"`);
    log(
      "info",
      `[Test CA Success] Total DB: ${countBefore} -> ${countAfter} (+${
        countAfter - countBefore
      } row baru) | Durasi: ${duration}s`,
    );
  } catch (error) {
    log(
      "error",
      `[Test CA Failed] Error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

testSyncCorporateActions();
