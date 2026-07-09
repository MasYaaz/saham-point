import { CYAN, RESET } from "./component/TUITheme";
import { handleSync } from "./handler/handleSync";
import { handleShowEmiten } from "./handler/handleShowEmiten";
import { handleDetailEmiten } from "./handler/handleDetailEmiten";
import { handleShowEndpoints } from "./handler/handleShowEndpoints";
import { readlineHead } from "./component/readlineInterface";

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

    case "show endpoints":
      handleShowEndpoints();
      break;

    case "clear":
      TUIHead();
      break;

    case "exit":
      console.log("\n👋 Mematikan core engine Saham Point...");
      process.exit(0);

    default:
      console.log(
        `❌ Perintah tidak dikenal: '${line.trim()}'. Ketik 'sync', 'show endpoints', 'show emiten', 'detail <KODE>', 'clear', atau 'exit'.\n`,
      );
      break;
  }

  // Setelah blok perintah selesai di-print, lempar kembali prompt ke baris paling bawah
  readlineHead.prompt();
}
