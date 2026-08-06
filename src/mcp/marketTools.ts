// src/tools/marketTools.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/** Daftar sektor industri terdaftar resmi di Bursa Efek Indonesia (IDX) */
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

export function registerMarketTools(mcpServer: McpServer) {
  // --- Kalender & Riwayat Aksi Korporasi ---
  mcpServer.registerTool(
    "get_corporate_actions",
    {
      description:
        "Mengambil agenda dan riwayat aksi korporasi emiten (Dividen, Stock Split, Rights Issue, RUPS, Saham Bonus, Buyback, dll).",
      inputSchema: {
        code: z
          .string()
          .transform((v) => v.trim().toUpperCase())
          .optional()
          .describe(
            "Kode ticker saham BEI/IDX opsional (contoh: BBCA, TLKM). Kosongkan jika ingin mencari di seluruh emiten.",
          ),
        actionType: z
          .enum([
            "DIVIDEND",
            "STOCK_SPLIT",
            "REVERSE_STOCK",
            "RIGHTS_ISSUE",
            "TANPA_HMETD",
            "ESOP_MSOP",
            "BONUS",
            "IPO",
            "LISTING",
            "DELISTING",
            "WARRANT",
            "MERGER",
            "CAPITAL_REDUCTION",
            "CONVERSION",
            "BUYBACK",
            "PRIVATE_PLACEMENT",
            "RUPS",
            "OTHER",
          ])
          .optional()
          .describe(
            "Jenis aksi korporasi yang ingin difilter (opsional). Contoh: 'DIVIDEND', 'STOCK_SPLIT', 'RUPS'.",
          ),
        fromDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
          .optional()
          .describe(
            "Tanggal awal pencatatan dengan format YYYY-MM-DD (opsional, contoh: '2026-01-01').",
          ),
        toDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
          .optional()
          .describe(
            "Tanggal akhir pencatatan dengan format YYYY-MM-DD (opsional, contoh: '2026-12-31').",
          ),
        limit: z
          .number()
          .min(1)
          .max(500)
          .optional()
          .default(100)
          .describe(
            "Batas maksimal jumlah data yang dikembalikan (default: 100).",
          ),
      },
    },
    async ({ code, actionType, fromDate, toDate, limit }) => {
      try {
        const corporateActionService = (
          await import("../services/corporateActionService")
        ).default;

        // 1. Ambil data dari database menggunakan service
        const { data } = corporateActionService.findMany({
          securityCode: code,
          startDate: fromDate,
          endDate: toDate,
          limit: limit ?? 100,
        });

        // 2. Pengelompokan data berdasarkan kategori aksi korporasi
        const categorized = {
          dividends: [] as typeof data,
          stockSplits: [] as typeof data,
          rightsIssues: [] as typeof data,
          esopMsop: [] as typeof data,
          bonuses: [] as typeof data,
          warrants: [] as typeof data,
          buybacks: [] as typeof data,
          privatePlacements: [] as typeof data,
          rups: [] as typeof data,
          otherActions: [] as typeof data,
        };

        for (const item of data) {
          const caType = (item.type_of_ca || "").toUpperCase();

          if (caType.includes("DIVIDEND") || caType.includes("DIVIDEN")) {
            categorized.dividends.push(item);
          } else if (caType.includes("SPLIT")) {
            categorized.stockSplits.push(item);
          } else if (caType.includes("RIGHT") || caType.includes("HMETD")) {
            categorized.rightsIssues.push(item);
          } else if (caType.includes("ESOP") || caType.includes("MSOP")) {
            categorized.esopMsop.push(item);
          } else if (caType.includes("BONUS")) {
            categorized.bonuses.push(item);
          } else if (caType.includes("WARRANT") || caType.includes("WARAN")) {
            categorized.warrants.push(item);
          } else if (caType.includes("BUYBACK")) {
            categorized.buybacks.push(item);
          } else if (
            caType.includes("PRIVATE") ||
            caType.includes("PLACEMENT")
          ) {
            categorized.privatePlacements.push(item);
          } else if (caType.includes("RUPS") || caType.includes("GMS")) {
            categorized.rups.push(item);
          } else {
            categorized.otherActions.push(item);
          }
        }

        // 3. Filter berdasarkan actionType jika spesifik diminta oleh user
        if (actionType) {
          if (actionType === "DIVIDEND") {
            categorized.stockSplits = [];
            categorized.rightsIssues = [];
            categorized.esopMsop = [];
            categorized.bonuses = [];
            categorized.warrants = [];
            categorized.buybacks = [];
            categorized.privatePlacements = [];
            categorized.rups = [];
            categorized.otherActions = [];
          } else if (actionType === "STOCK_SPLIT") {
            categorized.dividends = [];
            categorized.rightsIssues = [];
            // ...bersihkan array kategori lain jika jenis spesifik dipilih
          }
        }

        const totalActions = data.length;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "success",
                  code: code || "ALL",
                  filterActionType: actionType || "ALL",
                  fromDate: fromDate || null,
                  toDate: toDate || null,
                  totalActions,
                  ...categorized,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "error",
                  code: code || "ALL",
                  message:
                    error?.message ||
                    "Gagal mengambil data aksi korporasi emiten.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );

  // --- Ringkasan Pasar (Market Overview & Top Movers) ---
  mcpServer.registerTool(
    "get_market_overview",
    {
      description:
        "Mengambil ringkasan performa pasar saham terkini (Indeks IHSG, LQ45, serta daftar Top Gainers, Top Losers, dan Most Active).",
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
          .optional()
          .describe(
            "Tanggal data pasar (Format: YYYY-MM-DD). Default hari bursa terbaru.",
          ),
      },
    },
    async ({ date }) => {
      const { getMarketOverview } =
        await import("../services/idxServices/marketOverview");

      try {
        const dateParam = date ? date.replace(/-/g, "") : undefined;
        const result = await getMarketOverview(dateParam);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "success",
                  date: result.date,
                  indices: result.indices,
                  topGainers: result.topGainers,
                  topLosers: result.topLosers,
                  topValue: result.topValue,
                  topVolume: result.topVolume,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "error",
                  message:
                    error?.message ||
                    "Gagal mengambil ringkasan pasar dari BEI.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );

  // --- Daftar Emiten Berdasarkan Sektor Industri ---
  mcpServer.registerTool(
    "get_sector_emiten",
    {
      description:
        "Mengambil daftar emiten berdasarkan nama sektor industri resmi BEI (diurutkan dari market cap terbesar).",
      inputSchema: {
        name: z
          .enum(AVAILABLE_SECTORS)
          .describe("Pilih salah satu nama sektor industri IDX yang valid"),
      },
    },
    async ({ name }) => {
      const { getEmitenBySector } = await import("../services/sektorService");

      try {
        const result = getEmitenBySector(name);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "success",
                  sector: name,
                  total: result.count,
                  data: result.data,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "error",
                  sector: name,
                  message:
                    error?.message ||
                    "Gagal mengambil daftar emiten sektor industri.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );
}
