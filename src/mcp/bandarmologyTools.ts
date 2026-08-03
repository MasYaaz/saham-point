// src/tools/bandarmologyTools.ts
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

export function registerBandarmologyTools(mcpServer: McpServer) {
  // --- Broker Summary (Bandarmology via Stockbit) ---
  mcpServer.registerTool(
    "get_broker_summary",
    {
      description:
        "Mengambil data Broker Summary (Bandarmology / Net Buy & Net Sell Broker) emiten BEI/IDX dari Stockbit untuk 1 hari bursa atau rentang tanggal tertentu.",
      inputSchema: {
        code: z
          .string()
          .describe("Kode ticker saham BEI/IDX, misal: BBCA, AMRT, TLKM"),
        startDate: z
          .string()
          .optional()
          .describe(
            "Tanggal awal rentang analisis (Format: YYYY-MM-DD). Opsional, jika kosong default 1 hari bursa terakhir.",
          ),
        endDate: z
          .string()
          .optional()
          .describe(
            "Tanggal akhir rentang analisis (Format: YYYY-MM-DD). Opsional, jika kosong default mengikuti startDate.",
          ),
      },
    },
    async ({ code, startDate, endDate }) => {
      const { getBroxsum } =
        await import("../services/stockbitServices/fetchBroxSum");

      // Menentukan tanggal default (1 Hari Bursa Terakhir)
      const now = new Date();

      // Fallback: Jika tanggal tidak diisi dan hari ini akhir pekan, mundur ke Jumat
      if (!startDate && !endDate) {
        while (now.getDay() === 0 || now.getDay() === 6) {
          now.setDate(now.getDate() - 1);
        }
      }

      const [todayStr = ""] = now.toISOString().split("T");
      const effectiveStartDate = startDate || endDate || todayStr;
      const effectiveEndDate = endDate || startDate || todayStr;

      try {
        const result = await getBroxsum({
          ticker: code,
          fromDate: effectiveStartDate,
          toDate: effectiveEndDate,
        });

        if (
          !result ||
          (result.netBuyBrokers.length === 0 &&
            result.netSellBrokers.length === 0)
        ) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "empty",
                    code: code.toUpperCase(),
                    message: `Tidak ada data broker summary ditemukan untuk ${code} pada periode ${effectiveStartDate} s/d ${effectiveEndDate}`,
                    data: null,
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
                  status: "success",
                  code: result.ticker,
                  range: {
                    fromDate: result.fromDate,
                    toDate: result.toDate,
                  },
                  bandarDetector: result.bandarDetector,
                  topAccumulationRatio: result.topAccumulationRatio,
                  netBuyBrokers: result.netBuyBrokers,
                  netSellBrokers: result.netSellBrokers,
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
                  code: code.toUpperCase(),
                  message:
                    error?.message ||
                    "Gagal mengambil data broker summary dari Stockbit.",
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

  // --- Foreign Flow (Arus Kas Asing) ---
  mcpServer.registerTool(
    "get_foreign_flow",
    {
      description:
        "Mengambil data histori transaksi investor asing (Net Foreign Buy/Sell dalam Rupiah & Volume) untuk saham BEI/IDX pada 1 hari bursa (default) atau rentang tanggal tertentu.",
      inputSchema: {
        code: z
          .string()
          .describe("Kode ticker saham BEI/IDX, misal: BBCA, AMRT, TLKM"),
        startDate: z
          .string()
          .optional()
          .describe(
            "Tanggal awal rentang analisis (Format: YYYY-MM-DD). Opsional, jika kosong default 1 hari bursa terakhir.",
          ),
        endDate: z
          .string()
          .optional()
          .describe(
            "Tanggal akhir rentang analisis (Format: YYYY-MM-DD). Opsional, jika kosong default mengikuti startDate.",
          ),
      },
    },
    async ({ code, startDate, endDate }) => {
      const { getForeignFlow } =
        await import("../services/idxServices/foreignFlow");
      const { getWeekdaysInRange } = await import("../utils/mcp/getWeeksDay");

      const now = new Date();
      const [todayStr = ""] = now.toISOString().split("T");

      const effectiveStartDate = startDate || endDate || todayStr;
      const effectiveEndDate = endDate || startDate || todayStr;

      try {
        let dates = getWeekdaysInRange(effectiveStartDate, effectiveEndDate);

        if (dates.length === 0 && !startDate && !endDate) {
          while (now.getDay() === 0 || now.getDay() === 6) {
            now.setDate(now.getDate() - 1);
          }
          const [fallbackStr = todayStr] = now.toISOString().split("T");
          dates = getWeekdaysInRange(fallbackStr, fallbackStr);
        }

        if (dates.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    code: code.toUpperCase(),
                    periodDays: 0,
                    message:
                      "Rentang tanggal tidak valid atau tidak memuat hari bursa (Senin-Jumat).",
                    data: null,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const result = await getForeignFlow({
          code,
          dates,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "success",
                  code: result.code,
                  periodDays: result.periodDays,
                  range: {
                    startDate: effectiveStartDate,
                    endDate: effectiveEndDate,
                  },
                  cumulativeNetForeignValue: result.cumulativeNetForeignValue,
                  cumulativeNetForeignVolume: result.cumulativeNetForeignVolume,
                  dailyFlows: result.dailyFlows,
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
                  code: code.toUpperCase(),
                  message:
                    error?.message ||
                    "Gagal mengambil data foreign flow dari BEI.",
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

  // --- Kalender Aksi Korporasi ---
  mcpServer.registerTool(
    "get_corporate_actions",
    {
      description:
        "Mengambil agenda & riwayat aksi korporasi emiten (Dividen, Stock Split, Rights Issue/HMETD, RUPS, dan Saham Bonus).",
      inputSchema: {
        code: z
          .string()
          .describe("Kode ticker saham BEI/IDX, misal: BBRI, ASII, UNVR"),
      },
    },
    async ({ code }) => {
      const { getCorporateActions } =
        await import("../services/idxServices/corporateAction");

      try {
        const result = await getCorporateActions(code);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "success",
                  code: result.code,
                  totalActions: result.totalActions,
                  dividends: result.dividends,
                  stockSplits: result.stockSplits,
                  rightsIssues: result.rightsIssues,
                  rups: result.rups,
                  otherActions: result.otherActions,
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
                  code: code.toUpperCase(),
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
        "Mengambil ringkasan performa pasar saham terkini: Pergerakan Indeks Utama (IHSG, LQ45) serta daftar Top Gainers, Top Losers, dan Most Active (Volume/Value).",
      inputSchema: {
        date: z
          .string()
          .optional()
          .describe(
            "Tanggal data pasar (Format: YYYY-MM-DD). Opsional, jika kosong default hari bursa terbaru.",
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
      description: `Mengambil daftar emiten berdasarkan nama sektor industri (diurutkan dari market cap terbesar).\nSektor yang tersedia: ${AVAILABLE_SECTORS.join(", ")}`,
      inputSchema: {
        name: z
          .enum(AVAILABLE_SECTORS)
          .describe("Pilih salah satu nama sektor industri IDX yang valid"),
      },
    },
    async ({ name }) => {
      const { getEmitenBySector } = await import("../services/sektorService");
      const result = getEmitenBySector(name);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
