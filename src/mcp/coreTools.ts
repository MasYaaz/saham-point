import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerCoreTools(mcpServer: McpServer) {
  // --- Trigger Sinkronisasi Background ---
  mcpServer.registerTool(
    "trigger_fundamental_sync",
    {
      description:
        "Memulai, menjeda, atau mengecek status sinkronisasi data fundamental emiten di background runner.",
      inputSchema: {
        action: z
          .enum(["start", "pause", "status"])
          .describe(
            "Aksi sinkronisasi: 'start' untuk mulai, 'pause' untuk menjeda, 'status' untuk mengecek progress",
          ),
      },
    },
    async ({ action }) => {
      const { stockHistoriesSyncState, syncStockHistories } =
        await import("../services/scraperService/syncStockHistories");

      if (action === "start") {
        if (stockHistoriesSyncState.isActive) {
          return {
            content: [
              {
                type: "text",
                text: "[INFO] Sinkronisasi sudah berjalan di background.",
              },
            ],
          };
        }

        // Jalankan runner secara asynchronous (non-blocking)
        syncStockHistories();

        return {
          content: [
            {
              type: "text",
              text: "[SUCCESS] Proses sinkronisasi data fundamental berhasil dimulai di background.",
            },
          ],
        };
      }

      if (action === "pause") {
        if (!stockHistoriesSyncState.isActive) {
          return {
            content: [
              {
                type: "text",
                text: "[INFO] Sinkronisasi saat ini sedang tidak aktif.",
              },
            ],
          };
        }

        stockHistoriesSyncState.isActive = false;
        return {
          content: [
            {
              type: "text",
              text: "[INFO] Sinyal jeda dikirim. Proses akan berhenti setelah emiten yang sedang berjalan selesai.",
            },
          ],
        };
      }

      // Action: 'status'
      const db = (await import("../db")).default;
      const queueCount =
        (
          db
            .query(
              "SELECT COUNT(*) as count FROM emiten WHERE is_fundamental_complete = 0",
            )
            .get() as { count: number }
        )?.count ?? 0;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                is_active: stockHistoriesSyncState.isActive,
                unprocessed_emiten_count: queueCount,
                status: stockHistoriesSyncState.isActive
                  ? "Sedang berjalan"
                  : "Idle / Tertunda",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // --- Manajemen Log Sistem ---
  mcpServer.registerTool(
    "manage_system_logs",
    {
      description:
        "Membaca, mendaftar file log, atau membersihkan log sistem Saham Point.",
      inputSchema: {
        action: z
          .enum(["show", "list", "clean"])
          .describe(
            "Aksi log: 'show' untuk baca log, 'list' untuk daftar file log, 'clean' untuk bersihkan log lama",
          ),
        target: z
          .string()
          .optional()
          .default("today")
          .describe(
            "Target tanggal untuk 'show' ('today', 'all', atau 'YYYY-MM-DD'). Atau batas hari simpan untuk 'clean' (default: '7')",
          ),
        lines: z
          .number()
          .optional()
          .default(20)
          .describe("Jumlah baris log yang ditampilkan (default: 20)"),
      },
    },
    async ({ action, target, lines }) => {
      const { getLogs, listLogFiles, cleanLogs } =
        await import("../services/systemServices/logsService");

      if (action === "list") {
        const result = listLogFiles();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      if (action === "clean") {
        // Jika target bernilai default 'today', ubah ke '7' hari untuk pembersihan log
        const cleanTarget = target === "today" ? "7" : target;
        const result = cleanLogs(cleanTarget);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Action: 'show'
      const result = getLogs(target, lines);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}
