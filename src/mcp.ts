#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { VERSION } from "./config";

// 💡 CATATAN OPTIMASI:
// Semua static import untuk service dihapus dari top-level agar startup instant.
// Service dimuat secara asynchronous saat tool dipanggil (Lazy Loading).

const AVAILABLE_SECTORS = [
  "Healthcare",
  "Basic Materials",
  "Financials",
  "Transportation & Logistic",
  "Technology",
  "Consumer Non-Cyclicals",
  "Industrials",
  "Energy",
  "Consumer Cyclicals",
  "Infrastructures",
  "Properties & Real Estate",
] as const;

// ============================================================================
// FACTORY FUNCTION: MEMBUAT INSTANS MCP SERVER
// ============================================================================
export function createMcpServer() {
  const mcpServer = new McpServer({
    name: "saham-point-mcp",
    version: VERSION,
  });

  // --- Saham Core Tools ---
  mcpServer.registerTool(
    "get_stock_profile",
    {
      description:
        "Mengambil profil ringkas emiten saham Indonesia (IDX) beserta seluruh laporan keuangan tahunannya.",
      inputSchema: {
        code: z.string().describe("Kode ticker saham, misal: BBRI, TLKM, ASII"),
      },
    },
    async ({ code }) => {
      const { getEmitenProfile } = await import("./services/sahamService");
      const data = getEmitenProfile(code);
      if (!data)
        return {
          content: [{ type: "text", text: `Ticker ${code} tidak ditemukan` }],
        };
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  mcpServer.registerTool(
    "get_technical_indicators",
    {
      description:
        "Mengambil rangkuman murni 16+ indikator teknikal saham (RSI, MACD, Moving Averages, Bollinger, ATR, ADX, Ichimoku, Volume).",
      inputSchema: {
        code: z.string().describe("Kode ticker saham, misal: BBRI"),
        range: z
          .string()
          .optional()
          .default("1y")
          .describe("Rentang historis: 1mo, 3mo, 6mo, 1y, 2y"),
      },
    },
    async ({ code, range }) => {
      const { getTechnicalIndicators } =
        await import("./services/technicalService");
      const result = await getTechnicalIndicators(code, range);
      if (!result)
        return {
          content: [
            { type: "text", text: `Data teknikal ${code} tidak ditemukan` },
          ],
        };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  mcpServer.registerTool(
    "get_stock_valuation",
    {
      description:
        "Menganalisis estimasi harga wajar emiten berdasarkan rasio PER saat ini vs rata-rata PER historis 5 tahun.",
      inputSchema: {
        code: z.string().describe("Kode ticker saham, misal: ASII"),
      },
    },
    async ({ code }) => {
      const { getEmitenValuation } = await import("./services/sahamService");
      const valuation = getEmitenValuation(code);
      if (!valuation)
        return {
          content: [
            {
              type: "text",
              text: `Data historis tidak mencukupi untuk ${code}`,
            },
          ],
        };
      return {
        content: [{ type: "text", text: JSON.stringify(valuation, null, 2) }],
      };
    },
  );

  mcpServer.registerTool(
    "get_stock_growth",
    {
      description:
        "Menganalisis tren pertumbuhan YoY (Year-over-Year) pendapatan dan laba bersih emiten.",
      inputSchema: {
        code: z.string().describe("Kode ticker saham, misal: TLKM"),
      },
    },
    async ({ code }) => {
      const { getEmitenGrowth } = await import("./services/sahamService");
      const trends = getEmitenGrowth(code);
      if (!trends)
        return { content: [{ type: "text", text: "Emiten tidak ditemukan" }] };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ code: code.toUpperCase(), trends }, null, 2),
          },
        ],
      };
    },
  );

  mcpServer.registerTool(
    "get_stock_news",
    {
      description:
        "Mengambil berita finansial dan emiten terkini dari sumber RSS Google News & Yahoo Finance.",
      inputSchema: {
        code: z.string().describe("Kode ticker saham, misal: BBRI atau IHSG"),
        limit: z.number().optional().default(10).describe("Jumlah berita"),
      },
    },
    async ({ code, limit }) => {
      const { getEmitenNewsData } = await import("./services/sahamService");
      const result = await getEmitenNewsData(code, limit, "id");
      if (!result)
        return {
          content: [{ type: "text", text: `Ticker ${code} tidak ditemukan` }],
        };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { code: code.toUpperCase(), ...result },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // --- Registered Tool ---
  mcpServer.registerTool(
    "get_sector_emiten",
    {
      description: `Mengambil daftar emiten berdasarkan nama sektor industri (diurutkan dari market cap terbesar).\nSektor yang tersedia: ${AVAILABLE_SECTORS.join(", ")}`,
      inputSchema: {
        name: z
          .enum(AVAILABLE_SECTORS)
          .describe("Pilih salah satu nama sektor industri IDX yang valid"),
      },
    },
    async ({ name }) => {
      const { getEmitenBySector } = await import("./services/sektorService");
      const result = getEmitenBySector(name);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // --- Screener Tools ---
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
        await import("./services/screenerService");
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
      const { getMarketCapStocks } = await import("./services/screenerService");
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
        await import("./services/screenerService");
      const result = getTechnicalScreener({ strategy, limit });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

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
      const { getDividendHunters } = await import("./services/screenerService");
      const result = getDividendHunters({ minYield: min_yield, limit });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

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
      const { getCashRichStocks } = await import("./services/screenerService");
      const result = getCashRichStocks(limit);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

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
      const { getGrowthStocks } = await import("./services/screenerService");
      const result = getGrowthStocks(limit);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

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
      const { getRankedStocks } = await import("./services/screenerService");
      const result = getRankedStocks(sort, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  return mcpServer;
}

// ============================================================================
// HELPER FOR CLI TUI DISPLAY
// ============================================================================
export function getMcpToolsList() {
  const mcpServer = createMcpServer();

  const registeredTools =
    (mcpServer as any)._registeredTools || (mcpServer as any)._tools || {};

  return Object.entries(registeredTools).map(([name, tool]: [string, any]) => ({
    name,
    description: tool.description ?? "Tidak ada deskripsi",
  }));
}

// ============================================================================
// 🚀 EXECUTION ENGINE: JALANKAN SERVING VIA STDIO
// ============================================================================
async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error(`[MCP] Saham Point MCP Server v${VERSION} running on stdio`);
}

if (
  import.meta.main ||
  process.argv[1]?.includes("index") ||
  process.argv[1]?.includes("mcp")
) {
  startMcpServer().catch((error) => {
    console.error("[MCP] Fatal Error starting server:", error);
    process.exit(1);
  });
}
