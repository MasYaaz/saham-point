import db from "../../db";
import type { EmitenItem } from "../../types";
import {
  fetchFullMarketDataTradingView,
  fetchPriceTradingView,
} from "../tradingviewServices/fetchScreener";

/**
 * Menyinkronkan harga real-time emiten.
 */
export async function syncStockPrice(): Promise<string> {
  const queue = db.query("SELECT * FROM emiten").all() as EmitenItem[];

  if (queue.length === 0) {
    return "Tabel emiten kosong";
  }

  const { successCount, failCount } = await fetchPriceTradingView(queue);

  return `Total: ${queue.length} | Berhasil: ${successCount} | Gagal: ${failCount}`;
}

/**
 * Menyinkronkan data pasar lengkap (profil, market cap, & dividen).
 */
export async function syncStockData(): Promise<string> {
  const queue = db.query("SELECT * FROM emiten").all() as EmitenItem[];

  if (queue.length === 0) {
    return "Tabel emiten kosong";
  }

  const { successCount, failCount } =
    await fetchFullMarketDataTradingView(queue);

  return `Total: ${queue.length} | Berhasil: ${successCount} | Gagal: ${failCount}`;
}
