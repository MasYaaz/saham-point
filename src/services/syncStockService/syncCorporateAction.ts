import kseiClient, {
  type KseiCorporateActionItem,
} from "../../client/kseiClient";
import db from "../../db";
import { getDateWithOffset } from "../../utils/date/getDayWithOffset";
import { syncDailyDividendFromCA } from "./syncDividendHistories";

/**
 * Mengunduh, memfilter, dan menyimpan data Aksi Korporasi dari API KSEI ke database,
 * serta memicu sinkronisasi riwayat dividen TradingView secara otomatis (Event-Driven).
 *
 * Fitur Utama:
 * - Smart Checkpointing via tabel `sync_ca_history`.
 * - Filtering instrumen saham (hanya kode 4 huruf kapital A-Z).
 * - Batch Transaction SQLite dengan deduplikasi (`INSERT OR IGNORE`).
 * - Event-Driven Trigger ke TradingView WebSocket (hanya untuk pengumuman dividen baru).
 * - Audit Logging untuk pemantauan riwayat eksekusi.
 *
 * @returns {Promise<string>} Ringkasan terstruktur hasil sinkronisasi.
 */
export async function syncCorporateActions(): Promise<string> {
  // 1. Inisialisasi Waktu & Checkpoint Tanggal
  const currentYear = new Date().getFullYear();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(now.getDate()).padStart(2, "0")}`;

  // Ambil checkpoint tanggal sinkronisasi terakhir yang berhasil dari database
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

  // 2. Penentuan Mode Sinkronisasi & Rentang Tanggal Fetching
  let startDate: string;
  let endDate: string;
  let syncMode: "INITIAL" | "CATCH_UP" | "ROUTINE";

  if (!lastSyncedDate) {
    // Mode Initial: Data kosong, fetch dari 1 Jan 2015 s/d akhir tahun berjalan
    syncMode = "INITIAL";
    startDate = "2015-01-01";
    endDate = `${currentYear}-12-31`;
  } else if (lastSyncedDate < today) {
    // Mode Catch-Up: Melanjutkan dari checkpoint terakhir s/d akhir tahun berjalan
    syncMode = "CATCH_UP";
    startDate = lastSyncedDate;
    endDate = `${currentYear}-12-31`;
  } else {
    // Mode Routine: Sudah up-to-date, fetch window H-7 s/d H+90
    syncMode = "ROUTINE";
    startDate = getDateWithOffset(-7);
    endDate = getDateWithOffset(90);
  }

  try {
    // 3. Pengambilan Data Raw dari API KSEI
    const items = await kseiClient.fetchByDateRange(startDate, endDate);

    let totalInserted = 0;
    let filteredCount = 0;
    let divSummary = " | Dividen TV: Tidak ada event baru";

    if (items.length > 0) {
      // 4. Filtering Instrumen: Amankan hanya saham murni (4 huruf kapital A-Z)
      const stockItems = items.filter((item) => {
        if (!item.security_code) return false;
        return /^[A-Z]{4}$/.test(item.security_code.trim());
      });

      filteredCount = stockItems.length;

      if (stockItems.length > 0) {
        // Prepared Statement Batch Insert
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

        // Penampung emiten yang BENAR-BENAR BARU tersimpan & bertipe dividen
        const newDividendTickers = new Set<string>();

        // 5. Eksekusi Batch Insert dalam Transaksi SQLite
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

              // Kumpulkan ticker HANYA jika record baru berhasil disisipkan (changes > 0)
              if (result.changes > 0) {
                count++;
                const type = (item.type_of_ca || "").toUpperCase();
                if (type.includes("DIVIDEND") || type.includes("DIVIDEN")) {
                  if (item.security_code) {
                    newDividendTickers.add(
                      item.security_code.trim().toUpperCase(),
                    );
                  }
                }
              }
            }
            return count;
          },
        );

        totalInserted = runBatchInsert(stockItems);

        // 6. Trigger Event-Driven Sync Dividen TradingView (Khusus Ticker Baru)
        if (newDividendTickers.size > 0) {
          const targetArray = Array.from(newDividendTickers);
          const divResult = await syncDailyDividendFromCA(targetArray);

          const syncedList =
            divResult.syncedCodes.length > 0
              ? ` (${divResult.syncedCodes.join(", ")})`
              : "";

          divSummary = ` | Dividen TV Baru: ${divResult.successCount}/${divResult.totalTarget} emiten dikirim${syncedList}`;
        }
      }
    }

    // 7. Perbarui Checkpoint Tanggal & Simpan Audit Log (Status: SUCCESS)
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

    return `[SYNC CA KSEI - ${syncMode}] Periode: ${startDate} s/d ${endDate} | Raw API: ${items.length} | Saham Lolos: ${filteredCount} | CA Baru: ${totalInserted}${divSummary}`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // 8. Simpan Audit Log (Status: FAILED) Tanpa Memajukan Checkpoint Tanggal
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
