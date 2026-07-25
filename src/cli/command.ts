import { CYAN, RESET } from "./component/TUITheme";
import { handleSync } from "./handler/handleSync";
import { handleShowEmiten } from "./handler/handleShowEmiten";
import { handleDetailEmiten } from "./handler/handleDetailEmiten";
import { readlineHead } from "./component/readlineInterface";
import { tuiLogState } from "./helper/safeLog";
import { handleShowMcpTools } from "./handler/handleShowMCPTools";
import {
  handleCleanLogs,
  handleListLogs,
  handleShowLogs,
} from "./handler/handleLogs";

export async function handleCommand(
  line: string,
  TUIHead: () => void,
): Promise<void> {
  if (!line || !line.trim()) {
    readlineHead.prompt();
    return;
  }

  const parts = line.trim().split(/\s+/);
  // Pastikan parts[0] ada sebelum mengakses .toLowerCase()
  let command = (parts[0] || "").toLowerCase();

  // Gunakan Optional Chaining (?.) untuk mengecek parts[1] dengan aman
  if (command === "show" && parts[1]) {
    command = `show ${parts[1].toLowerCase()}`;
  }

  // Logika argumen yang lebih aman
  const isShowCommand = command.startsWith("show");
  const arg = !isShowCommand && parts[1] ? parts[1].toUpperCase() : "";

  switch (command) {
    case "sync":
      await handleSync(TUIHead);
      break;

    case "show emiten":
      await handleShowEmiten();
      break;

    case "detail":
      if (!arg) {
        console.log(
          `\n   ❌ Mohon masukkan kode saham. Contoh: ${CYAN}detail AMRT${RESET}\n`,
        );
        break;
      }
      await handleDetailEmiten(arg);
      break;

    case "show mcptools":
      handleShowMcpTools();
      break;

    case "logs": {
      const arg1 = (parts[1] || "").toLowerCase();
      const arg2 = parts[2] || "";

      if (arg1 === "list" || arg1 === "ls") {
        handleListLogs();
      } else if (arg1 === "clean" || arg1 === "clear") {
        handleCleanLogs(arg2 || "7");
      } else if (arg1 === "all") {
        // Contoh: 'logs all' atau 'logs all 50'
        const lines =
          !isNaN(Number(arg2)) && Number(arg2) > 0 ? Number(arg2) : 20;
        handleShowLogs("all", lines);
      } else if (!isNaN(Number(arg1)) && Number(arg1) > 0) {
        // Contoh: 'logs 50' (50 baris log hari ini)
        handleShowLogs("today", Number(arg1));
      } else if (arg1) {
        // Contoh: 'logs 2026-07-24' atau 'logs 2026-07-24 50'
        const lines =
          !isNaN(Number(arg2)) && Number(arg2) > 0 ? Number(arg2) : 20;
        handleShowLogs(arg1, lines);
      } else {
        // Contoh: 'logs' (default 20 baris log hari ini)
        handleShowLogs("today", 20);
      }
      break;
    }

    case "clear":
      tuiLogState.activeLogs = [];
      tuiLogState.lastLogLinesCount = 0;
      TUIHead();
      break;

    case "exit":
      console.log("\n👋 Mematikan core engine Saham Point...");
      process.exit(0);

    default:
      console.log(
        `❌ Perintah tidak dikenal: '${line.trim()}'. Ketik 'sync', 'show mcptools', 'show emiten', 'detail <KODE>', 'clear', atau 'exit'.\n`,
      );
      break;
  }

  // Setelah blok perintah selesai di-print, lempar kembali prompt ke baris paling bawah
  readlineHead.prompt();
}
