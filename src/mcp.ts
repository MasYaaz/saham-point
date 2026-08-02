#!/usr/bin/env bun
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION } from "./config";
import { registerCoreTools } from "./mcp/coreTools";
import { registerBandarmologyTools } from "./mcp/bandarmologyTools";
import { registerScreenerTools } from "./mcp/screenerTools";
import { safeLog } from "./utils/safeLog";
import { registerStockTools } from "./mcp/stockTools";

/* ============================================================================
 * ENVIRONMENT INITIALIZATION (Native Bun - Zero Dependency)
 * Membaca .env berdasarkan lokasi file index.ts menggunakan Bun.file
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
  registerBandarmologyTools(mcpServer);
  registerScreenerTools(mcpServer);

  return mcpServer;
}

/* ============================================================================
 * HELPER UNTUK TAMPILAN CLI TUI
 * ============================================================================ */

export function getMcpToolsList(): Array<{
  name: string;
  description: string;
}> {
  const mcpServer = createMcpServer();
  const registeredTools =
    (mcpServer as any)._registeredTools || (mcpServer as any)._tools || {};

  return Object.entries(registeredTools).map(([name, tool]: [string, any]) => ({
    name,
    description: tool.description ?? "Tidak ada deskripsi",
  }));
}

/* ============================================================================
 * EXECUTION ENGINE & RUNTIME SERVING
 * ============================================================================ */

async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  // Handshake MCP diselesaikan secara murni (Super Cepat!)
  await server.connect(transport);
  console.error(`[MCP] Saham Point MCP Server v${VERSION} running on stdio`);

  // Jalankan worker di thread/CPU core terpisah secara multithreading
  setTimeout(() => {
    try {
      const workerUrl = new URL("./worker.ts", import.meta.url);
      const worker = new Worker(workerUrl);

      worker.onerror = (err) => {
        safeLog("error", `[Worker Thread Error] ${err}`);
      };
    } catch (err) {
      safeLog("error", `[MCP Worker] Gagal memicu worker thread: ${err}`);
    }
  }, 0);
}

if (
  import.meta.main ||
  process.argv[1]?.includes("index") ||
  process.argv[1]?.includes("mcp")
) {
  startMcpServer().catch((error) => {
    console.error("[MCP] Fatal Error starting server:", error);
    process.exit(1);
  });
}
