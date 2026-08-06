import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerCoreTools(mcpServer: McpServer) {
  // --- Manajemen Sinkronisasi Background ---
  mcpServer.registerTool(
    "manage_stock_histories_sync",
    {
      description:
        "Mengontrol runner sinkronisasi data histori emiten di background (start, pause, status, atau reset).",
      inputSchema: {
        action: z
          .enum(["start", "pause", "status", "reset"])
          .describe(
            "Aksi kontrol: 'start' (mulai), 'pause' (jeda), 'status' (cek progress), 'reset' (reset agar bisa sync ulang)",
          ),
        code: z
          .string()
          .optional()
          .describe(
            "Khusus aksi 'reset': Kode emiten spesifik (misal: 'BBCA'). Kosongkan untuk mereset SELURUH emiten.",
          ),
      },
    },
    async ({ action, code }) => {
      const { stockHistoriesSyncState, syncStockHistories } =
        await import("../services/syncStockService/syncStockHistories");

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

        if (code) {
          const cleanCode = code.trim().toUpperCase();
          db.query(
            "UPDATE emiten SET is_fundamental_complete = 0 WHERE ticker = ?",
          ).run(cleanCode);

          return {
            content: [
              {
                type: "text",
                text: `[SUCCESS] Status stock histories emiten '${cleanCode}' berhasil direset ke 0. Siap untuk di-sync ulang.`,
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

  // --- Manajemen Sinkronisasi Background Dividen ---
  mcpServer.registerTool(
    "manage_dividend_histories_sync",
    {
      description:
        "Mengontrol runner sinkronisasi data riwayat dividen per event dari TradingView di background (start, pause, status, atau reset).",
      inputSchema: {
        action: z
          .enum(["start", "pause", "status", "reset"])
          .describe(
            "Aksi kontrol: 'start' (mulai), 'pause' (jeda), 'status' (cek progress), 'reset' (reset agar bisa sync ulang)",
          ),
        code: z
          .string()
          .optional()
          .describe(
            "Khusus aksi 'reset': Kode emiten spesifik (misal: 'BBCA'). Kosongkan untuk mereset SELURUH emiten.",
          ),
      },
    },
    async ({ action, code }) => {
      const { dividendHistoriesSyncState, syncDividendHistories } =
        await import("../services/syncStockService/syncDividendHistories");

      if (action === "start") {
        if (dividendHistoriesSyncState.isActive) {
          return {
            content: [
              {
                type: "text",
                text: "[INFO] Sinkronisasi dividend histories sudah berjalan di background.",
              },
            ],
          };
        }

        // Jalankan runner secara asynchronous (non-blocking)
        syncDividendHistories();

        return {
          content: [
            {
              type: "text",
              text: "[SUCCESS] Proses sinkronisasi data dividend histories berhasil dimulai di background.",
            },
          ],
        };
      }

      if (action === "pause") {
        if (!dividendHistoriesSyncState.isActive) {
          return {
            content: [
              {
                type: "text",
                text: "[INFO] Sinkronisasi dividend histories saat ini sedang tidak aktif.",
              },
            ],
          };
        }

        dividendHistoriesSyncState.isActive = false;
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

        if (code) {
          const cleanCode = code.trim().toUpperCase();
          db.query(
            "UPDATE emiten SET is_dividend_complete = 0 WHERE code = ?",
          ).run(cleanCode);

          return {
            content: [
              {
                type: "text",
                text: `[SUCCESS] Status dividend histories emiten '${cleanCode}' berhasil direset ke 0. Siap untuk di-sync ulang.`,
              },
            ],
          };
        }

        // Reset seluruh emiten jika code tidak diisi
        db.query("UPDATE emiten SET is_dividend_complete = 0").run();

        return {
          content: [
            {
              type: "text",
              text: "[SUCCESS] Seluruh status dividend histories emiten berhasil direset ke 0. Siap untuk di-sync ulang dari awal.",
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
              "SELECT COUNT(*) as count FROM emiten WHERE is_dividend_complete = 0",
            )
            .get() as { count: number }
        )?.count ?? 0;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                is_active: dividendHistoriesSyncState.isActive,
                unprocessed_emiten_count: queueCount,
                status: dividendHistoriesSyncState.isActive
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
        "Mengelola log sistem Saham Point (membaca isi log, melihat daftar file log, atau membersihkan log lama).",
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
