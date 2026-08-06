// src/tools/bandarmologyTools.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTodayWibString } from "../utils/date/getTodayWibString";

export function registerBandarmologyTools(mcpServer: McpServer) {
  // --- Broker Summary (Bandarmology via Stockbit) ---
  mcpServer.registerTool(
    "get_broker_summary",
    {
      description:
        "Mengambil data Broker Summary (Bandarmology / Net Buy & Net Sell Broker) emiten BEI/IDX dari Stockbit.",
      inputSchema: {
        code: z
          .string()
          .transform((v) => v.trim().toUpperCase())
          .describe("Kode ticker saham BEI/IDX, misal: BBCA, AMRT, TLKM"),
        startDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
          .optional()
          .describe(
            "Tanggal awal analisis (Format: YYYY-MM-DD). Default 1 hari bursa terakhir.",
          ),
        endDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
          .optional()
          .describe(
            "Tanggal akhir analisis (Format: YYYY-MM-DD). Default mengikuti startDate.",
          ),
      },
    },
    async ({ code, startDate, endDate }) => {
      const { getBroxsum } =
        await import("../services/stockbitServices/fetchBroxSum");

      const defaultDate = getTodayWibString();
      const effectiveStartDate = startDate || endDate || defaultDate;
      const effectiveEndDate = endDate || startDate || defaultDate;

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
                    code,
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
                  code,
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
        "Mengambil data histori transaksi investor asing (Net Foreign Buy/Sell dalam Rupiah & Volume) dari BEI.",
      inputSchema: {
        code: z
          .string()
          .transform((v) => v.trim().toUpperCase())
          .describe("Kode ticker saham BEI/IDX, misal: BBCA, AMRT, TLKM"),
        startDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
          .optional()
          .describe(
            "Tanggal awal analisis (Format: YYYY-MM-DD). Default 1 hari bursa terakhir.",
          ),
        endDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
          .optional()
          .describe(
            "Tanggal akhir analisis (Format: YYYY-MM-DD). Default mengikuti startDate.",
          ),
      },
    },
    async ({ code, startDate, endDate }) => {
      const { getForeignFlow } =
        await import("../services/idxServices/foreignFlow");
      const { getWeekdaysInRangeCompact } =
        await import("../utils/date/getWeeksDay");

      const defaultDate = getTodayWibString();
      const effectiveStartDate = startDate || endDate || defaultDate;
      const effectiveEndDate = endDate || startDate || defaultDate;

      try {
        let dates = getWeekdaysInRangeCompact(
          effectiveStartDate,
          effectiveEndDate,
        );

        if (dates.length === 0) {
          dates = [defaultDate];
        }

        const result = await getForeignFlow({ code, dates });

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
                  code,
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
}
