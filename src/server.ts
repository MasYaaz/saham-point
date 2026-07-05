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
    data: {
      ...emiten,
      histories: histories,
    },
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
 * Endpoint BARU 3: Pencarian Nilai Murah (Value Investing Screener)
 * Menggunakan pendekatan Benjamin Graham / value investing dasar:
 * Memfilter saham dengan kinerja ROE bagus, utang (DER) sehat, dan valuasi (PBV/PER) wajar/murah.
 * Parameter query opsional: ?max_pbv=1.5&min_roe=10&max_der=1.5
 */
app.get("/api/screener/undervalued", (c) => {
  const maxPbv = parseFloat(c.req.query("max_pbv") ?? "1.5");
  const minRoe = parseFloat(c.req.query("min_roe") ?? "10.0"); // Min 10% ROE
  const maxDer = parseFloat(c.req.query("max_der") ?? "2.0"); // Maks 2.0x utang/ekuitas

  const result = db
    .query(
      `
      SELECT code, name, sector, last_price, market_cap, pbv, per, roe, der, dividend_yield
      FROM emiten
      WHERE pbv > 0 AND pbv <= ? 
        AND roe >= ? 
        AND der <= ? 
        AND per > 0
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
 * Endpoint BARU 4: Penguasa Pasar (Top Market Cap & Movers)
 * Mengambil saham 'Big Caps' atau saham tertentu berdasarkan urutan parameter tertentu
 * Pilihan jenis: ?sort=market_cap (Default) | ?sort=dividend_yield
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
 * Endpoint BARU 5: Pemantau Data Usang (Scraper Diagnostics)
 * Sangat berguna bagi AI Agent untuk mengecek emiten mana yang datanya paling tertinggal
 * dan butuh segera dipaksa masuk antrean sync fundamental / harga harian.
 */
app.get("/api/diagnostics/stale", (c) => {
  const staleFundamental = db
    .query(
      `
      SELECT code, name, fundamental_updated_at 
      FROM emiten 
      ORDER BY fundamental_updated_at ASC 
      LIMIT 10
      `,
    )
    .all() as Partial<EmitenDbRow>[];

  const stalePrice = db
    .query(
      `
      SELECT code, name, price_updated_at 
      FROM emiten 
      ORDER BY price_updated_at ASC 
      LIMIT 10
      `,
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
