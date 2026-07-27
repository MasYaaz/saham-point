import db from "../../../db";
import type { EmitenItem } from "../../../types";

/**
 * Mengambil harga pasar real-time dan rasio fundamental ringkas untuk banyak emiten sekaligus (Batch).
 * Menggunakan 1 kali HTTP POST Request ke TradingView Scanner API, lalu memperbarui database
 * menggunakan transaksi atomik SQLite.
 *
 * @param items - Daftar objek `EmitenItem` yang akan diperbarui.
 * @returns Objek berisi statistik jumlah emiten yang berhasil dan gagal diperbarui.
 */
export async function fetchPriceTradingView(
  items: EmitenItem[],
): Promise<{ successCount: number; failCount: number }> {
  if (items.length === 0) return { successCount: 0, failCount: 0 };

  const nowStr = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  )
    .toISOString()
    .replace("T", " ")
    .substring(0, 19);

  // 1. Inisialisasi Mapping Ticker ke Item Database
  const tickerMap = new Map<string, EmitenItem>();
  const tickers: string[] = [];

  for (const item of items) {
    const tvTicker =
      item.code.toUpperCase() === "IHSG"
        ? "IDX:COMPOSITE"
        : `IDX:${item.code.toUpperCase()}`;
    tickerMap.set(tvTicker, item);
    tickers.push(tvTicker);
  }

  // 2. Fetch Data dari TradingView Scanner API
  try {
    const response = await fetch(
      "https://scanner.tradingview.com/indonesia/scan",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
          symbols: { tickers },
          columns: [
            "close", // 0: last_price
            "change_abs", // 1: change_abs (untuk kalkulasi previous_close)
            "high", // 2: day_high
            "low", // 3: day_low
            "price_book_fq", // 4: pbv
            "price_earnings_ttm", // 5: per
            "return_on_equity_fq", // 6: roe
            "debt_to_equity_fq", // 7: der
            "beta_1_year", // 8: beta
            "description", // 9: description
          ],
        }),
      },
    );

    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

    const body: any = await response.json();
    const rows = body?.data ?? [];

    let successCount = 0;
    let failCount = 0;

    // 3. Inisialisasi Prepared Statements untuk Update Fast-Bulk SQLite
    const updateSuccessStmt = db.prepare(`
      UPDATE emiten
      SET
        last_price = $last_price,
        previous_close = $previous_close,
        day_high = $day_high,
        day_low = $day_low,
        pbv = COALESCE($pbv, pbv),
        per = COALESCE($per, per),
        roe = COALESCE($roe, roe),
        der = COALESCE($der, der),
        beta = COALESCE($beta, beta),
        description = CASE WHEN description = '' OR description IS NULL THEN $description ELSE description END,
        price_updated_at = $now,
        fundamental_updated_at = $now
      WHERE id = $id
    `);

    const updateFailedStmt = db.prepare(`
      UPDATE emiten SET price_updated_at = $now WHERE id = $id
    `);

    const processedIds = new Set<number>();

    // 4. Transaksi Atomik SQLite untuk Eksekusi Cepat (< 5ms)
    const runUpdates = db.transaction(() => {
      for (const row of rows) {
        const tvTicker = row.s;
        const item = tickerMap.get(tvTicker);
        if (!item) continue;

        processedIds.add(item.id);
        const d = row.d;

        const lastPrice = parseFloat(d[0] ?? 0);
        const changeAbs = parseFloat(d[1] ?? 0);
        const dayHigh = parseFloat(d[2] ?? lastPrice);
        const dayLow = parseFloat(d[3] ?? lastPrice);

        if (lastPrice > 0) {
          const previousClose = lastPrice - changeAbs;

          updateSuccessStmt.run({
            $last_price: lastPrice,
            $previous_close: previousClose,
            $day_high: dayHigh,
            $day_low: dayLow,
            $pbv: d[4] !== null ? parseFloat(d[4]) : null,
            $per: d[5] !== null ? parseFloat(d[5]) : null,
            $roe: d[6] !== null ? parseFloat(d[6]) : null,
            $der: d[7] !== null ? parseFloat(d[7]) : null,
            $beta: d[8] !== null ? parseFloat(d[8]) : null,
            $description: d[9] || "",
            $now: nowStr,
            $id: item.id,
          });
          successCount++;
        } else {
          updateFailedStmt.run({ $now: nowStr, $id: item.id });
          failCount++;
        }
      }

      // Tandai emiten yang tidak terespons oleh TradingView Scanner
      for (const item of items) {
        if (!processedIds.has(item.id)) {
          updateFailedStmt.run({ $now: nowStr, $id: item.id });
          failCount++;
        }
      }
    });

    runUpdates();
    return { successCount, failCount };
  } catch (error) {
    // 5. Fallback Penanganan Kesalahan Jaringan (Network Error)
    const updateFailedStmt = db.prepare(
      `UPDATE emiten SET price_updated_at = ? WHERE id = ?`,
    );
    const markAllFailed = db.transaction(() => {
      for (const item of items) {
        updateFailedStmt.run(nowStr, item.id);
      }
    });
    markAllFailed();

    return { successCount: 0, failCount: items.length };
  }
}
