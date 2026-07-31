#!/usr/bin/env bun
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION } from "./config";
import { registerCoreTools } from "./mcp/coreTools";
import { registerBandarmologyTools } from "./mcp/bandarmologyTools";
import { registerScreenerTools } from "./mcp/screenerTools";

/* ============================================================================
 * ENVIRONMENT INITIALIZATION (Native Bun - Zero Dependency)
 * Membaca .env berdasarkan lokasi file index.ts menggunakan Bun.file
 * ============================================================================ */

async function initEnv() {
  // Sesuaikan lokasi .env (misal jika index.ts ada di /src, mundur 1 folder ke root)
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
