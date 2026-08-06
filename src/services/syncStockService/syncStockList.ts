import {
  tradingViewClient,
  type RawStockData,
} from "../../client/tradingViewClient";
import db from "../../db";

/**
 * Sinkronisasi data emiten dari TradingView Screener.
 * Menambahkan emiten baru dan memperbarui data emiten yang sudah ada.
 */
export async function syncStockList(): Promise<string> {
  const allStocks = await tradingViewClient.fetchAllStocks();

  if (allStocks.length === 0) {
    return "Tidak ada data emiten dari TradingView";
  }

  const now = new Date().toISOString();
  const defaultPastDate = "2000-01-01 00:00:00";

  const upsertStmt = db.prepare(`
    INSERT INTO emiten (
      code, name, sector, notation, last_price,
      price_updated_at, fundamental_updated_at, created_at, updated_at
    )
    VALUES (
      $code, $name, $sector, $notation, $last_price,
      $now, $past, $now, $now
    )
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      sector = excluded.sector,
      notation = excluded.notation,
      last_price = excluded.last_price,
      price_updated_at = excluded.price_updated_at,
      updated_at = excluded.updated_at
  `);

  const syncTransaction = db.transaction((stocks: RawStockData[]) => {
    for (const s of stocks) {
      upsertStmt.run({
        $code: s.code,
        $name: s.name,
        $sector: s.sector || "Unknown",
        $notation: s.notation || "",
        $last_price: s.last_price || 0,
        $past: defaultPastDate,
        $now: now,
      });
    }
  });

  syncTransaction(allStocks);

  return `Total: ${allStocks.length} emiten disinkronkan`;
}
