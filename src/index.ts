#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp";

async function main() {
  try {
    const mcpServer = createMcpServer();
    const transport = new StdioServerTransport();

    await mcpServer.connect(transport);

    // Menggunakan console.error agar log tidak mengotori channel JSON-RPC di stdout
    console.error("🚀 Saham Point MCP Server running via Stdio transport");
  } catch (error) {
    console.error("Fatal error starting MCP Stdio Server:", error);
    process.exit(1);
  }
}

main();
