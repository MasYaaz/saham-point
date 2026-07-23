import { Hono } from "hono";
import db from "../db";
import type { EmitenDbRow } from "../types";
import { parseLimit } from "../utils/endpoint/parseLimit";

export const screenerRouter = new Hono();

// GET /api/screener/undervalued
screenerRouter.get("/undervalued", (c) => {
  const maxPbv = parseFloat(c.req.query("max_pbv") ?? "1.5");
  const minRoe = parseFloat(c.req.query("min_roe") ?? "10.0");
  const maxDer = parseFloat(c.req.query("max_der") ?? "2.0");
  const limit = parseLimit(c.req.query("limit"), 50);

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

  return c.json({
    success: true,
    filter_applied: {
      max_pbv: maxPbv,
      min_roe: minRoe,
      max_der: maxDer,
      limit,
    },
    count: result.length,
    data: result,
  });
});

// GET /api/screener/market-cap
screenerRouter.get("/market-cap", (c) => {
  const minCap = parseFloat(c.req.query("min_market_cap") ?? "0");
  const maxCapParam = c.req.query("max_market_cap");
  const maxCap = maxCapParam ? parseFloat(maxCapParam) : null;
  const sort =
    (c.req.query("sort") ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const limit = parseLimit(c.req.query("limit"), 25);

  let queryStr = `
    SELECT code, name, sector, last_price, market_cap, pbv, per, roe, der, dividend_yield
    FROM emiten
    WHERE market_cap IS NOT NULL AND market_cap >= ?
  `;
  const params: any[] = [isNaN(minCap) ? 0 : minCap];

  if (maxCap !== null && !isNaN(maxCap)) {
    queryStr += ` AND market_cap <= ?`;
    params.push(maxCap);
  }

  queryStr += ` ORDER BY market_cap ${sort} LIMIT ?`;
  params.push(limit);

  const result = db.query(queryStr).all(...params) as EmitenDbRow[];

  return c.json({
    success: true,
    filter_applied: {
      min_market_cap: isNaN(minCap) ? 0 : minCap,
      max_market_cap: maxCap,
      sort: sort.toLowerCase(),
      limit,
    },
    count: result.length,
    data: result,
  });
});

// GET /api/screener/technical
screenerRouter.get("/technical", (c) => {
  const strategy = c.req.query("strategy") ?? "breakout";
  const limit = parseLimit(c.req.query("limit"), 30);
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

  return c.json({
    success: true,
    strategy_applied: strategy,
    limit_applied: limit,
    count: formattedResult.length,
    data: formattedResult,
  });
});

// GET /api/screener/dividend-hunters
screenerRouter.get("/dividend-hunters", (c) => {
  const minYield = parseFloat(c.req.query("min_yield") ?? "5.0");
  const limit = parseLimit(c.req.query("limit"), 30);

  const result = db
    .query(
      `SELECT code, name, sector, last_price, market_cap, pbv, per, der, dividend_yield
       FROM emiten
       WHERE dividend_yield >= ? AND der <= 1.5 AND market_cap > 0
       ORDER BY dividend_yield DESC LIMIT ?`,
    )
    .all(minYield, limit) as EmitenDbRow[];

  return c.json({
    success: true,
    filter_applied: { min_dividend_yield: minYield, limit },
    count: result.length,
    data: result,
  });
});

// GET /api/screener/cash-rich
screenerRouter.get("/cash-rich", (c) => {
  const limit = parseLimit(c.req.query("limit"), 25);

  const result = db
    .query(
      `SELECT e.code, e.name, e.sector, e.last_price, h.free_cash_flow, h.total_debt, h.net_debt, h.year
       FROM emiten e JOIN stock_histories h ON e.id = h.emiten_id
       WHERE h.year = (SELECT MAX(year) FROM stock_histories WHERE emiten_id = e.id)
         AND h.free_cash_flow > 0 AND h.net_debt < 0
       ORDER BY h.free_cash_flow DESC LIMIT ?`,
    )
    .all(limit) as any[];

  return c.json({
    success: true,
    description:
      "Emiten dengan Free Cash Flow positif dan kondisi Kas bersih melampaui Total Utang (Net Debt Negatif)",
    count: result.length,
    data: result,
  });
});

// GET /api/screener/growth
screenerRouter.get("/growth", (c) => {
  const limit = parseLimit(c.req.query("limit"), 25);

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

  return c.json({
    success: true,
    description:
      "Menyaring emiten dengan pertumbuhan laba bersih positif pada tahun laporan keuangan terbaru",
    count: result.length,
    data: result,
  });
});

// GET /api/screener/rankings
screenerRouter.get("/rankings", (c) => {
  const sortBy = c.req.query("sort") ?? "market_cap";
  const limit = parseLimit(c.req.query("limit"), 25);

  let queryStr = `SELECT code, name, sector, last_price, market_cap, pbv, per, dividend_yield FROM emiten `;
  queryStr +=
    sortBy === "dividend_yield"
      ? ` ORDER BY dividend_yield DESC LIMIT ? `
      : ` ORDER BY market_cap DESC LIMIT ? `;

  const result = db.query(queryStr).all(limit) as EmitenDbRow[];

  return c.json({
    success: true,
    metric: sortBy,
    count: result.length,
    data: result,
  });
});
