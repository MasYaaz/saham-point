import db from "../../db";

export function getCashRichStocks(limit: number = 25) {
  const result = db
    .query(
      `SELECT e.code, e.name, e.sector, e.last_price, h.free_cash_flow, h.total_debt, h.net_debt, h.year
       FROM emiten e JOIN stock_histories h ON e.id = h.emiten_id
       WHERE h.year = (SELECT MAX(year) FROM stock_histories WHERE emiten_id = e.id)
         AND h.free_cash_flow > 0 AND h.net_debt < 0
       ORDER BY h.free_cash_flow DESC LIMIT ?`,
    )
    .all(limit) as any[];

  return {
    description:
      "Emiten dengan Free Cash Flow positif dan kondisi Kas bersih melampaui Total Utang (Net Debt Negatif)",
    count: result.length,
    data: result,
  };
}
