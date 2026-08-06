import db from "../../db";
import type { EmitenDbRow } from "../../types";

interface ScreenerDividendParams {
  minYield?: number;
  limit?: number;
}

export function getDividendHunters({
  minYield = 5.0,
  limit = 30,
}: ScreenerDividendParams = {}) {
  const result = db
    .query(
      `SELECT
         e.code,
         e.name,
         e.sector,
         e.last_price,
         e.market_cap,
         e.pbv,
         e.per,
         e.der,
         e.dividend_yield,
         ca.type_of_ca AS latest_dividend_type,
         ca.cum_date AS latest_cum_date,
         ca.distribution_date AS latest_distribution_date
       FROM emiten e
       LEFT JOIN corporate_actions ca ON ca.id = (
         SELECT id
         FROM corporate_actions
         WHERE security_code = e.code
           AND (type_of_ca LIKE '%DIVIDEND%' OR type_of_ca LIKE '%DIVIDEN%')
         ORDER BY record_date DESC
         LIMIT 1
       )
       WHERE e.dividend_yield >= ? AND e.der <= 1.5 AND e.market_cap > 0
       ORDER BY e.dividend_yield DESC
       LIMIT ?`,
    )
    .all(minYield, limit) as EmitenDbRow[];

  return {
    filter_applied: { min_dividend_yield: minYield, limit },
    count: result.length,
    data: result,
  };
}
