import { Hono } from "hono";
import db from "../db";
import { VERSION } from "../config";
import { AVAILABLE_SECTORS } from "../types";
import { parseLimit } from "../utils/endpoint/parseLimit";

export const metaRouter = new Hono();

// GET /api (Katalog Dokumentasi Resmi API Gateway / MCP Matrix)
metaRouter.get("/", (c) => {
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
          description: "Katalog dokumentasi resmi rute API Gateway ini.",
          parameters: {},
        },
        {
          path: "/api/saham/:code",
          method: "GET",
          description: "Profil ringkas emiten beserta histori keuangan.",
          parameters: {
            code: { type: "path_parameter", required: true, example: "BBRI" },
          },
        },
        {
          path: "/api/saham/:code/history",
          method: "GET",
          description: "Histori keuangan murni emiten.",
          parameters: {
            code: { type: "path_parameter", required: true, example: "BMRI" },
          },
        },
        {
          path: "/api/saham/:code/growth",
          method: "GET",
          description: "Analisis tren YoY pendapatan & laba.",
          parameters: {
            code: { type: "path_parameter", required: true, example: "TLKM" },
          },
        },
        {
          path: "/api/saham/:code/valuation",
          method: "GET",
          description: "Estimasi harga wajar vs rata-rata PER.",
          parameters: {
            code: { type: "path_parameter", required: true, example: "ASII" },
          },
        },
        {
          path: "/api/saham/:code/news",
          method: "GET",
          description: "Agregator berita RSS emiten.",
          parameters: {
            code: { type: "path_parameter", required: true, example: "BBRI" },
            limit: { type: "query_string", required: false, default: "10" },
            lang: {
              type: "query_string",
              required: false,
              default: "id",
              options: ["id", "en"],
            },
          },
        },
        {
          path: "/api/sektor/:name",
          method: "GET",
          description: "Daftar emiten berdasar sektor.",
          parameters: {
            name: {
              type: "path_parameter",
              required: true,
              example: "Financials",
              options: AVAILABLE_SECTORS,
            },
          },
        },
        {
          path: "/api/technical/:code",
          method: "GET",
          description: "Candlestick OHLCV Yahoo Finance & Opsional Indikator.",
          parameters: {
            code: { type: "path_parameter", required: true, example: "IHSG" },
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
            indicators: {
              type: "query_string",
              required: false,
              default: "false",
              options: ["true", "false"],
            },
          },
        },
        {
          path: "/api/technical/:code/indicators",
          method: "GET",
          description:
            "Rangkuman murni seluruh kalkulasi indikator teknikal (SMA, EMA, RSI, Stoch, MACD, BB, ATR, ADX, PSAR, Ichimoku, OBV, MFI, VWAP).",
          parameters: {
            code: { type: "path_parameter", required: true, example: "BBRI" },
            range: {
              type: "query_string",
              required: false,
              default: "1y",
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
          description: "Screener Value Investing.",
          parameters: {
            max_pbv: { type: "query_string", required: false, default: "1.5" },
            min_roe: { type: "query_string", required: false, default: "10.0" },
            max_der: { type: "query_string", required: false, default: "2.0" },
            limit: { type: "query_string", required: false, default: "50" },
          },
        },
        {
          path: "/api/screener/market-cap",
          method: "GET",
          description: "Screener rentang kapitalisasi pasar.",
          parameters: {
            min_market_cap: {
              type: "query_string",
              required: false,
              default: "0",
            },
            max_market_cap: { type: "query_string", required: false },
            sort: {
              type: "query_string",
              required: false,
              options: ["desc", "asc"],
              default: "desc",
            },
            limit: { type: "query_string", required: false, default: "25" },
          },
        },
        {
          path: "/api/screener/technical",
          method: "GET",
          description: "Screener momentum pergerakan harga.",
          parameters: {
            strategy: {
              type: "query_string",
              required: false,
              options: ["breakout", "reversal", "volatile"],
              default: "breakout",
            },
            limit: { type: "query_string", required: false, default: "30" },
          },
        },
        {
          path: "/api/screener/dividend-hunters",
          method: "GET",
          description: "Screener dividend yield jumbo.",
          parameters: {
            min_yield: {
              type: "query_string",
              required: false,
              default: "5.0",
            },
            limit: { type: "query_string", required: false, default: "30" },
          },
        },
        {
          path: "/api/screener/cash-rich",
          method: "GET",
          description: "Screener emiten solven FCF positif & Net Debt < 0.",
          parameters: {
            limit: { type: "query_string", required: false, default: "25" },
          },
        },
        {
          path: "/api/screener/growth",
          method: "GET",
          description: "Screener pertumbuhan laba positif.",
          parameters: {
            limit: { type: "query_string", required: false, default: "25" },
          },
        },
        {
          path: "/api/screener/rankings",
          method: "GET",
          description: "Peringkat emiten teratas berdasar market cap/yield.",
          parameters: {
            sort: {
              type: "query_string",
              required: false,
              options: ["market_cap", "dividend_yield"],
              default: "market_cap",
            },
            limit: { type: "query_string", required: false, default: "25" },
          },
        },
        {
          path: "/api/diagnostics/stale",
          method: "GET",
          description: "Melacak data usang untuk antrean scraper.",
          parameters: {
            limit: { type: "query_string", required: false, default: "10" },
          },
        },
        {
          path: "/api/health",
          method: "GET",
          description: "Status kesehatan server Bun.",
          parameters: {},
        },
      ],
    },
  });
});

// GET /api/diagnostics/stale
metaRouter.get("/diagnostics/stale", (c) => {
  const limit = parseLimit(c.req.query("limit"), 10, 50);

  const staleFundamental = db
    .query(
      "SELECT code, name, fundamental_updated_at FROM emiten ORDER BY fundamental_updated_at ASC LIMIT ?",
    )
    .all(limit);

  const stalePrice = db
    .query(
      "SELECT code, name, price_updated_at FROM emiten ORDER BY price_updated_at ASC LIMIT ?",
    )
    .all(limit);

  return c.json({
    success: true,
    needs_fundamental_sync: staleFundamental,
    needs_price_sync: stalePrice,
  });
});

// GET /api/health
metaRouter.get("/health", (c) => {
  const totalEmiten = db.query("SELECT COUNT(*) as total FROM emiten").get() as
    { total: number } | undefined;

  return c.json({
    status: "healthy",
    runtime: "Bun Core Engine",
    total_tracked_emiten: totalEmiten?.total ?? 0,
    timestamp: new Date().toISOString(),
  });
});
