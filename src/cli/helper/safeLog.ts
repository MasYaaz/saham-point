import { fundamentalSyncState } from "../helper/runSyncDataAll";

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
// 🚀 IMPLEMENTASI SAFELOG BARU (State-Driven)
// ==========================================================================
export function safeLog(type: "log" | "warn" | "error", message: string) {
  const colors = { log: "\x1b[37m", warn: "\x1b[33m", error: "\x1b[31m" };
  const RESET = "\x1b[0m";

  if (fundamentalSyncState.isActive) {
    // 🔍 TRIK KUNCI: Bedah pesan berdasarkan newline (\n) agar Stack Trace Playwright hancur menjadi baris tunggal
    const rawLines = message.split("\n");

    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (!line) continue; // Lewati jika ada baris kosong bawaan eror

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
    // Jika tidak sedang sync, cetak mentah seperti biasa
    console[type](message);
  }
}
