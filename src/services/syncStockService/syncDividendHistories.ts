import db from "../../db";
import type { EmitenItem } from "../../types";
import {
  fetchDividendHistories,
  type DividendEventRecord,
} from "../tradingviewServices/fetchDividendHistories";

export const dividendHistoriesSyncState = {
  isActive: false,
};

export interface DailyDividendSyncResult {
  totalTarget: number;
  successCount: number;
  failCount: number;
  syncedCodes: string[];
}

// Prepared Statement Reusable untuk Insert/Replace Event Dividen
const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO dividend_histories (
    emiten_id, year, type, cash_dividend, ex_date, record_date, payment_date
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?
  )
`);

/**
 * Shared Helper: Memproses Fetch WebSocket & Insert Transaksi Dividen untuk 1 Emiten
 */
async function processSingleEmitenDividend(item: EmitenItem): Promise<boolean> {
  const code = item.code.toUpperCase();
  const symbol = `IDX:${code}`;

  const dividendResult = await fetchDividendHistories(symbol);

  if (!dividendResult || !dividendResult.data) {
    db.run(
      "UPDATE emiten SET dividend_updated_at = datetime('now') WHERE code = ?",
      [code],
    );
    return false;
  }

  // Wrap ke dalam SQLite Transaction untuk Batch Insert Presisi
  db.transaction((records: DividendEventRecord[]) => {
    for (const record of records) {
      insertStmt.run(
        item.id,
        record.year,
        record.type,
        record.cash_dividend,
        record.ex_date,
        record.record_date,
        record.payment_date,
      );
    }

    db.run(
      "UPDATE emiten SET is_dividend_complete = 1, dividend_updated_at = datetime('now') WHERE code = ?",
      [code],
    );
  })(dividendResult.data);

  return true;
}

// ============================================================================
// 1. FULL / BACKGROUND SYNC RUNNER (Dipanggil oleh MCP Tool 'manage_dividend_histories_sync')
// ============================================================================
export async function syncDividendHistories(
  onProgress?: (
    currentCount: number,
    totalQueue: number,
    code: string,
    status: "OK" | "FAIL" | "INCOMPLETE",
  ) => void,
): Promise<string> {
  dividendHistoriesSyncState.isActive = true;
  const startTime = performance.now();

  let successCount = 0;
  let failCount = 0;
  let processedCount = 0;

  try {
    // Ambil seluruh antrean emiten yang belum komplet dividennya
    const queue = db
      .query(
        `
        SELECT * FROM emiten
        WHERE is_dividend_complete = 0
        ORDER BY code ASC
      `,
      )
      .all() as EmitenItem[];

    if (queue.length === 0) {
      return "Antrean sinkronisasi dividen kosong";
    }

    for (const item of queue) {
      if (!dividendHistoriesSyncState.isActive) {
        break; // Hentikan loop jika sinyal 'pause' diterima
      }

      const code = item.code.toUpperCase();
      let status: "OK" | "FAIL" | "INCOMPLETE" = "OK";
      processedCount++;

      try {
        const ok = await processSingleEmitenDividend(item);
        if (ok) {
          successCount++;
        } else {
          failCount++;
          status = "INCOMPLETE";
        }
      } catch {
        failCount++;
        status = "FAIL";
        db.run(
          "UPDATE emiten SET dividend_updated_at = datetime('now') WHERE code = ?",
          [code],
        );
      }

      if (onProgress) {
        onProgress(processedCount, queue.length, code, status);
      }

      // Delay 300ms antar emiten agar aman dari rate-limit WebSocket TradingView
      await new Promise((r) => setTimeout(r, 300));
    }

    const duration = ((performance.now() - startTime) / 1000 / 60).toFixed(2);
    return `Total: ${queue.length} | Sukses: ${successCount} | Gagal: ${failCount} (${duration}m)`;
  } finally {
    dividendHistoriesSyncState.isActive = false;
  }
}

// ============================================================================
// 2. DAILY / EVENT-DRIVEN SYNC RUNNER (Dipanggil Otomatis Setelah Sync KSEI CA)
// ============================================================================
export async function syncDailyDividendFromCA(
  targetCodes?: string[],
): Promise<DailyDividendSyncResult> {
  let queue: EmitenItem[] = [];

  if (targetCodes && targetCodes.length > 0) {
    // Mode A: Menerima array kode emiten dari hasil sync KSEI CA hari ini
    const cleanCodes = Array.from(
      new Set(targetCodes.map((c) => c.trim().toUpperCase())),
    );
    const placeholders = cleanCodes.map(() => "?").join(",");
    queue = db
      .query(`SELECT * FROM emiten WHERE UPPER(code) IN (${placeholders})`)
      .all(...cleanCodes) as EmitenItem[];
  } else {
    // Mode B: Query DB corporate_actions untuk event DIVIDEND 24 jam terakhir
    queue = db
      .query(
        `
        SELECT DISTINCT e.*
        FROM emiten e
        JOIN corporate_actions ca ON ca.security_code = e.code
        WHERE (ca.type_of_ca LIKE '%DIVIDEND%' OR ca.type_of_ca LIKE '%DIVIDEN%')
          AND (
            ca.created_at >= datetime('now', '-1 day')
            OR ca.updated_at >= datetime('now', '-1 day')
          )
      `,
      )
      .all() as EmitenItem[];
  }

  if (queue.length === 0) {
    return { totalTarget: 0, successCount: 0, failCount: 0, syncedCodes: [] };
  }

  let successCount = 0;
  let failCount = 0;
  const syncedCodes: string[] = [];

  for (const item of queue) {
    const code = item.code.toUpperCase();
    try {
      const ok = await processSingleEmitenDividend(item);
      if (ok) {
        successCount++;
        syncedCodes.push(code);
      } else {
        failCount++;
      }
    } catch (error) {
      failCount++;
      console.error(
        `[Daily Dividend Sync] Gagal sync TV dividen '${code}':`,
        error,
      );
    }

    // Delay 300ms
    await new Promise((r) => setTimeout(r, 300));
  }

  return {
    totalTarget: queue.length,
    successCount,
    failCount,
    syncedCodes,
  };
}
