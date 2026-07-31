#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { VERSION } from "./config";
import { registerCoreTools } from "./mcp/coreTools";
import { registerBandarmologyTools } from "./mcp/bandarmologyTools";
import { registerScreenerTools } from "./mcp/screenerTools";

/* ============================================================================
 * MCP SERVER FACTORY ENGINE
 * Catatan: Menggunakan Dynamic Import (Lazy Loading) di dalam handler tool
 * untuk menjamin startup time server tetap instan.
 * ============================================================================ */

export function createMcpServer() {
  const mcpServer = new McpServer({
    name: "saham-point-mcp",
    version: VERSION,
  });

  registerCoreTools(mcpServer);
  registerBandarmologyTools(mcpServer);
  registerScreenerTools(mcpServer);

  return mcpServer;
}

/* ============================================================================
 * HELPER UNTUK TAMPILAN CLI TUI
 * ============================================================================ */

/**
 * Mengembalikan daftar nama dan deskripsi dari seluruh tool yang terdaftar.
 */
export function getMcpToolsList() {
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

async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error(`[MCP] Saham Point MCP Server v${VERSION} running on stdio`);
}

// Menjalankan server jika berkas dipanggil sebagai entry point utama
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
