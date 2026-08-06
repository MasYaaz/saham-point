import { syncStockList } from "../src/services/syncStockService/syncStockList";
import db from "../src/db";

async function main() {
  console.log("🚀 [Tester] Memulai eksekusi real syncStockList()...\n");

  const startTime = performance.now();

  try {
    // 1. Eksekusi fungsi
    const result = await syncStockList();
    const duration = ((performance.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ [Hasil]: ${result}`);
    console.log(`⏱️  [Waktu Eksekusi]: ${duration} detik\n`);

    // 2. Cek sampel data di DB
    const totalEmiten = db
      .query("SELECT COUNT(*) as total FROM emiten")
      .get() as { total: number };

    const sampleData = db
      .query(
        "SELECT code, name, sector, last_price, updated_at FROM emiten LIMIT 3",
      )
      .all();

    console.log(`📊 [Total Emiten di DB]: ${totalEmiten.total}`);
    console.log("🔍 [Sampel Data Emiten]:");
    console.table(sampleData);
  } catch (error) {
    console.error("❌ [Tester Error]:", error);
  } finally {
    process.exit(0);
  }
}

main();
