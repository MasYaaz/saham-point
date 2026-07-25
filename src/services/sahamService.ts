import db from "../db";
import type { EmitenDbRow, TradingViewFinancialHistory } from "../types";
import { fetchEmitenNews } from "./newsService";

/**
 * Mengambil profil emiten beserta histori keuangan tahunannya
 */
export function getEmitenProfile(code: string) {
  const formattedCode = code.toUpperCase();
  const emiten = db
    .query("SELECT * FROM emiten WHERE code = ? LIMIT 1")
    .get(formattedCode) as EmitenDbRow | undefined;

  if (!emiten) return null;

  const histories = db
    .query(
      "SELECT * FROM stock_histories WHERE emiten_id = ? ORDER BY year DESC",
    )
    .all(emiten.id) as TradingViewFinancialHistory[];

  return { ...emiten, histories };
}

/**
 * Mengambil histori keuangan tahunan murni
 */
export function getEmitenHistories(code: string) {
  const formattedCode = code.toUpperCase();
  const emiten = db
    .query("SELECT id FROM emiten WHERE code = ? LIMIT 1")
    .get(formattedCode) as { id: number } | undefined;

  if (!emiten) return null;

  const histories = db
    .query(
      `SELECT year, period, revenue, gross_profit, operating_income, ebit, net_profit, eps,
              average_basic_shares_outstanding, ebitda, total_assets, total_liabilities,
              total_equity, total_debt, net_debt, cash_flow_operating, cash_flow_investing,
              cash_flow_financing, free_cash_flow, roe, der, pbv, per
       FROM stock_histories WHERE emiten_id = ? ORDER BY year DESC`,
    )
    .all(emiten.id) as TradingViewFinancialHistory[];

  return histories;
}

/**
 * Menganalisis tren pertumbuhan YoY (Revenue & Net Profit)
 */
export function getEmitenGrowth(code: string) {
  const formattedCode = code.toUpperCase();
  const emiten = db
    .query("SELECT id FROM emiten WHERE code = ?")
    .get(formattedCode) as { id: number } | undefined;

  if (!emiten) return null;

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

  return growthTrends;
}

/**
 * Kalkulasi estimasi nilai wajar PER vs Rata-rata PER 5 Tahun
 */
export function getEmitenValuation(code: string) {
  const formattedCode = code.toUpperCase();
  const data = db
    .query(
      `SELECT e.last_price, e.per as current_per, AVG(h.per) as avg_5y_per
       FROM emiten e JOIN stock_histories h ON e.id = h.emiten_id
       WHERE e.code = ? AND h.per IS NOT NULL AND h.per != 0 GROUP BY e.id`,
    )
    .get(formattedCode) as
    | {
        last_price: number;
        current_per: number | null;
        avg_5y_per: number | null;
      }
    | undefined;

  if (!data || !data.current_per || !data.avg_5y_per) {
    return null;
  }

  const discount = data.avg_5y_per - data.current_per;
  const status =
    discount > 0
      ? "Undervalued vs Historical Average"
      : "Overvalued vs Historical Average";

  return {
    code: formattedCode,
    status,
    current_per: data.current_per,
    avg_historical_per: parseFloat(data.avg_5y_per.toFixed(2)),
    potensi_upside_per_points: parseFloat(discount.toFixed(2)),
  };
}

/**
 * Fetch berita finansial emiten
 */
export async function getEmitenNewsData(
  code: string,
  limit: number = 10,
  lang: "id" | "en" = "id",
) {
  const formattedCode = code.toUpperCase();
  const emiten = db
    .query("SELECT name FROM emiten WHERE code = ? LIMIT 1")
    .get(formattedCode) as { name: string } | undefined;

  if (!emiten && formattedCode !== "IHSG") {
    return null;
  }

  const companyName = emiten?.name ?? "IHSG";
  const newsItems = await fetchEmitenNews(
    formattedCode,
    emiten?.name,
    limit,
    lang,
  );

  return {
    company_name: companyName,
    count: newsItems.length,
    data: newsItems,
  };
}
