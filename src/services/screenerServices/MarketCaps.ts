import db from "../../db";
import type { EmitenDbRow } from "../../types";

interface ScreenerMarketCapParams {
  minMarketCap?: number;
  maxMarketCap?: number | null;
  sort?: "asc" | "desc" | string;
  limit?: number;
}

export function getMarketCapStocks({
  minMarketCap = 0,
  maxMarketCap = null,
  sort = "desc",
  limit = 25,
}: ScreenerMarketCapParams = {}) {
  const sortDirection = sort.toLowerCase() === "asc" ? "ASC" : "DESC";
  const validMinCap = isNaN(minMarketCap) ? 0 : minMarketCap;

  let queryStr = `
    SELECT code, name, sector, last_price, market_cap, pbv, per, roe, der, dividend_yield
    FROM emiten
    WHERE market_cap IS NOT NULL AND market_cap >= ?
  `;
  const params: any[] = [validMinCap];

  if (maxMarketCap !== null && !isNaN(maxMarketCap)) {
    queryStr += ` AND market_cap <= ?`;
    params.push(maxMarketCap);
  }

  queryStr += ` ORDER BY market_cap ${sortDirection} LIMIT ?`;
  params.push(limit);

  const result = db.query(queryStr).all(...params) as EmitenDbRow[];

  return {
    filter_applied: {
      min_market_cap: validMinCap,
      max_market_cap: maxMarketCap,
      sort: sortDirection.toLowerCase(),
      limit,
    },
    count: result.length,
    data: result,
  };
}
