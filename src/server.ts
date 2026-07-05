// src/server.ts
import { Hono } from "hono";
import db from "./db";

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
 * Endpoint BARU 3B: Screener Teknikal Harian (Technical Momentum Tracker)
 * Menyediakan beberapa strategi berdasarkan pergerakan harga harian (Live & Previous Session)
 * Pilihan strategi: ?strategy=breakout (Default) | ?strategy=reversal | ?strategy=volatile
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
 * Endpoint BARU 3C: Pemburu Dividen Jumbo (Dividend Hunters)
 * Menyaring saham cash-rich yang membagikan dividen yield tinggi, tapi tetap sehat (DER wajar)
 * Parameter query opsional: ?min_yield=5.0
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

/**
 * Endpoint 4: Penguasa Pasar (Top Market Cap & Movers)
 */
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

/**
 * Endpoint 5: Pemantau Data Usang (Scraper Diagnostics)
 */
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

/**
 * Endpoint 6: Cek status database (Health Check)
 */
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
