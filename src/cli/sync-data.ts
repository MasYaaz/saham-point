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
): Promise<{ updated: boolean }> {
  // 1. Cek apakah ada data yang perlu diupdate (Fallback Awal)
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

  function getSisaAntrean(): number {
    const row = db
      .query(
        `SELECT COUNT(*) as sisa FROM emiten 
       WHERE fundamental_updated_at < date('now', '-3 months') 
       OR fundamental_updated_at IS NULL`,
      )
      .get() as { sisa: number } | undefined;
    return row?.sisa ?? 0;
  }

  // Loop utama
  while (fundamentalSyncState.isActive) {
    const sisaAwalBatch = getSisaAntrean();
    if (sisaAwalBatch === 0) {
      fundamentalSyncState.isActive = false;
      break;
    }

    let batchProcessed = 0;
    const currentLimit = Math.min(BATCH_SIZE, sisaAwalBatch);

    const result = await syncDataAll(
      currentLimit,
      (_currentSuccess, totalEmiten, code, status) => {
        batchProcessed++;
        const sisaTerkini = sisaAwalBatch - batchProcessed;
        const sudahTerprosesGlobal = Math.max(
          0,
          totalEmitenGlobal - sisaTerkini,
        );

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

    if (!fundamentalSyncState.isActive) break;

    totalSuccessGlobal += result.success;
    totalFailGlobal += result.fail;
    if (result.failedLogs.length > 0) {
      allFailedLogs.push(...result.failedLogs);
    }

    // Jeda aman antar batch
    for (let i = 0; i < 20; i++) {
      if (!fundamentalSyncState.isActive) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.warn = originalWarn;

  // Cetak rekap hanya jika proses selesai secara natural
  if (fundamentalSyncState.isActive && getSisaAntrean() === 0) {
    const endTime = performance.now();
    const duration = ((endTime - startTime) / 1000 / 60).toFixed(2);
    console.log(`\n\n🏆 [TAMAT] Seluruh data emiten berhasil disinkronisasi!`);
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

  return { updated: true };
}
