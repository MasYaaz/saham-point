// src/tools/screenerTools.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerScreenerTools(mcpServer: McpServer) {
  // --- Screener: Undervalued (Value Investing) ---
  mcpServer.registerTool(
    "screener_undervalued",
    {
      description:
        "Screener Value Investing untuk menyaring saham berharga murah (undervalued) dengan profitabilitas (ROE) tinggi dan utang (DER) sehat.",
      inputSchema: {
        max_pbv: z.number().optional().default(1.5),
        min_roe: z.number().optional().default(10.0),
        max_der: z.number().optional().default(2.0),
        limit: z.number().optional().default(25),
      },
    },
    async ({ max_pbv, min_roe, max_der, limit }) => {
      const { getUndervaluedStocks } =
        await import("../services/screenerServices/UndervaluedStocks");
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
        "Screener saham berdasarkan kriteria rentang kapitalisasi pasar (Big, Mid, atau Small Cap) dan pengurutan.",
      inputSchema: {
        min_market_cap: z.number().optional().default(0),
        max_market_cap: z.number().optional().nullable(),
        sort: z.string().optional().default("desc"),
        limit: z.number().optional().default(25),
      },
    },
    async ({ min_market_cap, max_market_cap, sort, limit }) => {
      const { getMarketCapStocks } =
        await import("../services/screenerServices/MarketCaps");
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
        "Screener momentum pergerakan harga saham harian berdasarkan strategi teknikal (breakout, reversal, atau volatile).",
      inputSchema: {
        strategy: z.string().optional().default("breakout"),
        limit: z.number().optional().default(30),
      },
    },
    async ({ strategy, limit }) => {
      const { getTechnicalScreener } =
        await import("../services/screenerServices/Technical");
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
        "Screener untuk memburu saham dengan Dividend Yield tinggi dan tingkat utang sehat (DER <= 1.5).",
      inputSchema: {
        min_yield: z.number().optional().default(5.0),
        limit: z.number().optional().default(25),
      },
    },
    async ({ min_yield, limit }) => {
      const { getDividendHunters } =
        await import("../services/screenerServices/DividendHunter");
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
        "Screener perusahaan solven dengan Free Cash Flow positif dan kas melebihi total utang (Net Debt negatif).",
      inputSchema: {
        limit: z.number().optional().default(25),
      },
    },
    async ({ limit }) => {
      const { getCashRichStocks } =
        await import("../services/screenerServices/CashRichStocks");
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
        "Screener emiten yang mencatatkan akselerasi pertumbuhan laba bersih positif pada laporan keuangan terbaru.",
      inputSchema: {
        limit: z.number().optional().default(25),
      },
    },
    async ({ limit }) => {
      const { getGrowthStocks } =
        await import("../services/screenerServices/GrowthStocks");
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
        "Menampilkan peringkat emiten teratas bursa berdasarkan kapitalisasi pasar atau imbal hasil dividen.",
      inputSchema: {
        sort: z.string().optional().default("market_cap"),
        limit: z.number().optional().default(25),
      },
    },
    async ({ sort, limit }) => {
      const { getRankedStocks } =
        await import("../services/screenerServices/RankedStocks");
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
        "Screener deteksi saham spekulatif/gorengan berbasis pengumuman UMA BEI, anomali fundamental, dan sinyal pump/volume spike harian. Sajikan analisis faktual dari field 'reasons' dan 'candle_signals'.",
      inputSchema: {
        limit: z
          .number()
          .optional()
          .describe(
            "Jumlah maksimal emiten terdeteksi yang ingin ditampilkan (opsional, jika kosong akan menampilkan seluruh emiten UMA terdeteksi)",
          ),
      },
    },
    async ({ limit }) => {
      const { getGorenganStocks } =
        await import("../services/screenerServices/GorenganStocks");

      let result = await getGorenganStocks();

      if (limit && limit > 0) {
        result = result.slice(0, limit);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                usage_guidelines:
                  "Sajikan analisis secara faktual berdasarkan field 'reasons' dan 'candle_signals'. Dilarang mengasumsikan indikator eksternal seperti MACD/RSI.",
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
