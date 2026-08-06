import db from "../../db";
import type { EmitenDbRow } from "../../types";

interface ScreenerTechnicalParams {
  strategy?: "breakout" | "reversal" | "volatile" | string;
  limit?: number;
}

export function getTechnicalScreener({
  strategy = "breakout",
  limit = 30,
}: ScreenerTechnicalParams = {}) {
  let queryStr = "";

  if (strategy === "reversal") {
    queryStr = `
      SELECT code, name, sector, last_price, previous_close, day_high, day_low, beta FROM emiten
      WHERE last_price > previous_close AND day_low >= previous_close AND previous_close > 0
      ORDER BY (last_price - previous_close) / previous_close DESC LIMIT ?`;
  } else if (strategy === "volatile") {
    queryStr = `
      SELECT code, name, sector, last_price, previous_close, day_high, day_low, beta FROM emiten
      WHERE day_high > day_low AND beta >= 1.2
      ORDER BY (day_high - day_low) / day_low DESC LIMIT ?`;
  } else {
    queryStr = `
      SELECT code, name, sector, last_price, previous_close, day_high, day_low, beta FROM emiten
      WHERE last_price >= day_high AND last_price > previous_close AND previous_close > 0
      ORDER BY (last_price - previous_close) / previous_close DESC LIMIT ?`;
  }

  const result = db.query(queryStr).all(limit) as EmitenDbRow[];

  const formattedResult = result.map((row) => {
    const changePercent =
      row.previous_close && row.last_price
        ? ((row.last_price - row.previous_close) / row.previous_close) * 100
        : 0;
    const dayRangePercent =
      row.day_low && row.day_high
        ? ((row.day_high - row.day_low) / row.day_low) * 100
        : 0;
    return {
      ...row,
      daily_change_percent: parseFloat(changePercent.toFixed(2)),
      day_range_percent: parseFloat(dayRangePercent.toFixed(2)),
    };
  });

  return {
    strategy_applied: strategy,
    limit_applied: limit,
    count: formattedResult.length,
    data: formattedResult,
  };
}
