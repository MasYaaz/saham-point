import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerStockTools(mcpServer: McpServer) {
  // --- Pencarian Kode Ticker ---
  mcpServer.registerTool(
    "search_stock_code",
    {
      description:
        "Mencari kode ticker resmi 4 huruf IDX berdasarkan nama perusahaan atau kata kunci pencarian (misal: 'Alfamart', 'Telkom').",
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

  // --- Daftar Emiten dan Status Sync Database ---
  mcpServer.registerTool(
    "list_emiten",
    {
      description:
        "Mengambil daftar emiten saham di database lokal beserta status kelengkapan data fundamentalnya.",
      inputSchema: {
        limit: z
          .number()
          .optional()
          .default(100)
          .describe("Batas jumlah emiten yang ditampilkan (default: 100)"),
        search: z
          .string()
          .optional()
          .describe("Kata kunci opsional untuk filter kode atau nama emiten"),
      },
    },
    async ({ limit, search }) => {
      const db = (await import("../db")).default;
      let query =
        "SELECT id, code, name, sector, is_profile_complete, is_fundamental_complete, fundamental_updated_at FROM emiten";
      const params: any[] = [];

      if (search) {
        query += " WHERE code LIKE ? OR name LIKE ?";
        params.push(`%${search.toUpperCase()}%`, `%${search}%`);
      }

      query += " ORDER BY code ASC LIMIT ?";
      params.push(limit);

      const emitenList = db.query(query).all(...params);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total_fetched: emitenList.length,
                data: emitenList,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // --- Profil dan Laporan Keuangan Emiten ---
  mcpServer.registerTool(
    "get_stock_profile",
    {
      description:
        "Mengambil profil lengkap emiten IDX beserta histori laporan keuangan tahunan dan kuartalan untuk analisis fundamental dan valuasi.",
      inputSchema: {
        code: z.string().describe("Kode ticker saham, misal: BBRI, TLKM, ASII"),
      },
    },
    async ({ code }) => {
      const { getEmitenProfile } = await import("../services/sahamService");
      const data = getEmitenProfile(code);

      if (!data) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  code: code.toUpperCase(),
                  message: `Ticker ${code.toUpperCase()} tidak ditemukan di database.`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

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
        "Mengambil 16+ indikator teknikal saham (RSI, MACD, MA, Bollinger) beserta sinyal evaluasi. Gunakan field status dan summary_signals dari respons.",
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
              text: JSON.stringify(
                {
                  code: code.toUpperCase(),
                  message: `Data teknikal ${code.toUpperCase()} tidak ditemukan.`,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // --- Pencarian Berita Umum & Terkini ---
  mcpServer.registerTool(
    "search_news",
    {
      description:
        "Mencari berita terkini pasar saham, isu korporasi, ekonomi, politik, atau peristiwa umum beserta teks artikelnya.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Kata kunci atau topik pencarian berita, misal: 'kebijakan PPN', 'teknologi AI', 'cuaca ekstrem', 'saham BBCA'",
          ),
        maxDays: z
          .number()
          .optional()
          .default(30)
          .describe(
            "Batas maksimal umur berita dalam hari (default: 30). Jika berita tidak ditemukan, nilai ini dapat diperbesar.",
          ),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Jumlah maksimal artikel yang ditarik (default: 10)"),
        lang: z
          .enum(["id", "en"])
          .optional()
          .default("id")
          .describe("Bahasa sumber berita (default: 'id')"),
      },
    },
    async ({ query, maxDays, limit, lang }) => {
      const { searchNews } =
        await import("../services/newsServices/searchNews");

      const news = await searchNews(query, maxDays, limit, lang);

      if (!news || news.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  query,
                  total: 0,
                  message:
                    "Tidak ada berita ditemukan sesuai pencarian tersebut.",
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
