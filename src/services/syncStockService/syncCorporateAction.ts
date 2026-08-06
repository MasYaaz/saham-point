import kseiClient, {
  type KseiCorporateActionItem,
} from "../../client/kseiClient";
import db from "../../db";
import { getDateWithOffset } from "../../utils/date/getDayWithOffset";

/**
 * Mengunduh, memfilter, dan menyimpan data aksi korporasi saham dari KSEI ke database.
 *
 * Fitur Utama:
 * - Smart Checkpointing via tabel `sync_ca_history`.
 * - Regex Filtering (hanya menyimpan emiten saham 4-huruf kapital).
 * - Batch Transaction dengan deduplikasi otomatis (`INSERT OR IGNORE`).
 * - Audit logging untuk memantau status eksekusi.
 *
 * @returns Ringkasan hasil sinkronisasi (Total API, Total Lolos Filter, Total Disimpan)
 */
export async function syncCorporateActions(): Promise<string> {
  // 1. Dapatkan tanggal hari ini dalam format ISO (YYYY-MM-DD)
  const currentYear = new Date().getFullYear();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(now.getDate()).padStart(2, "0")}`;

  // 2. Ambil checkpoint tanggal sync terakhir yang berhasil dari database
  const lastSyncRow = db
    .query(
      `
      SELECT last_synced_date
      FROM sync_ca_history
      WHERE status = 'SUCCESS'
      ORDER BY id DESC
      LIMIT 1
    `,
    )
    .get() as { last_synced_date: string } | null;

  const lastSyncedDate = lastSyncRow?.last_synced_date || null;

  // 3. Tentukan mode & rentang tanggal fetching (Initial, Catch-Up, atau Routine Sync)
  let startDate: string;
  let endDate: string;

  if (!lastSyncedDate) {
    // Mode Initial Sync: Data kosong, fetch dari 1 Jan 2015 s/d akhir tahun ini
    startDate = "2015-01-01";
    endDate = `${currentYear}-12-31`;
  } else if (lastSyncedDate < today) {
    // Mode Catch-Up Sync: Melanjutkan sync dari checkpoint terakhir s/d akhir tahun ini
    startDate = lastSyncedDate;
    endDate = `${currentYear}-12-31`;
  } else {
    // Mode Routine Sync: Sudah up-to-date, fetch window H-7 s/d H+90
    startDate = getDateWithOffset(-7);
    endDate = getDateWithOffset(90);
  }

  try {
    // 4. Pengambilan data raw dari API KSEI
    const items = await kseiClient.fetchByDateRange(startDate, endDate);

    let totalInserted = 0;
    let filteredCount = 0;

    if (items.length > 0) {
      // 5. Filter instrumen: Hanya amankan kode saham murni 4 huruf kapital (A-Z)
      const stockItems = items.filter((item) => {
        if (!item.security_code) return false;
        return /^[A-Z]{4}$/.test(item.security_code.trim());
      });

      filteredCount = stockItems.length;

      if (stockItems.length > 0) {
        // Prepare Statement untuk penyimpanan massal
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO corporate_actions (
            security_code,
            security_name,
            display_name,
            type_of_ca,
            cum_date,
            record_date,
            effective_date,
            start_date,
            end_date,
            distribution_date,
            description
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Execusi batch insert dalam satu database transaction
        const runBatchInsert = db.transaction(
          (dataList: KseiCorporateActionItem[]) => {
            let count = 0;
            for (const item of dataList) {
              const result = stmt.run(
                item.security_code || "",
                item.security_name || "",
                item.display_name || "",
                item.type_of_ca || "",
                item.cum_date || "",
                item.record_date || "",
                item.effective_date || "",
                item.start_date || "",
                item.end_date || "",
                item.distribution_date || "",
                item.description || "",
              );

              if (result.changes > 0) {
                count++;
              }
            }
            return count;
          },
        );

        totalInserted = runBatchInsert(stockItems);
      }
    }

    // 6. Hitung checkpoint tanggal baru dan rekam audit log SUKSES
    const newCheckpointDate = endDate < today ? endDate : today;

    db.prepare(
      `
      INSERT INTO sync_ca_history (
        last_synced_date,
        status,
        total_fetched,
        total_inserted,
        error_message,
        created_at
      ) VALUES (?, 'SUCCESS', ?, ?, '', datetime('now'))
    `,
    ).run(newCheckpointDate, items.length, totalInserted);

    return `Total API: ${items.length} | Saham 4-Huruf: ${filteredCount} | Disimpan: ${totalInserted}`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Rekam audit log GAGAL (Checkpoint tanggal tidak dimajukan)
    db.prepare(
      `
      INSERT INTO sync_ca_history (
        last_synced_date,
        status,
        total_fetched,
        total_inserted,
        error_message,
        created_at
      ) VALUES (?, 'FAILED', 0, 0, ?, datetime('now'))
    `,
    ).run(lastSyncedDate || "2015-01-01", errorMsg);

    throw error;
  }
}
