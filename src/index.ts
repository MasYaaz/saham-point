// src/index.ts
import readline from "readline";
import { initBackgroundWorker } from "./scrapper/worker";
import { fundamentalSyncState } from "./cli/sync-data";
import { handleCommand } from "./cli/command";
import app from "./server";
import db from "./db";
import { PORT, VERSION } from "./config"; // Menggunakan konfigurasi terpusat
import { BG_GREEN, BG_RED, BOLD, CYAN, GRAY, GREEN, RESET } from "./theme";
import { getMarketStatus } from "./utils/marketStatus";
import { TUI } from "./cli/tui-engine";

initBackgroundWorker();

// 1. Sinkronisasi cache emiten dari DB di awal runtime
let emitenCache: string[] = [];
try {
  const rows = db.query("SELECT code FROM emiten").all() as { code: string }[];
  emitenCache = rows.map((r) => r.code.toUpperCase());
} catch (e) {
  emitenCache = []; // Fallback aman jika tabel belum ready
}

const market = getMarketStatus();
const baseCommands = [
  "sync",
  "detail",
  "show emiten",
  "show endpoints",
  "clear",
  "exit",
];

function renderTUI() {
  process.stdout.write("\x1b[2J\x1b[0;0H");
  const BOX_WIDTH = 118;

  console.log(TUI.spacer());
  console.log(
    ` ${GREEN}███████╗ █████╗ ██╗  ██╗ █████╗ ███╗   ███╗    ██████╗  ██████╗ ██╗███╗   ██╗████████╗${RESET}`,
  );
  console.log(
    ` ${GREEN}██╔════╝██╔══██╗██║  ██║██╔══██╗████╗ ████║    ██╔══██╗██╔═══██╗██║████╗  ██║╚══██╔══╝${RESET}`,
  );
  console.log(
    ` ${GREEN}███████╗███████║███████║███████║██╔████╔██║    ██████╔╝██║   ██║██║██╔██╗ ██║   ██║   ${RESET}`,
  );
  console.log(
    ` ${GREEN}╚════██║██╔══██║██╔══██║██╔══██║██║╚██╔╝██║    ██╔═══╝ ██║   ██║██║██║╚██╗██║   ██║   ${RESET}`,
  );
  console.log(
    ` ${GREEN}███████║██║  ██║██║  ██║██║  ██║██║ ╚═╝ ██║    ██║     ╚██████╔╝██║██║ ╚████║   ██║   ${RESET}`,
  );
  console.log(
    ` ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝    ╚═╝      ╚═════╝ ╚═╝╚═╝  ╚═══╝   ╚═╝   `,
  );
  console.log(TUI.spacer());
  console.log(TUI.divider("top"));

  // 1. Header Bar
  console.log(
    TUI.row(
      ` ${BOLD}Core Status Indicators${RESET}`,
      ` ${BOLD}Engine Terminal Control Hub${RESET}`,
      54,
      63,
    ),
  );

  // 2. Data Rows (Tinggal kopas pola ini)
  const fundStatus = fundamentalSyncState.isActive
    ? `${BG_GREEN}${BOLD} ACTIVE ⚡ ${RESET}`
    : `${BG_RED}${BOLD} STANDBY 💤 ${RESET}`;

  console.log(
    TUI.row(
      ` ➜ Engine Server : ${BG_GREEN}${BOLD}   ONLINE   ${RESET}`,
      ` sync           ➜ Menyalakan / Menjeda Siklus Antrean`,
      54,
      63,
    ),
  );

  console.log(
    TUI.row(
      ` ➜ Sync Status   : ${fundStatus}`,
      ` show emiten    ➜ Lihat Semua Emiten Terdaftar di DB`,
      54,
      63,
    ),
  );

  console.log(
    TUI.row(
      ` ➜ Market Status : ${market.label}${RESET}`,
      ` show endpoints ➜ Lihat Semua Endpoints Terdaftar sistem`,
      55,
      63,
    ),
  );

  console.log(
    TUI.row(
      ` ➜ Version       : Bedah Saham ${VERSION}`,
      ` detail <cmd>   ➜ Contoh: 'detail BBRI' untuk bedah emiten`,
      54,
      63,
    ),
  );

  console.log(
    TUI.row(
      ``,
      ` clear | exit   ➜ Bersihkan konsol | Matikan total core`,
      54,
      63,
    ),
  );

  console.log(TUI.emptyRow(54, 63));

  // 3. Footer/Links
  console.log(TUI.divider("middle"));
  console.log(
    TUI.fullRow(` ${BOLD}Live Network Endpoint Links${RESET}`, BOX_WIDTH),
  );
  console.log(
    TUI.fullRow(
      ` ➜ Local API Gateway URL : ${CYAN}http://localhost:${PORT}${RESET}`,
      BOX_WIDTH,
    ),
  );
  console.log(
    TUI.fullRow(
      ` ➜ Core Health Check     : ${CYAN}http://localhost:${PORT}/api/health${RESET}`,
      BOX_WIDTH,
    ),
  );

  console.log(TUI.divider("bottom"));
  console.log(TUI.spacer());
}

// Inisialisasi Readline Interface Standar tanpa completer lama
export const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `\x1b[32m${BOLD} saham-point ➜ ${RESET}`,
});

setTimeout(() => {
  renderTUI();
  rl.prompt();
}, 50);

// Text Suggestion
let currentSuggestion = "";
process.stdin.on("keypress", (str, key) => {
  const currentInput = rl.line;
  const cursorIdx = rl.cursor;

  // 1. Handle Tab/Right Arrow (Sama seperti sebelumnya)
  if (currentSuggestion && (key.name === "right" || key.name === "tab")) {
    const remainingText = currentSuggestion.slice(currentInput.length);
    if (remainingText.length > 0) rl.write(remainingText);
    currentSuggestion = "";
    return;
  }

  const trimmed = currentInput.trimStart();
  if (!trimmed) {
    process.stdout.write("\x1b[K");
    currentSuggestion = "";
    return;
  }

  let match = "";

  // LOGIKA BARU: Cari kecocokan di baseCommands (support multi-word)
  const foundBase = baseCommands.find((c) => c.startsWith(trimmed));
  if (foundBase && foundBase !== trimmed) {
    match = foundBase;
  }
  // Skenario B: Tetap handle "detail <emiten>"
  else if (trimmed.startsWith("detail ")) {
    const parts = trimmed.split(/\s+/);
    const arg = parts[1] ? parts[1].toUpperCase() : "";
    const foundEmiten = emitenCache.find((code) => code.startsWith(arg));
    if (foundEmiten) {
      match = `detail ${foundEmiten}`;
    }
  }

  // 2. Tampilkan Ghost Text
  if (match && match.startsWith(trimmed) && cursorIdx === currentInput.length) {
    currentSuggestion = match;
    const ghostText = match.slice(trimmed.length);
    process.stdout.write(
      `\x1b[K${GRAY}${ghostText}\x1b[${ghostText.length}D${RESET}`,
    );
  } else {
    process.stdout.write("\x1b[K");
    currentSuggestion = "";
  }
});

// Handler utama saat tombol Enter ditekan
rl.on("line", async (line) => {
  currentSuggestion = ""; // Reset bayangan agar tidak merusak baris baru
  await handleCommand(line, renderTUI);
});

rl.on("SIGINT", () => {
  console.log("\n👋 Mematikan core engine Saham Point...");
  process.exit(0);
});

export default {
  port: Number(PORT),
  fetch: app.fetch,
  development: false,
};
