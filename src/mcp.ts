#!/usr/bin/env bun
import path from "node:path";
import { type ChildProcess, spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION } from "./config";
import { registerBandarmologyTools } from "./mcp/bandarmologyTools";
import { registerCoreTools } from "./mcp/coreTools";
import { registerScreenerTools } from "./mcp/screenerTools";
import { registerStockTools } from "./mcp/stockTools";
import { log } from "./utils/log";
import { registerMarketTools } from "./mcp/marketTools";
import { registerAnalyzerTools } from "./mcp/analyzerTools";

/* ============================================================================
 * ENVIRONMENT INITIALIZATION (Native Bun Engine)
 * ============================================================================ */

async function initEnv(): Promise<void> {
  const envPath = path.resolve(import.meta.dir, "../.env");
  const file = Bun.file(envPath);

  if (await file.exists()) {
    const text = await file.text();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...values] = trimmed.split("=");
        const val = values
          .join("=")
          .replace(/^["']|["']$/g, "")
          .trim();
        const envKey = key ? key.trim() : "";
        if (envKey && !process.env[envKey]) {
          process.env[envKey] = val;
        }
      }
    }
  }
}

await initEnv();

/* ============================================================================
 * MCP SERVER FACTORY ENGINE
 * ============================================================================ */

export function createMcpServer(): McpServer {
  const mcpServer = new McpServer({
    name: "saham-point-mcp",
    version: VERSION,
  });

  registerCoreTools(mcpServer);
  registerStockTools(mcpServer);
  registerMarketTools(mcpServer);
  registerBandarmologyTools(mcpServer);
  registerScreenerTools(mcpServer);
  registerAnalyzerTools(mcpServer);

  return mcpServer;
}

/* ============================================================================
 * EXECUTION ENGINE & PROCESS LIFECYCLE MANAGEMENT
 * ============================================================================ */

let workerProcess: ChildProcess | null = null;

/**
 * Memastikan child process worker dibunuh saat proses utama MCP dihentikan.
 */
function cleanupWorker(): void {
  if (workerProcess && !workerProcess.killed) {
    try {
      workerProcess.kill("SIGTERM");
    } catch {
      // Ignore cleanup error jika proses sudah terlanjur mati
    }
    workerProcess = null;
  }
}

// Global process cleanup listener (Dipasang di luar alur async startup)
process.on("exit", cleanupWorker);
process.on("SIGINT", () => {
  cleanupWorker();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanupWorker();
  process.exit(0);
});

/**
 * Memulai server MCP via STDIO dan meluncurkan background worker.
 */
async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  // 1. Hubungkan Transport MCP terlebih dahulu (Instan ~150-200ms)
  await server.connect(transport);
  console.error(`[MCP] Saham Point MCP Server v${VERSION} running on stdio`);

  // 2. Inisialisasi background worker sebagai Child Process
  setTimeout(() => {
    try {
      const workerPath = path.resolve(import.meta.dir, "./worker");

      workerProcess = spawn("bun", ["run", workerPath], {
        stdio: "ignore", // Hindari pencemaran STDIO
      });

      // PENTING: .unref() memberitahu Event Loop agar TIDAK menunggu workerProcess ini.
      // Dengan ini, MCP Server bisa langsung membalas Handshake STDIO tanpa tertahan oleh cron.
      workerProcess.unref();

      workerProcess.on("error", (err) => {
        log("error", `[MCP Worker Process Error] ${err.message}`);
      });

      log("info", "[MCP Server] Background worker process berhasil dipicu.");
    } catch (err: any) {
      log(
        "error",
        `[MCP Worker] Gagal memicu worker process: ${err?.message || err}`,
      );
    }
  }, 0);
}

/* ============================================================================
 * APPLICATION ENTRYPOINT
 * ============================================================================ */

if (
  import.meta.main ||
  process.argv[1]?.includes("index") ||
  process.argv[1]?.includes("mcp")
) {
  startMcpServer().catch((error) => {
    console.error("[MCP] Fatal Error starting server:", error);
    cleanupWorker();
    process.exit(1);
  });
}
