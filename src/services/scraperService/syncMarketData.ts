import db from "../../db";
import type { EmitenItem } from "../../types";
import {
  fetchFullMarketDataTradingView,
  fetchPriceTradingView,
} from "../tradingviewServices/fetchScreener";
import { safeLog } from "../../utils/safeLog";

/**
 * Menyinkronkan data pasar (harga real-time, profil, market cap, & dividen)
 * langsung untuk seluruh emiten sekaligus tanpa filter/pengecekan data lama.
 */
export async function syncMarketPrice(): Promise<string> {
  // 1. Ambil seluruh emiten sekaligus dari database (tanpa WHERE / ORDER BY date / LIMIT)
  const queue = db.query("SELECT * FROM emiten").all() as EmitenItem[];

  if (queue.length === 0) {
    return "[Market Sync] Tabel emiten kosong.";
  }

  safeLog(
    "info",
    `[Market Sync] Memproses seluruh ${queue.length} emiten sekaligus via TradingView Scanner...`,
  );

  // 2. Kirim seluruh ticker sekaligus dalam 1x HTTP POST Request ke Scanner API
  const { successCount, failCount } = await fetchPriceTradingView(queue);

  return `[Market Sync] Selesai | Total: ${queue.length} | Berhasil: ${successCount} | Gagal: ${failCount}`;
}

/**
 * Menyinkronkan data pasar (harga real-time, profil, market cap, & dividen)
 * langsung untuk seluruh emiten sekaligus tanpa filter/pengecekan data lama.
 */
export async function syncMarketData(): Promise<string> {
  // 1. Ambil seluruh emiten sekaligus dari database (tanpa WHERE / ORDER BY date / LIMIT)
  const queue = db.query("SELECT * FROM emiten").all() as EmitenItem[];

  if (queue.length === 0) {
    return "[Market Sync] Tabel emiten kosong.";
  }

  safeLog(
    "info",
    `[Market Sync] Memproses seluruh ${queue.length} emiten sekaligus via TradingView Scanner...`,
  );

  // 2. Kirim seluruh ticker sekaligus dalam 1x HTTP POST Request ke Scanner API
  const { successCount, failCount } =
    await fetchFullMarketDataTradingView(queue);

  return `[Market Sync] Selesai | Total: ${queue.length} | Berhasil: ${successCount} | Gagal: ${failCount}`;
}
