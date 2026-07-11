import { Hono } from "hono";
import db from "./db";
import type { YahooChartResponse, TradingViewFinancialHistory } from "./types";
import { VERSION } from "./config";

const app = new Hono();

// Sync type safety dengan interface database terbaru kamu (mengakomodasi null secara legal)
interface EmitenDbRow {
  id: number;
  code: string;
  name: string;
  sector: string;
  description: string | null;
  last_price: number;
  previous_close: number | null;
  day_high: number | null;
  day_low: number | null;
  market_cap: number | null;
  pbv: number | null;
  per: number | null;
  roe: number | null;
  der: number | null;
  dividend: number | null;
  dividend_yield: number | null;
  beta: number | null;
  price_updated_at: string | null;
  fundamental_updated_at: string | null;
}

// ============================================================================
// 1. BASE & META CLUSTER (Rute Root & Dokumentasi Skema)
// ============================================================================

app.get("/", (c) => c.redirect("/api"));
app.get("/api/endpoints", (c) => c.redirect("/api"));

/**
 * Endpoint: Dokumentasi Sistem API Gateway (Self-Documenting Route)
 * Telah diekspansi penuh mencakup ke-14 matriks rute operasional
 */
app.get("/api", (c) => {
  return c.json({
    project: "Saham Point Core Backend - AI Agent Target Matrix",
    version: VERSION,
    engine: "Bun Runtime Engine",
    status: "Active",
    documentation: {
      base_url: "/api",
      routes: [
        {
          path: "/api",
          method: "GET",
          description:
            "Menampilkan katalog dokumentasi resmi rute API Gateway ini.",
          parameters: {},
        },
        {
          path: "/api/saham/:code",
          method: "GET",
          description:
            "Mengambil profil ringkas emiten beserta data seluruh histori tahunan keuangan.",
          parameters: {
            code: { type: "path_parameter", required: true, example: "BBRI" },
          },
        },
        {
          path: "/api/saham/:code/history",
          method: "GET",
          description:
            "Mengambil data histori keuangan tahunan emiten secara murni (hanya array finansial).",
          parameters: {
            code: { type: "path_parameter", required: true, example: "BMRI" },
          },
        },
        {
          path: "/api/saham/:code/growth",
          method: "GET",
          description:
            "Menganalisis tren pertumbuhan kumulatif pendapatan dan laba bersih (YoY Trend Analysis) 5 tahun terakhir.",
          parameters: {
            code: { type: "path_parameter", required: true, example: "TLKM" },
          },
        },
        {
          path: "/api/saham/:code/valuation",
          method: "GET",
          description:
            "Estimasi harga wajar emiten berdasarkan perbandingan rasio PER saat ini dengan rata-rata PER historis.",
          parameters: {
            code: { type: "path_parameter", required: true, example: "ASII" },
          },
        },
        {
          path: "/api/sektor/:name",
          method: "GET",
          description:
            "Mengambil daftar ringkasan emiten berdasar pencocokan nama sektor industri terkait.",
          parameters: {
            name: {
              type: "path_parameter",
              required: true,
              example: "Financial",
            },
          },
        },
        {
          path: "/api/technical/:code",
          method: "GET",
          description:
            "Mengambil data historis candlestick (OHLCV) presisi dari Yahoo Finance Engine.",
          parameters: {
            code: { type: "path_parameter", required: true, example: "BBRI" },
            range: {
              type: "query_string",
              required: false,
              default: "1mo",
              options: [
                "1d",
                "5d",
                "1mo",
                "3mo",
                "6mo",
                "1y",
                "2y",
                "5y",
                "10y",
                "max",
              ],
            },
          },
        },
        {
          path: "/api/screener/undervalued",
          method: "GET",
          description:
            "Screener Value Investing menyaring emiten dengan kriteria ROE tinggi, DER sehat, dan PBV/PER wajar.",
          parameters: {
            max_pbv: { type: "query_string", required: false, default: "1.5" },
            min_roe: { type: "query_string", required: false, default: "10.0" },
            max_der: { type: "query_string", required: false, default: "2.0" },
          },
        },
        {
          path: "/api/screener/technical",
          method: "GET",
          description:
            "Screener momentum pergerakan harga harian berdasarkan strategi teknikal.",
          parameters: {
            strategy: {
              type: "query_string",
              required: false,
              options: ["breakout", "reversal", "volatile"],
              default: "breakout",
            },
          },
        },
        {
          path: "/api/screener/dividend-hunters",
          method: "GET",
          description:
            "Screener alokasi pasif khusus memburu saham dengan Dividend Yield jumbo dan rasio leverage utang aman.",
          parameters: {
            min_yield: {
              type: "query_string",
              required: false,
              default: "5.0",
            },
          },
        },
        {
          path: "/api/screener/cash-rich",
          method: "GET",
          description:
            "Menyaring perusahaan super solven dengan Free Cash Flow melimpah serta Net Debt negatif (Kas > Utang).",
          parameters: {},
        },
        {
          path: "/api/screener/growth",
          method: "GET",
          description:
            "Menyaring emiten yang menunjukkan akselerasi pertumbuhan laba bersih positif pada laporan tahunan terbaru.",
          parameters: {},
        },
        {
          path: "/api/screener/rankings",
          method: "GET",
          description:
            "Mengambil peringkat 25 emiten teratas berdasarkan kapitalisasi pasar atau yield dividen.",
          parameters: {
            sort: {
              type: "query_string",
              required: false,
              options: ["market_cap", "dividend_yield"],
              default: "market_cap",
            },
          },
        },
        {
          path: "/api/diagnostics/stale",
          method: "GET",
          description:
            "Melacak data fundamental dan harga terlawas (stale) untuk optimalisasi antrean kerja scraper.",
          parameters: {},
        },
        {
          path: "/api/health",
          method: "GET",
          description:
            "Menampilkan metrik integritas kesehatan instansi runtime server Bun beserta total data terlacak.",
          parameters: {},
        },
      ],
    },
  });
});

// ============================================================================
// 2. SAHAM CORE PROFILE CLUSTER (Prefix: /api/saham)
// ============================================================================

/**
 * Rute: /api/saham/:code
 * Deskripsi: Mengambil Profil Ringkas Emiten + Data Histori Lengkap
 */
app.get("/api/saham/:code", (c) => {
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

/**
 * Rute: /api/saham/:code/history
 * Deskripsi: Mengambil Murni Array Data Histori Keuangan Tanpa Metadata Profil
 */
app.get("/api/saham/:code/history", (c) => {
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

/**
 * Rute: /api/saham/:code/growth
 * Deskripsi: Analisis Laju Pertumbuhan Pendapatan & Laba Bersih YoY 5 Tahun Terakhir
 */
app.get("/api/saham/:code/growth", (c) => {
  const code = c.req.param("code").toUpperCase();
  const emiten = db.query("SELECT id FROM emiten WHERE code = ?").get(code) as
    | { id: number }
    | undefined;

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

/**
 * Rute: /api/saham/:code/valuation
 * Deskripsi: Perhitungan Estimasi Harga Wajar berbasis Deviasi Rata-rata Rasio PER Historis
 */
app.get("/api/saham/:code/valuation", (c) => {
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

// ============================================================================
// 3. SECTOR CLASSIFICATION CLUSTER (Prefix: /api/sektor)
// ============================================================================

/**
 * Rute: /api/sector/:name
 * Deskripsi: Mengambil Data Emiten yang Berada di Dalam Sektor Tertentu
 */
app.get("/api/sector/:name", (c) => {
  const sectorName = c.req.param("name");
  const result = db
    .query(
      `SELECT code, name, sector, last_price, pbv, per, roe, der, market_cap 
       FROM emiten WHERE sector LIKE ? ORDER BY market_cap DESC`,
    )
    .all(`%${sectorName}%`) as EmitenDbRow[];

  return c.json({ success: true, count: result.length, data: result });
});

// ============================================================================
// 4. TECHNICAL INDICATOR DATA CLUSTER (Prefix: /api/technical)
// ============================================================================

/**
 * Rute: /api/technical/:code
 * Deskripsi: Integrasi Data Candlestick Bersih (OHLCV) Eksternal Yahoo Finance
 */
app.get("/api/technical/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const range = c.req.query("range") ?? "1mo";

  const intervalMap: Record<string, string> = {
    "1d": "5m",
    "5d": "15m",
    "1mo": "1d",
    "3mo": "1d",
    "6mo": "1wk",
    "1y": "1wk",
    "2y": "1mo",
    "5y": "1mo",
    "10y": "1mo",
    max: "3mo",
  };
  const interval = intervalMap[range] ?? "1d";
  const ticker = `${code}.JK`;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const chartData = (await res.json()) as YahooChartResponse;
    const result = chartData.chart?.result?.[0];

    if (
      !result?.meta ||
      !result?.timestamp ||
      !result?.indicators?.quote?.[0]
    ) {
      return c.json({ success: false, message: "Data tidak tersedia" }, 404);
    }

    const { meta, timestamp } = result;
    const quotes = result.indicators.quote[0];

    const history = timestamp.map((ts, index) => ({
      date: new Date(ts * 1000).toISOString().split("T")[0],
      open: quotes.open[index] ?? 0,
      high: quotes.high[index] ?? 0,
      low: quotes.low[index] ?? 0,
      close: quotes.close[index] ?? 0,
      volume: quotes.volume?.[index] ?? 0,
    }));

    return c.json({
      success: true,
      meta: { symbol: code, range, interval, currency: meta.currency },
      data: history,
    });
  } catch (err: any) {
    return c.json(
      { success: false, message: "Gagal memproses", error: err.message },
      500,
    );
  }
});

// ============================================================================
// 5. ADVANCED SCREENER MATRIX CLUSTER (Prefix: /api/screener)
// ============================================================================

/**
 * Rute: /api/screener/undervalued
 * Deskripsi: Filter Saham Fundamental Sehat Murah (Value Investing Strategy)
 */
app.get("/api/screener/undervalued", (c) => {
  const maxPbv = parseFloat(c.req.query("max_pbv") ?? "1.5");
  const minRoe = parseFloat(c.req.query("min_roe") ?? "10.0");
  const maxDer = parseFloat(c.req.query("max_der") ?? "2.0");

  const result = db
    .query(
      `SELECT code, name, sector, last_price, market_cap, pbv, per, roe, der, dividend_yield 
       FROM emiten 
       WHERE pbv IS NOT NULL AND pbv > 0 AND pbv <= ? 
         AND roe IS NOT NULL AND roe >= ? 
         AND der IS NOT NULL AND der <= ? 
         AND per IS NOT NULL AND per > 0 
       ORDER BY roe DESC, pbv ASC LIMIT 50`,
    )
    .all(maxPbv, minRoe, maxDer) as EmitenDbRow[];

  return c.json({
    success: true,
    filter_applied: { max_pbv: maxPbv, min_roe: minRoe, max_der: maxDer },
    count: result.length,
    data: result,
  });
});

/**
 * Rute: /api/screener/technical
 * Deskripsi: Analisis Momentum Pergerakan Harga Efektif Harian
 */
app.get("/api/screener/technical", (c) => {
  const strategy = c.req.query("strategy") ?? "breakout";
  let queryStr = "";

  if (strategy === "reversal") {
    queryStr = `
      SELECT code, name, sector, last_price, previous_close, day_high, day_low, beta FROM emiten 
      WHERE last_price > previous_close AND day_low >= previous_close AND previous_close > 0 
      ORDER BY (last_price - previous_close) / previous_close DESC LIMIT 30`;
  } else if (strategy === "volatile") {
    queryStr = `
      SELECT code, name, sector, last_price, previous_close, day_high, day_low, beta FROM emiten 
      WHERE day_high > day_low AND beta >= 1.2 
      ORDER BY (day_high - day_low) / day_low DESC LIMIT 30`;
  } else {
    queryStr = `
      SELECT code, name, sector, last_price, previous_close, day_high, day_low, beta FROM emiten 
      WHERE last_price >= day_high AND last_price > previous_close AND previous_close > 0 
      ORDER BY (last_price - previous_close) / previous_close DESC LIMIT 30`;
  }

  const result = db.query(queryStr).all() as EmitenDbRow[];

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
    count: formattedResult.length,
    data: formattedResult,
  });
});

/**
 * Rute: /api/screener/dividend-hunters
 * Deskripsi: Filtrasi Emiten dengan Distribusi Imbal Hasil Dividen Tertinggi & Utang Aman
 */
app.get("/api/screener/dividend-hunters", (c) => {
  const minYield = parseFloat(c.req.query("min_yield") ?? "5.0");
  const result = db
    .query(
      `SELECT code, name, sector, last_price, market_cap, pbv, per, der, dividend_yield 
       FROM emiten 
       WHERE dividend_yield >= ? AND der <= 1.5 AND market_cap > 0 
       ORDER BY dividend_yield DESC LIMIT 30`,
    )
    .all(minYield) as EmitenDbRow[];

  return c.json({
    success: true,
    filter_applied: { min_dividend_yield: minYield },
    count: result.length,
    data: result,
  });
});

/**
 * Rute: /api/screener/cash-rich
 * Deskripsi: Skrining Emiten Solven dengan Free Cash Flow Positif & Net Debt Negatif
 */
app.get("/api/screener/cash-rich", (c) => {
  const result = db
    .query(
      `SELECT e.code, e.name, e.sector, e.last_price, h.free_cash_flow, h.total_debt, h.net_debt, h.year 
       FROM emiten e JOIN stock_histories h ON e.id = h.emiten_id 
       WHERE h.year = (SELECT MAX(year) FROM stock_histories WHERE emiten_id = e.id) 
         AND h.free_cash_flow > 0 AND h.net_debt < 0 
       ORDER BY h.free_cash_flow DESC LIMIT 25`,
    )
    .all() as any[];

  return c.json({
    success: true,
    description:
      "Emiten dengan Free Cash Flow positif dan kondisi Kas bersih melampaui Total Utang (Net Debt Negatif)",
    count: result.length,
    data: result,
  });
});

/**
 * Rute: /api/screener/growth
 * Deskripsi: Skrining Kecepatan Akselerasi Laba Bersih Tahun Terbaru vs Tahun Sebelumnya
 */
app.get("/api/screener/growth", (c) => {
  const result = db
    .query(
      `SELECT e.code, e.name, h1.net_profit as latest_net_profit, h2.net_profit as prev_net_profit, h1.year as latest_year 
       FROM emiten e 
       JOIN stock_histories h1 ON e.id = h1.emiten_id 
       JOIN stock_histories h2 ON e.id = h2.emiten_id AND h2.year = (h1.year - 1) 
       WHERE h1.year = (SELECT MAX(year) FROM stock_histories WHERE emiten_id = e.id) 
         AND h1.net_profit IS NOT NULL AND h2.net_profit IS NOT NULL AND h1.net_profit > h2.net_profit 
       ORDER BY (h1.net_profit - h2.net_profit) / ABS(h2.net_profit) DESC LIMIT 25`,
    )
    .all();

  return c.json({
    success: true,
    description:
      "Menyaring emiten dengan pertumbuhan laba bersih positif pada tahun laporan keuangan terbaru",
    count: result.length,
    data: result,
  });
});

/**
 * Rute: /api/screener/rankings
 * Deskripsi: Klasifikasi Peringkat 25 Emiten Teratas berdasarkan Seleksi Parameter Utama
 */
app.get("/api/screener/rankings", (c) => {
  const sortBy = c.req.query("sort") ?? "market_cap";
  let queryStr = `SELECT code, name, sector, last_price, market_cap, pbv, per, dividend_yield FROM emiten `;
  queryStr +=
    sortBy === "dividend_yield"
      ? ` ORDER BY dividend_yield DESC LIMIT 25 `
      : ` ORDER BY market_cap DESC LIMIT 25 `;

  const result = db.query(queryStr).all() as EmitenDbRow[];
  return c.json({
    success: true,
    metric: sortBy,
    count: result.length,
    data: result,
  });
});

// ============================================================================
// 6. SYSTEM DIAGNOSTICS & OPERATIONS (Prefix: /api/diagnostics & /api/health)
// ============================================================================

/**
 * Rute: /api/diagnostics/stale
 * Deskripsi: Mengidentifikasi Data Usang pada Database untuk Keperluan Antrean Sinkronisasi Scraper
 */
app.get("/api/diagnostics/stale", (c) => {
  const staleFundamental = db
    .query(
      "SELECT code, name, fundamental_updated_at FROM emiten ORDER BY fundamental_updated_at ASC LIMIT 10",
    )
    .all();

  const stalePrice = db
    .query(
      "SELECT code, name, price_updated_at FROM emiten ORDER BY price_updated_at ASC LIMIT 10",
    )
    .all();

  return c.json({
    success: true,
    needs_fundamental_sync: staleFundamental,
    needs_price_sync: stalePrice,
  });
});

/**
 * Rute: /api/health
 * Deskripsi: Laporan Metrik Integritas Skema Runtime & Database Terkini
 */
app.get("/api/health", (c) => {
  const totalEmiten = db.query("SELECT COUNT(*) as total FROM emiten").get() as
    | { total: number }
    | undefined;

  return c.json({
    status: "healthy",
    runtime: "Bun Core Engine",
    total_tracked_emiten: totalEmiten?.total ?? 0,
    timestamp: new Date().toISOString(),
  });
});

export default app;
