// src/cli/sync-fundamental.ts
import db from "../db";
import { syncDataAll } from "../scrapper";

export const fundamentalSyncState = {
  isActive: false,
};

export async function runFundamentalCli(
  onProgressUpdate: (
    sudahTerprosesGlobal: number,
    totalEmitenGlobal: number,
    code: string,
    status: "OK" | "FAIL",
    sisaTerkini: number,
    batchProcessed: number,
    currentLimit: number,
  ) => void,
): Promise<void> {
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

  function getSisaAntrean(): number {
    const row = db
      .query(
        `
      SELECT COUNT(*) as sisa FROM emiten e
      LEFT JOIN (
        SELECT emiten_id, COUNT(*) as total FROM stock_histories WHERE period = 'FY' GROUP BY emiten_id
      ) h ON e.id = h.emiten_id
      WHERE IFNULL(h.total, 0) < 4 OR e.fundamental_updated_at = '2000-01-01 00:00:00'
    `,
      )
      .get() as { sisa: number } | undefined;
    return row?.sisa ?? 0;
  }

  // Loop utama dikendalikan penuh oleh status ON/OFF sakelar
  while (fundamentalSyncState.isActive) {
    const sisaAwalBatch = getSisaAntrean();
    if (sisaAwalBatch === 0) {
      fundamentalSyncState.isActive = false;
      break;
    }

    let batchProcessed = 0;
    const currentLimit = Math.min(BATCH_SIZE, sisaAwalBatch);

    // Kirim callback yang peka terhadap perubahan sakelar di tengah jalan
    const result = await syncDataAll(
      currentLimit,
      (_currentSuccess, totalEmiten, code, status) => {
        batchProcessed++;

        const sisaTerkini = sisaAwalBatch - batchProcessed;
        const sudahTerprosesGlobal = Math.max(
          0,
          totalEmitenGlobal - sisaTerkini,
        );

        // Jika di tengah-tengah batch user menekan F (Menginginkan OFF), interupsi visualnya
        if (!fundamentalSyncState.isActive) return;

        onProgressUpdate(
          sudahTerprosesGlobal,
          totalEmitenGlobal,
          code,
          status,
          sisaTerkini,
          batchProcessed,
          currentLimit,
        );
      },
    );

    // Cek apakah di tengah jalan sakelar dimatikan
    if (!fundamentalSyncState.isActive) {
      break;
    }

    totalSuccessGlobal += result.success;
    totalFailGlobal += result.fail;
    if (result.failedLogs.length > 0) {
      allFailedLogs.push(...result.failedLogs);
    }

    // Jeda aman antar batch yang bisa di-cancel instant
    for (let i = 0; i < 20; i++) {
      if (!fundamentalSyncState.isActive) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.warn = originalWarn;

  // Cetak rekap hanya jika database benar-benar tamat 100%
  if (getSisaAntrean() === 0) {
    const endTime = performance.now();
    const duration = ((endTime - startTime) / 1000 / 60).toFixed(2);
    console.log(
      `\n\n🏆 [TAMAT] Seluruh data emiten di database berhasil diproses hingga 100%!`,
    );
    console.log(
      `───────────────────────────────────────────────────────────────`,
    );
    console.log(`⏱️  Total Waktu Eksekusi : ${duration} menit`);
    console.log(`📈 Total Sukses Disuntik: ${totalSuccessGlobal} Emiten`);
    console.log(`📉 Total Gagal / Kosong : ${totalFailGlobal} Emiten`);
    console.log(
      `───────────────────────────────────────────────────────────────\n`,
    );
  }
}
