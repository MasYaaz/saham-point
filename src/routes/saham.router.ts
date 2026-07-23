import { Hono } from "hono";
import db from "../db";
import type { EmitenDbRow, TradingViewFinancialHistory } from "../types";
import { fetchEmitenNews } from "../services/newsService";
import { parseLimit } from "../utils/endpoint/parseLimit";

export const sahamRouter = new Hono();

// GET /api/saham/:code
sahamRouter.get("/:code", (c) => {
  const code = c.req.param("code").toUpperCase();
  const emiten = db
    .query("SELECT * FROM emiten WHERE code = ? LIMIT 1")
    .get(code) as EmitenDbRow | undefined;

  if (!emiten) {
    return c.json(
      { success: false, message: `Ticker ${code} tidak ditemukan` },
      404,
    );
  }

  const histories = db
    .query(
      "SELECT * FROM stock_histories WHERE emiten_id = ? ORDER BY year DESC",
    )
    .all(emiten.id) as TradingViewFinancialHistory[];

  return c.json({ success: true, data: { ...emiten, histories } });
});

// GET /api/saham/:code/history
sahamRouter.get("/:code/history", (c) => {
  const code = c.req.param("code").toUpperCase();
  const emiten = db
    .query("SELECT id FROM emiten WHERE code = ? LIMIT 1")
    .get(code) as { id: number } | undefined;

  if (!emiten) {
    return c.json(
      { success: false, message: `Ticker ${code} tidak ditemukan` },
      404,
    );
  }

  const histories = db
    .query(
      `SELECT year, period, revenue, gross_profit, operating_income, ebit, net_profit, eps,
              average_basic_shares_outstanding, ebitda, total_assets, total_liabilities,
              total_equity, total_debt, net_debt, cash_flow_operating, cash_flow_investing,
              cash_flow_financing, free_cash_flow, roe, der, pbv, per
       FROM stock_histories WHERE emiten_id = ? ORDER BY year DESC`,
    )
    .all(emiten.id) as TradingViewFinancialHistory[];

  return c.json({
    success: true,
    code,
    count: histories.length,
    data: histories,
  });
});

// GET /api/saham/:code/growth
sahamRouter.get("/:code/growth", (c) => {
  const code = c.req.param("code").toUpperCase();
  const emiten = db.query("SELECT id FROM emiten WHERE code = ?").get(code) as
    { id: number } | undefined;

  if (!emiten)
    return c.json({ success: false, message: "Emiten tidak ditemukan" }, 404);

  const histories = db
    .query(
      "SELECT year, revenue, net_profit FROM stock_histories WHERE emiten_id = ? ORDER BY year ASC",
    )
    .all(emiten.id) as {
    year: number;
    revenue: number | null;
    net_profit: number | null;
  }[];

  const growthTrends = histories.map((curr, idx, arr) => {
    if (idx === 0)
      return { ...curr, revenue_growth_yoy: 0, profit_growth_yoy: 0 };
    const prev = arr[idx - 1];

    const revGrowth =
      prev?.revenue && curr.revenue
        ? ((curr.revenue - prev.revenue) / prev.revenue) * 100
        : 0;
    const profGrowth =
      prev?.net_profit && curr.net_profit
        ? ((curr.net_profit - prev.net_profit) / prev.net_profit) * 100
        : 0;

    return {
      ...curr,
      revenue_growth_yoy: parseFloat(revGrowth.toFixed(2)),
      profit_growth_yoy: parseFloat(profGrowth.toFixed(2)),
    };
  });

  return c.json({ success: true, code, trends: growthTrends });
});

// GET /api/saham/:code/valuation
sahamRouter.get("/:code/valuation", (c) => {
  const code = c.req.param("code").toUpperCase();
  const data = db
    .query(
      `SELECT e.last_price, e.per as current_per, AVG(h.per) as avg_5y_per
       FROM emiten e JOIN stock_histories h ON e.id = h.emiten_id
       WHERE e.code = ? AND h.per IS NOT NULL AND h.per != 0 GROUP BY e.id`,
    )
    .get(code) as
    | {
        last_price: number;
        current_per: number | null;
        avg_5y_per: number | null;
      }
    | undefined;

  if (!data || !data.current_per || !data.avg_5y_per) {
    return c.json(
      {
        success: false,
        message:
          "Data historis tidak mencukupi untuk kalkulasi rata-rata nilai wajar",
      },
      404,
    );
  }

  const discount = data.avg_5y_per - data.current_per;
  const status =
    discount > 0
      ? "Undervalued vs Historical Average"
      : "Overvalued vs Historical Average";

  return c.json({
    success: true,
    code,
    status,
    current_per: data.current_per,
    avg_historical_per: parseFloat(data.avg_5y_per.toFixed(2)),
    potensi_upside_per_points: parseFloat(discount.toFixed(2)),
  });
});

// GET /api/saham/:code/news
sahamRouter.get("/:code/news", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const limit = parseLimit(c.req.query("limit"), 10, 50);
  const lang = (c.req.query("lang") as "id" | "en") ?? "id";

  const emiten = db
    .query("SELECT name FROM emiten WHERE code = ? LIMIT 1")
    .get(code) as { name: string } | undefined;

  if (!emiten && code !== "IHSG") {
    return c.json(
      { success: false, message: `Ticker ${code} tidak ditemukan` },
      404,
    );
  }

  const newsItems = await fetchEmitenNews(code, emiten?.name, limit, lang);

  return c.json({
    success: true,
    code,
    company_name: emiten?.name ?? "IHSG",
    count: newsItems.length,
    data: newsItems,
  });
});
