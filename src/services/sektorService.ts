import db from "../db";
import type { EmitenDbRow } from "../types";

/**
 * Mengambil daftar emiten berdasarkan pencocokan nama sektor industri (ordered by market cap)
 */
export function getEmitenBySector(sectorName: string) {
  const result = db
    .query(
      `SELECT code, name, sector, last_price, pbv, per, roe, der, market_cap
       FROM emiten WHERE sector LIKE ? ORDER BY market_cap DESC`,
    )
    .all(`%${sectorName}%`) as EmitenDbRow[];

  return {
    count: result.length,
    data: result,
  };
}
