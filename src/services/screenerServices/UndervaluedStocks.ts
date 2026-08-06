import db from "../../db";
import type { EmitenDbRow } from "../../types";

interface ScreenerUndervaluedParams {
  maxPbv?: number;
  minRoe?: number;
  maxDer?: number;
  limit?: number;
}

export function getUndervaluedStocks({
  maxPbv = 1.5,
  minRoe = 10.0,
  maxDer = 2.0,
  limit = 50,
}: ScreenerUndervaluedParams = {}) {
  const result = db
    .query(
      `SELECT code, name, sector, last_price, market_cap, pbv, per, roe, der, dividend_yield
       FROM emiten
       WHERE pbv IS NOT NULL AND pbv > 0 AND pbv <= ?
         AND roe IS NOT NULL AND roe >= ?
         AND der IS NOT NULL AND der <= ?
         AND per IS NOT NULL AND per > 0
       ORDER BY roe DESC, pbv ASC LIMIT ?`,
    )
    .all(maxPbv, minRoe, maxDer, limit) as EmitenDbRow[];

  return {
    filter_applied: {
      max_pbv: maxPbv,
      min_roe: minRoe,
      max_der: maxDer,
      limit,
    },
    count: result.length,
    data: result,
  };
}
