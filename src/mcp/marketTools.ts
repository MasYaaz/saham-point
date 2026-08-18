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
        "Mengambil agenda dan riwayat aksi korporasi resmi emiten BEI/KSEI (Dividen Tunai/Saham, HMETD/Rights Issue, RUPS/Proxy Voting, Konversi Waran/Obligasi, dan Redemption).",
      inputSchema: {
        code: z
          .string()
          .transform((v) => v.trim().toUpperCase())
          .optional()
          .describe(
            "Kode ticker 4 huruf saham BEI/IDX (contoh: BBCA, TLKM, ASII). Kosongkan jika ingin mengambil jadwal aksi korporasi seluruh emiten.",
          ),
        actionType: z
          .enum([
            "CASH DIVIDEND",
            "MANDATORY CONVERSION",
            "MIXED DIVIDEND",
            "PROXY VOTING",
            "REDEMPTION",
            "RIGHT DISTRIBUTION",
            "STOCK DIVIDEND",
            "VOLUNTARY CONVERSION",
          ])
          .optional()
          .describe(
            "Filter jenis aksi korporasi spesifik berdasarkan standar KSEI:\n" +
              "- 'CASH DIVIDEND': Pembagian dividen tunai\n" +
              "- 'STOCK DIVIDEND': Pembagian dividen berupa saham\n" +
              "- 'MIXED DIVIDEND': Pembagian dividen campuran (tunai & saham)\n" +
              "- 'RIGHT DISTRIBUTION': Distribusi HMETD / Rights Issue\n" +
              "- 'PROXY VOTING': Pemungutan suara RUPST / RUPSLB\n" +
              "- 'REDEMPTION': Pelunasan / penebusan efek atau obligasi\n" +
              "- 'MANDATORY CONVERSION': Konversi efek wajib (misal: obligasi wajib konversi)\n" +
              "- 'VOLUNTARY CONVERSION': Konversi efek sukarela (misal: exercise Waran)",
          ),
        fromDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
          .optional()
          .describe(
            "Batas awal tanggal pencatatan/recording date (format: YYYY-MM-DD, contoh: '2026-01-01').",
          ),
        toDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
          .optional()
          .describe(
            "Batas akhir tanggal pencatatan/recording date (format: YYYY-MM-DD, contoh: '2026-12-31').",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .default(100)
          .describe(
            "Batas maksimal jumlah baris data yang diambil (default: 100, maks: 500).",
          ),
      },
    },
    async ({ code, actionType, fromDate, toDate, limit }) => {
      try {
        const corporateActionService = (
          await import("../services/corporateActionService")
        ).default;

        // 1. Delegasikan parameter filtering (termasuk typeOfCa) langsung ke Database Service
        const { data, total } = corporateActionService.findMany({
          securityCode: code,
          typeOfCa: actionType,
          startDate: fromDate,
          endDate: toDate,
          limit: limit ?? 100,
        });

        // 2. Pengelompokan data ke dalam kategori terstruktur
        const categorized = {
          cashDividends: [] as typeof data,
          stockDividends: [] as typeof data,
          mixedDividends: [] as typeof data,
          rightDistributions: [] as typeof data,
          proxyVotings: [] as typeof data,
          redemptions: [] as typeof data,
          mandatoryConversions: [] as typeof data,
          voluntaryConversions: [] as typeof data,
          otherActions: [] as typeof data,
        };

        for (const item of data) {
          const caType = (item.type_of_ca || "").toUpperCase();

          if (caType.includes("CASH DIVIDEND")) {
            categorized.cashDividends.push(item);
          } else if (caType.includes("STOCK DIVIDEND")) {
            categorized.stockDividends.push(item);
          } else if (caType.includes("MIXED DIVIDEND")) {
            categorized.mixedDividends.push(item);
          } else if (caType.includes("RIGHT DISTRIBUTION")) {
            categorized.rightDistributions.push(item);
          } else if (caType.includes("PROXY VOTING")) {
            categorized.proxyVotings.push(item);
          } else if (caType.includes("REDEMPTION")) {
            categorized.redemptions.push(item);
          } else if (caType.includes("MANDATORY CONVERSION")) {
            categorized.mandatoryConversions.push(item);
          } else if (caType.includes("VOLUNTARY CONVERSION")) {
            categorized.voluntaryConversions.push(item);
          } else {
            categorized.otherActions.push(item);
          }
        }

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
                  returnedCount: data.length,
                  totalMatches: total,
                  data: categorized,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "error",
                  code: code || "ALL",
                  message:
                    error?.message ||
                    "Terjadi kesalahan saat memproses data aksi korporasi.",
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
      const { getEmitenBySector } = await import("../services/stockService");

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
