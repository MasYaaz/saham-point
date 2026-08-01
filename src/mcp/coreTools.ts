// src/tools/coreTools.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerCoreTools(mcpServer: McpServer) {
  // --- Pencarian Kode Ticker ---
  mcpServer.registerTool(
    "search_stock_code",
    {
      description:
        "Mencari kode ticker saham (emiten) IDX berdasarkan nama perusahaan atau kata kunci pencarian (misal: 'Alfamart', 'Bank Rakyat', 'Telkom').",
      inputSchema: {
        query: z.string().describe("Nama perusahaan atau kata kunci pencarian"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Batas jumlah hasil pencarian yang dikembalikan"),
      },
    },
    async ({ query, limit }) => {
      const { searchEmiten } = await import("../services/sahamService");
      const results = searchEmiten(query, limit);

      if (!results || results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  query,
                  total: 0,
                  message: `Tidak ditemukan emiten dengan kata kunci "${query}"`,
                  data: [],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                query,
                total: results.length,
                data: results,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // --- Profil & Laporan Keuangan Emiten ---
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
      const { getEmitenProfile } = await import("../services/sahamService");
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

  // --- Indikator Teknikal ---
  mcpServer.registerTool(
    "get_technical_indicators",
    {
      description:
        "Mengambil rangkuman 16+ indikator teknikal saham (RSI, MACD, Moving Averages, Bollinger, ATR, ADX, Ichimoku, Volume) lengkap dengan evaluasi status grounded (oversold/overbought/neutral) dan ringkasan sinyal (summary_signals). WAJIB gunakan field status dan summary_signals yang dikembalikan tanpa menghitung atau menafsirkan ambang batas angka secara mandiri.",
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
        await import("../services/technicalService");
      const result = await getTechnicalIndicators(code, range);

      if (!result) {
        return {
          content: [
            {
              type: "text",
              text: `Data teknikal ${code.toUpperCase()} tidak ditemukan`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // --- Valuasi PER Historis ---
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
      const { getEmitenValuation } = await import("../services/sahamService");
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

  // --- Tren Pertumbuhan YoY ---
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
      const { getEmitenGrowth } = await import("../services/sahamService");
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

  // --- Berita & Sentimen Emiten ---
  mcpServer.registerTool(
    "get_stock_news",
    {
      description:
        "Mengambil seluruh berita finansial & emiten terkini (2 minggu terakhir) dari Google News & Yahoo Finance.",
      inputSchema: {
        code: z.string().describe("Kode ticker saham, misal: BBRI, AMRT, ADRO"),
        companyName: z
          .string()
          .optional()
          .describe(
            "Nama perusahaan opsional untuk hasil query yang lebih akurat, misal: Alfamart",
          ),
      },
    },
    async ({ code, companyName }) => {
      const { fetchEmitenNews } = await import("../services/newsService");
      const news = await fetchEmitenNews(code, companyName, "id");

      if (!news || news.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  code: code.toUpperCase(),
                  total: 0,
                  message: `Tidak ada berita terkini dalam 2 minggu terakhir untuk ${code}`,
                  data: [],
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                code: code.toUpperCase(),
                total: news.length,
                data: news,
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
