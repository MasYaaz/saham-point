import path from "node:path";

// ============================================================================
// 1. DOKAN & PAKSA WORKING DIRECTORY KE ROOT PROJECT
// ============================================================================
const currentDir = import.meta.dir;
// Jika file berada di folder 'test' atau 'scripts', naik 1 level ke root
const rootDir =
  currentDir.endsWith("test") || currentDir.endsWith("scripts")
    ? path.resolve(currentDir, "..")
    : currentDir;

process.chdir(rootDir);
console.log(
  `📂 [Environment] Working Directory dikunci ke: ${process.cwd()}\n`,
);

// ============================================================================
// 2. DYNAMIC IMPORT (Di-load setelah process.cwd() berubah ke root)
// ============================================================================
const { fetchPriceTradingView } =
  await import("../src/services/tradingviewServices/fetchScreener");
const { default: db } = await import("../src/db");
import type { EmitenItem } from "../src/types";

// ============================================================================
// 3. FUNGSI UTAMA TESTER
// ============================================================================
async function runTest() {
  console.log("🚀 [Tester] Menjalankan Pengujian fetchPriceTradingView...\n");

  // 1. Ambil 5 emiten sampel dari database (termasuk IHSG & ticker populer)
  const sampleEmiten = db
    .query(
      `
      SELECT id, code, description, last_price, beta, pbv, per, roe, der, price_updated_at, fundamental_updated_at
      FROM emiten
      WHERE code IN ('BBCA', 'BBRI', 'TLKM', 'IHSG', 'GOTO')
      LIMIT 5
      `,
    )
    .all() as EmitenItem[];

  // Fallback jika database lokal belum punya data
  const testQueue: EmitenItem[] =
    sampleEmiten.length > 0
      ? sampleEmiten
      : ([
          { id: 1, code: "BBCA", last_price: 0 },
          { id: 2, code: "BBRI", last_price: 0 },
          { id: 3, code: "IHSG", last_price: 0 },
        ] as EmitenItem[]);

  console.log(
    `📦 Ticker yang akan di-fetch (${testQueue.length} items):`,
    testQueue.map((e) => e.code).join(", "),
  );

  // 2. Eksekusi Batch Fetch
  const startTime = performance.now();
  const result = await fetchPriceTradingView(testQueue);
  const endTime = performance.now();

  console.log(`\n⏱️ Durasi Eksekusi : ${(endTime - startTime).toFixed(2)} ms`);
  console.log(
    `📊 Hasil Batch     : Berhasil: ${result.successCount} | Gagal: ${result.failCount}\n`,
  );

  // 3. Verifikasi Data Hasil Update di SQLite
  console.log("🔍 === DATA HASIL UPDATE DI DATABASE ===");
  for (const item of testQueue) {
    const row = db
      .query(
        `
        SELECT code, last_price, previous_close, day_high, day_low, pbv, per, roe, der, beta, price_updated_at
        FROM emiten
        WHERE code = ?
      `,
      )
      .get(item.code);

    console.log(`\n--- [${item.code}] ---`);
    console.table(row);
  }
}

runTest().catch(console.error);
