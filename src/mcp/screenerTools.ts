// src/tools/screenerTools.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerScreenerTools(mcpServer: McpServer) {
  // --- Screener: Undervalued (Value Investing) ---
  mcpServer.registerTool(
    "screener_undervalued",
    {
      description:
        "Screener Value Investing: menyaring saham murah dengan ROE tinggi, DER sehat, dan PBV/PER wajar.",
      inputSchema: {
        max_pbv: z.number().optional().default(1.5),
        min_roe: z.number().optional().default(10.0),
        max_der: z.number().optional().default(2.0),
        limit: z.number().optional().default(25),
      },
    },
    async ({ max_pbv, min_roe, max_der, limit }) => {
      const { getUndervaluedStocks } =
        await import("../services/screenerService");
      const result = getUndervaluedStocks({
        maxPbv: max_pbv,
        minRoe: min_roe,
        maxDer: max_der,
        limit,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // --- Screener: Market Cap ---
  mcpServer.registerTool(
    "screener_market_cap",
    {
      description:
        "Screener menyaring daftar saham berdasarkan kriteria rentang kapitalisasi pasar (Market Cap).",
      inputSchema: {
        min_market_cap: z.number().optional().default(0),
        max_market_cap: z.number().optional().nullable(),
        sort: z.string().optional().default("desc"),
        limit: z.number().optional().default(25),
      },
    },
    async ({ min_market_cap, max_market_cap, sort, limit }) => {
      const { getMarketCapStocks } =
        await import("../services/screenerService");
      const result = getMarketCapStocks({
        minMarketCap: min_market_cap,
        maxMarketCap: max_market_cap ?? null,
        sort,
        limit,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // --- Screener: Momentum Teknikal ---
  mcpServer.registerTool(
    "screener_technical",
    {
      description:
        "Screener momentum pergerakan harga saham harian berdasarkan strategi teknikal (breakout, reversal, volatile).",
      inputSchema: {
        strategy: z.string().optional().default("breakout"),
        limit: z.number().optional().default(30),
      },
    },
    async ({ strategy, limit }) => {
      const { getTechnicalScreener } =
        await import("../services/screenerService");
      const result = getTechnicalScreener({ strategy, limit });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // --- Screener: Dividend Hunters ---
  mcpServer.registerTool(
    "screener_dividend_hunters",
    {
      description:
        "Screener memburu saham dengan Dividend Yield jumbo dan rasio utang aman (DER <= 1.5).",
      inputSchema: {
        min_yield: z.number().optional().default(5.0),
        limit: z.number().optional().default(25),
      },
    },
    async ({ min_yield, limit }) => {
      const { getDividendHunters } =
        await import("../services/screenerService");
      const result = getDividendHunters({ minYield: min_yield, limit });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // --- Screener: Perusahaan Cash Rich ---
  mcpServer.registerTool(
    "screener_cash_rich",
    {
      description:
        "Screener perusahaan super solven dengan Free Cash Flow positif dan Net Debt negatif.",
      inputSchema: {
        limit: z.number().optional().default(25),
      },
    },
    async ({ limit }) => {
      const { getCashRichStocks } = await import("../services/screenerService");
      const result = getCashRichStocks(limit);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // --- Screener: Growth Stocks ---
  mcpServer.registerTool(
    "screener_growth",
    {
      description:
        "Screener emiten yang menunjukkan akselerasi pertumbuhan laba bersih positif pada laporan terbaru.",
      inputSchema: {
        limit: z.number().optional().default(25),
      },
    },
    async ({ limit }) => {
      const { getGrowthStocks } = await import("../services/screenerService");
      const result = getGrowthStocks(limit);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // --- Screener: Rankings ---
  mcpServer.registerTool(
    "screener_rankings",
    {
      description:
        "Peringkat emiten teratas berdasarkan kriteria market_cap atau dividend_yield.",
      inputSchema: {
        sort: z.string().optional().default("market_cap"),
        limit: z.number().optional().default(25),
      },
    },
    async ({ sort, limit }) => {
      const { getRankedStocks } = await import("../services/screenerService");
      const result = getRankedStocks(sort, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // --- Screener: Saham Gorengan / Spekulatif ---
  mcpServer.registerTool(
    "screener_gorengan",
    {
      description:
        "Screener Deteksi Saham Gorengan / Spekulatif: Menyaring emiten lapis 3 (micro cap/penny stock) dengan anomali fundamental & sinyal candle OHLCV terkini (Volume Spike & Pump Harga). Otomatis mengeliminasi saham mati/tanpa data.",
      inputSchema: {
        limit: z
          .number()
          .optional()
          .default(25)
          .describe("Jumlah maksimal saham terdeteksi yang ditampilkan"),
      },
    },
    async ({ limit }) => {
      const { getGorenganStocks } = await import("../services/screenerService");

      // Menggunakan await karena fungsi ini bersifat async (fetching data candle)
      const result = await getGorenganStocks(limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total: result.length,
                data: result,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
