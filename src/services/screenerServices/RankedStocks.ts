import db from "../../db";
import type { EmitenDbRow } from "../../types";

export function getRankedStocks(
  sortBy: string = "market_cap",
  limit: number = 25,
) {
  const queryStr =
    sortBy === "dividend_yield"
      ? `SELECT code, name, sector, last_price, market_cap, pbv, per, dividend_yield FROM emiten ORDER BY dividend_yield DESC LIMIT ?`
      : `SELECT code, name, sector, last_price, market_cap, pbv, per, dividend_yield FROM emiten ORDER BY market_cap DESC LIMIT ?`;

  const result = db.query(queryStr).all(limit) as EmitenDbRow[];

  return {
    metric: sortBy,
    count: result.length,
    data: result,
  };
}
