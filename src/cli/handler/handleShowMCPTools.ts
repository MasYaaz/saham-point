import { BOLD, CYAN, GRAY, RESET } from "../component/TUITheme";
import { padColumn } from "../component/TUITextFormat";
import { getMcpToolsList } from "../../mcp";

export function handleShowMcpTools() {
  try {
    // 1. Ambil list tools secara dinamis dari McpServer
    const tools = getMcpToolsList();

    console.log(
      `\n ${BOLD}🤖 DAFTAR LIVE MCP TOOLS (AGENTIC AI) - DYNAMICALLY DETECTED:${RESET}`,
    );

    // Atur lebar kolom box tabel
    const wName = 28,
      wDesc = 50;

    // Border Atas Box
    console.log(` ${GRAY}┌${"─".repeat(wName)}┬${"─".repeat(wDesc)}┐${RESET}`);
    console.log(
      ` ${GRAY}│${RESET}${padColumn(` ${BOLD}TOOL NAME${RESET}`, wName)}${GRAY}│${RESET}${padColumn(` ${BOLD}DESCRIPTION${RESET}`, wDesc)}${GRAY}│${RESET}`,
    );
    console.log(` ${GRAY}├${"─".repeat(wName)}┼${"─".repeat(wDesc)}┤${RESET}`);

    // 2. Loop daftar tools yang terdeteksi
    for (const tool of tools) {
      const formattedName = ` ${CYAN}${tool.name}${RESET}`;

      // Potong deskripsi jika terlalu panjang agar layout tabel tidak hancur
      const rawDesc = tool.description || "Tidak ada deskripsi";
      const cleanDesc =
        rawDesc.length > wDesc - 3
          ? rawDesc.substring(0, wDesc - 6) + "..."
          : rawDesc;

      const formattedDesc = ` ${cleanDesc}`;

      const cMethod = padColumn(formattedName, wName);
      const cUrl = padColumn(formattedDesc, wDesc);

      console.log(
        ` ${GRAY}│${RESET}${cMethod}${GRAY}│${RESET}${cUrl}${GRAY}│${RESET}`,
      );
    }

    // Border Bawah Box
    console.log(
      ` ${GRAY}╰${"─".repeat(wName)}┴${"─".repeat(wDesc)}┘${RESET}\n`,
    );
  } catch (err: any) {
    console.log(`❌ Gagal membaca MCP tools data: ${err.message}\n`);
  }
}
