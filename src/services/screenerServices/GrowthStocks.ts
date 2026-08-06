import db from "../../db";

export function getGrowthStocks(limit: number = 25) {
  const result = db
    .query(
      `SELECT e.code, e.name, h1.net_profit as latest_net_profit, h2.net_profit as prev_net_profit, h1.year as latest_year
       FROM emiten e
       JOIN stock_histories h1 ON e.id = h1.emiten_id
       JOIN stock_histories h2 ON e.id = h2.emiten_id AND h2.year = (h1.year - 1)
       WHERE h1.year = (SELECT MAX(year) FROM stock_histories WHERE emiten_id = e.id)
         AND h1.net_profit IS NOT NULL AND h2.net_profit IS NOT NULL AND h1.net_profit > h2.net_profit
       ORDER BY (h1.net_profit - h2.net_profit) / ABS(h2.net_profit) DESC LIMIT ?`,
    )
    .all(limit);

  return {
    description:
      "Menyaring emiten dengan pertumbuhan laba bersih positif pada tahun laporan keuangan terbaru",
    count: result.length,
    data: result,
  };
}
