import { YAHOO_HEADERS } from "../../../config";
import db from "../../../db";
import type { EmitenItem } from "../../../types";

/**
 * 3. Logika pengambilan harga dari Yahoo Finance API Chart (Tabel Emiten)
 */
export async function fetchPriceYahoo(item: EmitenItem): Promise<boolean> {
  const symbol =
    item.code === "IHSG" ? "^JKSE" : `${item.code.toUpperCase()}.JK`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1m`;
  const nowStr = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  )
    .toISOString()
    .replace("T", " ")
    .substring(0, 19);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": YAHOO_HEADERS["User-Agent"],
        Referer: "https://finance.yahoo.com/",
      },
    });

    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
    const body: any = await response.json();
    const result = body?.chart?.result?.[0] ?? null;

    if (result) {
      const meta = result.meta;
      const lastPrice = parseFloat(meta.regularMarketPrice ?? 0);

      if (lastPrice > 0) {
        db.run(
          `UPDATE emiten SET last_price = ?, previous_close = ?, day_high = ?, day_low = ?, price_updated_at = ? WHERE id = ?`,
          [
            lastPrice,
            parseFloat(meta.chartPreviousClose ?? lastPrice),
            parseFloat(meta.regularMarketDayHigh ?? lastPrice),
            parseFloat(meta.regularMarketDayLow ?? lastPrice),
            nowStr,
            item.id,
          ],
        );
        return true;
      }
    }
  } catch (error: any) {
    db.run("UPDATE emiten SET price_updated_at = ? WHERE id = ?", [
      nowStr,
      item.id,
    ]);
  }
  return false;
}
