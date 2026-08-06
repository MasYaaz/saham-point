// src/tools/analyzerTools.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerAnalyzerTools(mcpServer: McpServer) {
  mcpServer.registerTool(
    "analyze_dividend",
    {
      description:
        "Menganalisis kinerja fundamental dividen emiten saham Indonesia (IDX). Mengembalikan metrik TTM Yield, Dividend Payout Ratio (DPR), pertumbuhan CAGR 3Y/5Y, Dividend Streak, serta analisis keamanan dividen (Safety Rating & Notes).",
      inputSchema: {
        code: z
          .string()
          .describe(
            "Kode emiten saham spesifik (contoh: 'BBCA', 'ADRO', 'AMRT').",
          ),
      },
    },
    async ({ code }) => {
      try {
        const { analyzeEmitenDividend } =
          await import("../services/analyzerService/DividendAnalyzer");

        const analysisResult = analyzeEmitenDividend(code);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(analysisResult, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        return {
          content: [
            {
              type: "text",
              text: `[ERROR] Gagal melakukan analisis dividen untuk emiten '${code}': ${errorMessage}`,
            },
          ],
        };
      }
    },
  );
}
