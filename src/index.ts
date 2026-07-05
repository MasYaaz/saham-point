// src/index.ts
import readline from "readline";
import { initBackgroundWorker } from "./scrapper/worker";
import { fundamentalSyncState } from "./cli/sync-data";
import { handleCommand } from "./cli/command";
import app from "./server";
import db from "./db";
import { PORT } from "./config"; // Menggunakan konfigurasi terpusat

initBackgroundWorker();

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const BG_GREEN = "\x1b[42m\x1b[30m";
const BG_RED = "\x1b[41m\x1b[37m";

// 1. Sinkronisasi cache emiten dari DB di awal runtime
let emitenCache: string[] = [];
try {
  const rows = db.query("SELECT code FROM emiten").all() as { code: string }[];
  emitenCache = rows.map((r) => r.code.toUpperCase());
} catch (e) {
  emitenCache = []; // Fallback aman jika tabel belum ready
}

const baseCommands = [
  "sync",
  "detail",
  "list",
  "endpoints",
  "api",
  "clear",
  "exit",
];

function stripANSI(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function padLine(leftText: string, targetWidth: number): string {
  const visibleLength = stripANSI(leftText).length;
  const paddingNeeded = Math.max(0, targetWidth - visibleLength);
  return leftText + " ".repeat(paddingNeeded);
}

function renderTUI() {
  process.stdout.write("\x1b[2J\x1b[0;0H");
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

  const fundStatus = fundamentalSyncState.isActive
    ? `${BG_GREEN}${BOLD} ACTIVE ⚡ ${RESET}`
    : `${BG_RED}${BOLD} STANDBY 💤 ${RESET}`;
  const BOX_WIDTH = 117;
  const COLUMN_WIDTH_LEFT = 54;
  const COLUMN_WIDTH_RIGHT = 62;

  console.log(
    ` ${GRAY}╭────────────────────────────────────────────── Saham Point Core v1.0.0 ──────────────────────────────────────────────╮${RESET}`,
  );
  const b1_left = padLine(
    ` ${BOLD}Core Status Indicators${RESET}`,
    COLUMN_WIDTH_LEFT,
  );
  const b1_right = padLine(
    ` ${BOLD}Engine Terminal Control Hub${RESET}`,
    COLUMN_WIDTH_RIGHT,
  );
  console.log(
    ` ${GRAY}│${RESET}${b1_left}${GRAY}│${RESET}${b1_right}${GRAY}│${RESET}`,
  );

  const b2_left = padLine(
    ` ➜ Engine Server : ${BG_GREEN}${BOLD} ONLINE ${RESET}`,
    COLUMN_WIDTH_LEFT,
  );
  const b2_right = padLine(
    ` sync        ➜ Menyalakan / Menjeda Siklus Antrean`,
    COLUMN_WIDTH_RIGHT,
  );
  console.log(
    ` ${GRAY}│${RESET}${b2_left}${GRAY}│${RESET}${b2_right}${GRAY}│${RESET}`,
  );

  const b3_left = padLine(
    ` ➜ Sakelar Sync  : ${fundStatus}`,
    COLUMN_WIDTH_LEFT,
  );
  const b3_right = padLine(
    ` list        ➜ Lihat Semua Emiten Terdaftar di DB`,
    COLUMN_WIDTH_RIGHT,
  );
  console.log(
    ` ${GRAY}│${RESET}${b3_left}${GRAY}│${RESET}${b3_right}${GRAY}│${RESET}`,
  );

  const b4_left = padLine(
    ` ➜ Active Worker : ${GREEN}Price Aggregator Active 🟢${RESET}`,
    COLUMN_WIDTH_LEFT,
  );
  const b4_right = padLine(
    ` detail <cmd>➜ Contoh: 'detail BBRI' untuk bedah emiten`,
    COLUMN_WIDTH_RIGHT,
  );
  console.log(
    ` ${GRAY}│${RESET}${b4_left}${GRAY}│${RESET}${b4_right}${GRAY}│${RESET}`,
  );

  const b4_sub_left = padLine(``, COLUMN_WIDTH_LEFT);
  const b4_sub_right = padLine(
    ` clear / exit➜ Bersihkan konsol / Matikan total core`,
    COLUMN_WIDTH_RIGHT,
  );
  console.log(
    ` ${GRAY}│${RESET}${b4_sub_left}${GRAY}│${RESET}${b4_sub_right}${GRAY}│${RESET}`,
  );

  console.log(
    ` ${GRAY}├──────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────────┤${RESET}`,
  );
  const b5 = padLine(` ${BOLD}Live Network Endpoint Links${RESET}`, BOX_WIDTH);
  console.log(` ${GRAY}│${RESET}${b5}${GRAY}│${RESET}`);
  const b6 = padLine(
    ` ➜ Local API Gateway URL : ${CYAN}http://localhost:${PORT}${RESET}`,
    BOX_WIDTH,
  );
  console.log(` ${GRAY}│${RESET}${b6}${GRAY}│${RESET}`);
  const b7 = padLine(
    ` ➜ Core Health Check     : ${CYAN}http://localhost:${PORT}/api/health${RESET}`,
    BOX_WIDTH,
  );
  console.log(` ${GRAY}│${RESET}${b7}${GRAY}│${RESET}`);
  const b_empty = padLine(``, BOX_WIDTH);
  console.log(` ${GRAY}│${RESET}${b_empty}${GRAY}│${RESET}`);
  const b8 = padLine(
    ` ${GRAY}System runtime locked on Bun Engine (Asia/Jakarta). Ketik perintah di bawah ini untuk berinteraksi...${RESET}`,
    BOX_WIDTH,
  );
  console.log(` ${GRAY}│${RESET}${b8}${GRAY}│${RESET}`);
  console.log(
    ` ${GRAY}╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯${RESET}\n`,
  );
}

// Inisialisasi Readline Interface Standar tanpa completer lama
export const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `\x1b[32m${BOLD}saham-point ➜ ${RESET}`,
});

setTimeout(() => {
  renderTUI();
  rl.prompt();
}, 50);

// State internal penyimpan ghost text aktif
let currentSuggestion = "";

// 2. GHOST TEXT ENGINE: Mengintip ketikan stream terminal secara real-time
process.stdin.on("keypress", (str, key) => {
  // Ambil teks ketikan saat ini dari internal state readline
  const currentInput = rl.line;

  // 1. JIKA USER MENEKAN PANAH KANAN (→) ATAU TAB DAN ADA SUGGESTION -> TEMPELKAN GHOST TEXT secara bersih
  if (currentSuggestion && (key.name === "right" || key.name === "tab")) {
    const remainingText = currentSuggestion.slice(currentInput.length);
    if (remainingText.length > 0) {
      // Tulis sisa teks hantu ke dalam readline secara resmi tanpa merusak prompt di kirinya
      rl.write(remainingText);
    }
    currentSuggestion = "";
    return;
  }

  // Ambil posisi kursor saat ini untuk penanganan render yang presisi
  const cursorIdx = rl.cursor;

  // Analisis input untuk mencari kecocokan data
  const trimmed = currentInput.trimStart();
  if (!trimmed) {
    // Jika input kosong (atau isinya cuma spasi), bersihkan sisa ghost text lawas di kanan kursor
    process.stdout.write("\x1b[K");
    currentSuggestion = "";
    return;
  }

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0] ? parts[0].toLowerCase() : "";
  const arg = parts[1] ? parts[1].toUpperCase() : "";

  let match = "";

  // Skenario A: Masih mengetik perintah utama dasar (belum ada spasi atau baru ketik perintah awal)
  if (parts.length === 1 && !currentInput.endsWith(" ")) {
    const found = baseCommands.find((c) => c.startsWith(cmd));
    if (found && found !== cmd) match = found;
  }
  // Skenario B: Mengetik argumen sesudah kata "detail "
  else if (cmd === "detail") {
    const foundEmiten = emitenCache.find((code) => code.startsWith(arg));
    if (foundEmiten) {
      match = `detail ${foundEmiten}`;
    }
  }

  // 2. JIKA ADA COCOK DAN KURSOR BERADA DI AKHIR TEKS, TAMPILKAN GHOST TEXT
  if (
    match &&
    match.startsWith(currentInput) &&
    cursorIdx === currentInput.length
  ) {
    currentSuggestion = match;
    const ghostText = match.slice(currentInput.length);

    // \x1b[K membersihkan karakter sampah di kanan kursor sebelum menggambar ghost text baru
    process.stdout.write(
      `\x1b[K${GRAY}${ghostText}\x1b[${ghostText.length}D${RESET}`,
    );
  } else {
    // Jika tidak ada kecocokan atau user memindahkan kursor ke tengah-tengah kata, hapus sisa ghost text
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
