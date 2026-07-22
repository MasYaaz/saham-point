import { fundamentalSyncState } from "../helper/runSyncDataAll";
import fs from "node:fs";
import path from "node:path";

// ==========================================================================
// 📦 STATE MANAGEMENT UTAMA UNTUK TUI LOG
// ==========================================================================
export const tuiLogState = {
  activeLogs: [] as string[], // Menampung string log yang sedang tayang
  lastLogLinesCount: 0, // Melacak jumlah baris log pada render sebelumnya
};

const MAX_VISIBLE_LOGS = 3; // 🛡️ PENGAMAN BERUNTUN: Maksimal log yang tampil barengan agar TUI gak jebol
const LOG_DURATION = 5000; // ⏱️ Durasi log tayang (5000ms = 5 detik)

// ==========================================================================
// 📝 FILE LOGGING (independen dari state TUI — selalu menulis, baik saat
// sync aktif maupun tidak). Sebelumnya safeLog hanya mencetak ke terminal:
// saat isActive true, baris log yang sudah tayang 5 detik langsung hilang
// dari memori (di-splice dari activeLogs) TANPA jejak apa pun, jadi kalau
// ada kegagalan di tengah proses yang lama (mis. scraping semalaman), tidak
// ada cara menelusuri riwayatnya setelah TUI tertutup/kena refresh.
// ==========================================================================

// Bisa dioverride lewat env var LOG_DIR kalau perlu diarahkan ke lokasi lain
// (mis. volume Docker yang persisten). Default: folder "logs" di root project.
const LOG_DIR = process.env.LOG_DIR
  ? path.resolve(process.env.LOG_DIR)
  : path.join(process.cwd(), "logs");

let logDirReady = false;

function ensureLogDir() {
  if (logDirReady) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    logDirReady = true;
  } catch (err: any) {
    // Kalau folder log saja gagal dibuat, jangan sampai bikin aplikasi crash —
    // cukup laporkan sekali ke stderr, sisanya biarkan tetap jalan tanpa file log.
    process.stderr.write(
      `[safeLog] Gagal membuat folder log "${LOG_DIR}": ${err?.message || err}\n`,
    );
  }
}

function getJakartaNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  );
}

/** Rotasi harian: satu file per tanggal (WIB), mis. sync-2026-07-14.log */
function getLogFilePath(): string {
  const now = getJakartaNow();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return path.join(LOG_DIR, `sync-${y}-${m}-${d}.log`);
}

// Regex untuk menghapus kode warna ANSI (\x1b[...m) agar isi file log bersih,
// tidak berisi karakter kontrol yang bikin susah dibaca/di-grep dari editor teks biasa.
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

/**
 * Menulis satu baris log ke file (sinkron, sengaja — volume log CLI ini
 * rendah, dan penulisan sinkron menjamin urutan baris di file selalu sesuai
 * urutan kejadian, tidak ada risiko interleaving antar write async).
 */
function appendToLogFile(type: "log" | "warn" | "error", line: string) {
  ensureLogDir();
  if (!logDirReady) return; // Folder gagal dibuat, sudah dilaporkan di ensureLogDir()

  try {
    const timestamp = getJakartaNow()
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);
    const cleanLine = line.replace(ANSI_PATTERN, "");
    const entry = `[${timestamp}] [${type.toUpperCase()}] ${cleanLine}\n`;
    fs.appendFileSync(getLogFilePath(), entry, "utf-8");
  } catch (err: any) {
    process.stderr.write(
      `[safeLog] Gagal menulis log ke file: ${err?.message || err}\n`,
    );
  }
}

// ==========================================================================
// 🚀 IMPLEMENTASI SAFELOG (State-Driven untuk TUI + selalu tercatat ke file)
// ==========================================================================
export function safeLog(type: "log" | "warn" | "error", message: string) {
  const colors = { log: "\x1b[37m", warn: "\x1b[33m", error: "\x1b[31m" };
  const RESET = "\x1b[0m";

  // 🔍 Bedah pesan berdasarkan newline (\n) agar Stack Trace Playwright hancur
  // menjadi baris tunggal — dilakukan di luar cabang isActive supaya file log
  // juga konsisten satu baris per entry, sama seperti tampilan TUI.
  const rawLines = message.split("\n");

  if (fundamentalSyncState.isActive) {
    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (!line) continue; // Lewati jika ada baris kosong bawaan eror

      // FIX: tulis ke file SELALU, terlepas dari apakah baris ini akan
      // ditampilkan di TUI atau nanti dibuang oleh MAX_VISIBLE_LOGS/anti-spam.
      // Anti-spam & batas tampilan di bawah ini murni aturan TAMPILAN TUI,
      // bukan aturan pencatatan — riwayat lengkap tetap harus masuk file.
      appendToLogFile(type, line);

      const formattedMsg = `${colors[type]}[${type.toUpperCase()}] ${line}${RESET}`;

      // Anti-Spam Beruntun: Jika baris eror ini sama persis dengan baris sebelumnya, skip!
      if (
        tuiLogState.activeLogs[tuiLogState.activeLogs.length - 1] ===
        formattedMsg
      )
        continue;

      // Spam Guard: Jika baris nyata di layar sudah penuh, buang baris paling atas (paling tua)
      if (tuiLogState.activeLogs.length >= MAX_VISIBLE_LOGS) {
        tuiLogState.activeLogs.shift();
      }

      // Masukkan baris bersih ke antrean render
      tuiLogState.activeLogs.push(formattedMsg);

      // Timer hapus otomatis per baris setelah 5 detik
      setTimeout(() => {
        const index = tuiLogState.activeLogs.indexOf(formattedMsg);
        if (index !== -1) {
          tuiLogState.activeLogs.splice(index, 1);
        }
      }, LOG_DURATION);
    }
  } else {
    // Jika tidak sedang sync, cetak mentah seperti biasa ke terminal...
    console[type](message);

    // dan tetap dicatat ke file, per baris, sama seperti cabang di atas.
    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (!line) continue;
      appendToLogFile(type, line);
    }
  }
}
