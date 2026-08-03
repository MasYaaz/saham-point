import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerCoreTools(mcpServer: McpServer) {
  // --- Manajemen Sinkronisasi Background ---
  mcpServer.registerTool(
    "manage_stock_histories_sync",
    {
      description:
        "Pusat kendali untuk mengelola sinkronisasi data riwayat saham (stock histories) emiten di background runner (mulai, jeda, cek status progress, atau reset status).",
      inputSchema: {
        action: z
          .enum(["start", "pause", "status", "reset"])
          .describe(
            "Aksi kontrol: 'start' (mulai), 'pause' (jeda), 'status' (cek progress), 'reset' (reset agar bisa sync ulang)",
          ),
        ticker: z
          .string()
          .optional()
          .describe(
            "Khusus aksi 'reset': Kode emiten spesifik (misal: 'BBCA'). Kosongkan untuk mereset SELURUH emiten.",
          ),
      },
    },
    async ({ action, ticker }) => {
      const { stockHistoriesSyncState, syncStockHistories } =
        await import("../services/scraperService/syncStockHistories");

      if (action === "start") {
        if (stockHistoriesSyncState.isActive) {
          return {
            content: [
              {
                type: "text",
                text: "[INFO] Sinkronisasi stock histories sudah berjalan di background.",
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
              text: "[SUCCESS] Proses sinkronisasi data stock histories berhasil dimulai di background.",
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
                text: "[INFO] Sinkronisasi stock histories saat ini sedang tidak aktif.",
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

      if (action === "reset") {
        const db = (await import("../db")).default;

        if (ticker) {
          const cleanTicker = ticker.trim().toUpperCase();
          db.query(
            "UPDATE emiten SET is_fundamental_complete = 0 WHERE ticker = ?",
          ).run(cleanTicker);

          return {
            content: [
              {
                type: "text",
                text: `[SUCCESS] Status stock histories emiten '${cleanTicker}' berhasil direset ke 0. Siap untuk di-sync ulang.`,
              },
            ],
          };
        }

        // Reset seluruh emiten jika ticker tidak diisi
        db.query("UPDATE emiten SET is_fundamental_complete = 0").run();

        return {
          content: [
            {
              type: "text",
              text: "[SUCCESS] Seluruh status stock histories emiten berhasil direset ke 0. Siap untuk di-sync ulang dari awal.",
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
        await import("../services/systemServices/logs");

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
