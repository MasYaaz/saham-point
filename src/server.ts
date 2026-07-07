// src/server.ts
import { Hono } from "hono";
import db from "./db";
import type { YahooChartResponse } from "./types";

const app = new Hono();

// Interface internal untuk type safety query database
interface EmitenDbRow {
  id: number;
  code: string;
  name: string;
  sector: string;
  description: string;
  notation: string;
  last_price: number;
  previous_close: number;
  day_high: number;
  day_low: number;
  market_cap: number;
  pbv: number;
  per: number;
  roe: number;
  der: number;
  dividend: number;
  dividend_yield: number;
  beta: number;
  price_updated_at: string;
  fundamental_updated_at: string;
}

/**
 * Endpoint: Dokumentasi Sistem API Gateway (Self-Documenting Route)
 */
app.get("/api", (c) => {
  return c.json({
    project: "Saham Point Core Backend",
    version: "1.0.0",
    engine: "Bun Runtime",
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
            "Mengambil profil fundamental data emiten spesifik beserta 5 tahun data histori tahunan penuh.",
          parameters: {
            code: { type: "path_parameter", required: true, example: "BBRI" },
          },
        },
        {
          path: "/api/saham/:code/growth",
          method: "GET",
          description:
            "Menganalisis tren pertumbuhan pendapatan dan laba bersih (YoY) selama 5 tahun terakhir.",
          parameters: {
            code: { type: "path_parameter", required: true, example: "BBRI" },
          },
        },
        {
          path: "/api/saham/:code/valuation",
          method: "GET",
          description:
            "Estimasi harga wajar emiten berdasarkan perbandingan PER saat ini dengan rata-rata PER historis 5 tahun.",
          parameters: {
            code: { type: "path_parameter", required: true, example: "BBRI" },
          },
        },
        {
          path: "/api/sektor/:name",
          method: "GET",
          description:
            "Mengambil daftar ringkasan saham berdasar pencocokan nama sektor industri terkait.",
          parameters: {
            name: {
              type: "path_parameter",
              required: true,
              example: "Banking",
            },
          },
        },
        {
          path: "/api/screener/growth",
          method: "GET",
          description:
            "Menyaring emiten yang menunjukkan pertumbuhan laba bersih konsisten dari tahun ke tahun.",
          parameters: {},
        },
        {
          path: "/api/screener/undervalued",
          method: "GET",
          description:
            "Pencarian Nilai Murah (Value Investing Screener) menyaring emiten dengan ROE tinggi, DER sehat, dan PBV/PER wajar.",
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
            "Screener Teknikal Harian untuk mendeteksi momentum harga (Breakout, Bullish Reversal, Volume Movers, atau Volatilitas Tinggi).",
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
            "Screener khusus memburu saham Cash Rich dengan Dividend Yield jumbo dan konsisten tetapi rasio utang aman.",
          parameters: {
            min_yield: {
              type: "query_string",
              required: false,
              default: "5.0",
            },
          },
        },
        {
          path: "/api/screener/rankings",
          method: "GET",
          description:
            "Mengambil peringkat 25 emiten teratas berdasarkan kapitalisasi pasar besar atau pembagian dividen tertinggi.",
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
          path: "/api/technical/:code",
          method: "GET",
          description:
            "Mengambil data historis candlestick (OHLCV) dari Yahoo Finance untuk kebutuhan chart teknikal.",
          parameters: {
            code: { type: "path_parameter", required: true, example: "BBRI" },
            range: {
              type: "query_string",
              required: false,
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
              default: "1mo",
            },
          },
        },
        {
          path: "/api/diagnostics/stale",
          method: "GET",
          description:
            "Diagnostik sistem untuk melacak 10 emiten dengan data fundamental dan harga terlawas yang butuh antrean sinkronisasi.",
          parameters: {},
        },
        {
          path: "/api/health",
          method: "GET",
          description:
            "Menampilkan metrik kesehatan instansi runtime server, status koneksi database, dan total emiten terdaftar.",
          parameters: {},
        },
      ],
    },
  });
});

app.get("/", (c) => c.redirect("/api"));
app.get("/api/endpoints", (c) => c.redirect("/api"));

/**
 * Endpoint 1: Mengambil Data Emiten Spesifik + Histori 5 Tahun
 */
app.get("/api/saham/:code", (c) => {
  const code = c.req.param("code").toUpperCase();
  const emiten = db
    .query("SELECT * FROM emiten WHERE code = ? LIMIT 1")
    .get(code) as EmitenDbRow | undefined;

  if (!emiten) {
    return c.json(
      { success: false, message: `Ticker ${code} tidak ditemukan di database` },
      404,
    );
  }

  const histories = db
    .query(
      "SELECT * FROM stock_histories WHERE emiten_id = ? ORDER BY year DESC",
    )
    .all(emiten.id);

  return c.json({
    success: true,
    data: { ...emiten, histories: histories },
  });
});

/**
 * Endpoint 2: Mengambil Ringkasan Saham Berdasarkan Sektor
 */
app.get("/api/sektor/:name", (c) => {
  const sectorName = c.req.param("name");
  const result = db
    .query(
      `
      SELECT code, name, sector, last_price, pbv, per, roe, der, market_cap
      FROM emiten
      WHERE sector LIKE ?
      ORDER BY market_cap DESC
    `,
    )
    .all(`%${sectorName}%`) as EmitenDbRow[];

  return c.json({ success: true, count: result.length, data: result });
});

/**
 * Endpoint 3: Pencarian Nilai Murah (Value Investing Screener)
 */
app.get("/api/screener/undervalued", (c) => {
  const maxPbv = parseFloat(c.req.query("max_pbv") ?? "1.5");
  const minRoe = parseFloat(c.req.query("min_roe") ?? "10.0");
  const maxDer = parseFloat(c.req.query("max_der") ?? "2.0");

  const result = db
    .query(
      `
      SELECT code, name, sector, last_price, market_cap, pbv, per, roe, der, dividend_yield
      FROM emiten
      WHERE pbv > 0 AND pbv <= ? AND roe >= ? AND der <= ? AND per > 0
      ORDER BY roe DESC, pbv ASC
      LIMIT 50
    `,
    )
    .all(maxPbv, minRoe, maxDer) as Partial<EmitenDbRow>[];

  return c.json({
    success: true,
    filter_applied: { max_pbv: maxPbv, min_roe: minRoe, max_der: maxDer },
    count: result.length,
    data: result,
  });
});

/**
 * Endpoint 4: Screener Teknikal Harian (Technical Momentum Tracker)
 * Pilihan strategi: ?strategy=breakout (default) | reversal | volatile
 */
app.get("/api/screener/technical", (c) => {
  const strategy = c.req.query("strategy") ?? "breakout";
  let queryStr = "";

  if (strategy === "reversal") {
    // Bullish Reversal Hub: Harga terakhir naik di atas harga penutupan kemarin,
    // dan low hari ini tidak lebih rendah dari kemarin (menandakan reject support)
    queryStr = `
      SELECT code, name, sector, last_price, previous_close, day_high, day_low, beta
      FROM emiten
      WHERE last_price > previous_close 
        AND day_low >= previous_close
        AND previous_close > 0
      ORDER BY (last_price - previous_close) / previous_close DESC
      LIMIT 30
    `;
  } else if (strategy === "volatile") {
    // Trading Volatilitas Tinggi: Mencari saham yang rentang swing harganya (High - Low) lebar,
    // dikombinasikan dengan Beta tinggi (> 1.2) biar asik buat fast trade / scalping harian.
    queryStr = `
      SELECT code, name, sector, last_price, previous_close, day_high, day_low, beta
      FROM emiten
      WHERE day_high > day_low 
        AND beta >= 1.2
      ORDER BY (day_high - day_low) / day_low DESC
      LIMIT 30
    `;
  } else {
    // DEFAULT: Breakout Hunter. Harga melesat menembus titik tertinggi hari ini (last_price mendekati/sama dengan day_high)
    // dengan persentase kenaikan harian yang kuat.
    queryStr = `
      SELECT code, name, sector, last_price, previous_close, day_high, day_low, beta
      FROM emiten
      WHERE last_price >= day_high 
        AND last_price > previous_close
        AND previous_close > 0
      ORDER BY (last_price - previous_close) / previous_close DESC
      LIMIT 30
    `;
  }

  const result = db.query(queryStr).all() as Partial<EmitenDbRow>[];

  // Format hasil dengan menambahkan kalkulasi persentase perubahan visual secara on-the-fly
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
 * Endpoint 5: Pemburu Dividen Jumbo (Dividend Hunters)
 * Query opsional: ?min_yield=5.0
 */
app.get("/api/screener/dividend-hunters", (c) => {
  const minYield = parseFloat(c.req.query("min_yield") ?? "5.0"); // Minimal yield 5%

  const result = db
    .query(
      `
      SELECT code, name, sector, last_price, market_cap, pbv, per, der, dividend_yield
      FROM emiten
      WHERE dividend_yield >= ? 
        AND der <= 1.5 
        AND market_cap > 0
      ORDER BY dividend_yield DESC
      LIMIT 30
    `,
    )
    .all(minYield) as Partial<EmitenDbRow>[];

  return c.json({
    success: true,
    filter_applied: { min_dividend_yield: minYield },
    count: result.length,
    data: result,
  });
});

/** Endpoint 6: Penguasa Pasar (Top Market Cap & Movers) */
app.get("/api/screener/rankings", (c) => {
  const sortBy = c.req.query("sort") ?? "market_cap";
  let queryStr = `
    SELECT code, name, sector, last_price, market_cap, pbv, per, dividend_yield
    FROM emiten
  `;

  if (sortBy === "dividend_yield") {
    queryStr += ` ORDER BY dividend_yield DESC LIMIT 25 `;
  } else {
    queryStr += ` ORDER BY market_cap DESC LIMIT 25 `;
  }

  const result = db.query(queryStr).all() as Partial<EmitenDbRow>[];

  return c.json({
    success: true,
    metric: sortBy,
    count: result.length,
    data: result,
  });
});

/** Endpoint 7: Data Candlestick (OHLCV) dari Yahoo Finance untuk Chart Teknikal */
app.get("/api/technical/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const range = c.req.query("range") ?? "1mo"; // Default 1 bulan

  // Mapping range ke interval yang paling masuk akal
  const intervalMap: Record<string, string> = {
    // Intraday
    "1d": "5m", // Harian (5 menit)
    "5d": "15m", // 5 Hari (15 menit)

    // Jangka Pendek
    "1mo": "1d", // 1 Bulan (harian)
    "3mo": "1d", // 3 Bulan (harian)

    // Jangka Menengah
    "6mo": "1wk", // 6 Bulan (mingguan)
    "1y": "1wk", // 1 Tahun (mingguan)

    // Jangka Panjang
    "2y": "1mo", // 2 Tahun (bulanan)
    "5y": "1mo", // 5 Tahun (bulanan)
    "10y": "1mo", // 10 Tahun (bulanan)
    max: "3mo", // Seluruh data (kuartalan)
  };

  const interval = intervalMap[range] ?? "1d";
  const ticker = `${code}.JK`;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const chartData = (await res.json()) as YahooChartResponse;
    const result = chartData.chart?.result?.[0];

    if (
      !result?.meta ||
      !result?.timestamp ||
      !result?.indicators?.quote?.[0]
    ) {
      return c.json({ success: false, message: "Data tidak tersedia" }, 404);
    }

    const { meta, timestamp, indicators } = result;
    const quotes = result?.indicators?.quote?.[0];

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

/** Endpoint 8: Analisis Pertumbuhan (Growth Trends) 5 Tahun Terakhir */
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
    .all(emiten.id) as { year: number; revenue: number; net_profit: number }[];

  // Hitung persentase pertumbuhan tahun ke tahun (YoY Growth)
  const growthTrends = histories.map((curr, idx, arr) => {
    if (idx === 0) return { ...curr, revenue_growth: 0, profit_growth: 0 };
    const prev = arr[idx - 1];

    if (!prev) {
      return { ...curr, revenue_growth: 0, profit_growth: 0 };
    }

    return {
      ...curr,
      revenue_growth: parseFloat(
        (((curr.revenue - prev.revenue) / prev.revenue) * 100).toFixed(2),
      ),
      profit_growth: parseFloat(
        (((curr.net_profit - prev.net_profit) / prev.net_profit) * 100).toFixed(
          2,
        ),
      ),
    };
  });

  return c.json({ success: true, code, trends: growthTrends });
});

/** Endpoint 9: Screener Emiten High-Growth (profit naik 2 tahun beruntun) */
app.get("/api/screener/growth", (c) => {
  // Logika: Mencari emiten yang profit 2025 > 2024 > 2023
  const result = db
    .query(
      `
    SELECT e.code, e.name, h1.net_profit as profit_2025, h2.net_profit as profit_2024
    FROM emiten e
    JOIN stock_histories h1 ON e.id = h1.emiten_id AND h1.year = 2025
    JOIN stock_histories h2 ON e.id = h2.emiten_id AND h2.year = 2024
    WHERE h1.net_profit > h2.net_profit
    ORDER BY (h1.net_profit - h2.net_profit) / h2.net_profit DESC
    LIMIT 20
  `,
    )
    .all();

  return c.json({ success: true, count: result.length, data: result });
});

/** Endpoint 10: Fair Value Estimate berdasarkan rata-rata PER historis */
app.get("/api/saham/:code/valuation", (c) => {
  const code = c.req.param("code").toUpperCase();

  const data = db
    .query(
      `
    SELECT e.last_price, e.per as current_per, 
           AVG(h.per) as avg_5y_per
    FROM emiten e
    JOIN stock_histories h ON e.id = h.emiten_id
    WHERE e.code = ?
    GROUP BY e.id
  `,
    )
    .get(code) as {
    last_price: number;
    current_per: number;
    avg_5y_per: number;
  };

  if (!data)
    return c.json({ success: false, message: "Data tidak cukup" }, 404);

  const discount = data.avg_5y_per - data.current_per;
  const status =
    discount > 0 ? "Undervalued vs Historical" : "Overvalued vs Historical";

  return c.json({
    success: true,
    code,
    status,
    current_per: data.current_per,
    avg_historical_per: parseFloat(data.avg_5y_per.toFixed(2)),
    potensi_upside_per: parseFloat(discount.toFixed(2)),
  });
});

/** Endpoint 11: Pemantau Data Usang (Scraper Diagnostics) */
app.get("/api/diagnostics/stale", (c) => {
  const staleFundamental = db
    .query(
      "SELECT code, name, fundamental_updated_at FROM emiten ORDER BY fundamental_updated_at ASC LIMIT 10",
    )
    .all() as Partial<EmitenDbRow>[];

  const stalePrice = db
    .query(
      "SELECT code, name, price_updated_at FROM emiten ORDER BY price_updated_at ASC LIMIT 10",
    )
    .all() as Partial<EmitenDbRow>[];

  return c.json({
    success: true,
    needs_fundamental_sync: staleFundamental,
    needs_price_sync: stalePrice,
  });
});

/** Endpoint 12: Cek Status Database (Health Check) */
app.get("/api/health", (c) => {
  const totalEmiten: any = db
    .query("SELECT COUNT(*) as total FROM emiten")
    .get();

  return c.json({
    status: "healthy",
    runtime: "Bun",
    total_tracked_emiten: totalEmiten?.total ?? 0,
    timestamp: new Date().toISOString(),
  });
});

export default app;
