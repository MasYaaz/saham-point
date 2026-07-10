import readline from "readline";
import { fundamentalSyncState, runSyncDataAll } from "../helper/runSyncDataAll";
import { readlineHead } from "../component/readlineInterface";
import { renderGhostSuggestion } from "../helper/autoCompletion";
import { tuiLogState } from "../helper/safeLog";

let syncAnimationTimer: ReturnType<typeof setInterval> | null = null;
let syncSpinnerIndex = 0;
let syncStartTime = 0;
let syncLastState = { sudah: 0, total: 0, code: "-" };

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function clearProgressLine() {
  // Hitung total baris yang pernah digambar sebelumnya (Jumlah Log + 1 Baris Loading Bar)
  const linesToClear = tuiLogState.lastLogLinesCount + 1;

  if (linesToClear > 0) {
    // Lompat ke baris paling atas dari seluruh blok TUI kita
    readline.moveCursor(process.stdout, 0, -linesToClear);
    for (let i = 0; i < linesToClear; i++) {
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      readline.moveCursor(process.stdout, 0, 1);
    }
  }
  tuiLogState.lastLogLinesCount = 0;
  tuiLogState.activeLogs = [];
}

function stopSyncAnimation() {
  if (syncAnimationTimer) {
    clearInterval(syncAnimationTimer);
    syncAnimationTimer = null;
  }
  clearProgressLine();
  syncSpinnerIndex = 0;
  syncStartTime = 0;
  syncLastState = { sudah: 0, total: 0, code: "-" };
}

function drawProgress() {
  if (!fundamentalSyncState.isActive) return;

  const { sudah, total, code } = syncLastState;
  const pct = total > 0 ? sudah / total : 0;
  const barWidth = 30;
  const filled = Math.min(barWidth, Math.round(pct * barWidth));
  const prog = "█".repeat(filled).padEnd(barWidth, "░");
  const elapsed = formatElapsed(Date.now() - syncStartTime);
  const spinner = spinnerFrames[syncSpinnerIndex];

  const barText =
    `  ${spinner} [${prog}] ${Math.round(pct * 100)}%` +
    ` | ⏱ ${elapsed} | Emiten: ${code.padEnd(8, " ")}`;

  // 1. PEMBERSIHAN DITENTUKAN OLEH FORMAT RENDER SEBELUMNYA
  const linesToClear = tuiLogState.lastLogLinesCount + 1;
  readline.moveCursor(process.stdout, 0, -linesToClear);
  for (let i = 0; i < linesToClear; i++) {
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    readline.moveCursor(process.stdout, 0, 1);
  }

  // Kursor sekarang berada tepat di posisi awal baris prompt asli.
  // 2. DIGAMBAR DARI ATAS KE BAWAH SECARA BERTAHAP
  const currentLogsCount = tuiLogState.activeLogs.length;

  // Naik sejauh (Jumlah log aktif saat ini + 1 baris loading bar)
  readline.moveCursor(process.stdout, 0, -(currentLogsCount + 1));

  // Cetak daftar log aktif yang belum kedaluwarsa
  for (const logMsg of tuiLogState.activeLogs) {
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(logMsg + "\n"); // Safe karena posisi diatur manual
  }

  // Cetak loading bar tepat di bawah daftar log
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(barText);

  // Turun kembali ke baris terbawah tempat bersarangnya prompt input user
  readline.moveCursor(process.stdout, 0, 1);
  readline.cursorTo(process.stdout, 0);

  // Refresh visual prompt bawaan readlineHead
  (readlineHead as any)._refreshLine();
  renderGhostSuggestion();

  // 📝 Kunci jumlah baris log saat ini untuk referensi pembersihan di 100ms berikutnya
  tuiLogState.lastLogLinesCount = currentLogsCount;
}

export async function handleSync(renderTUI: () => void) {
  // --- TOGGLE OFF (pause) ---
  if (fundamentalSyncState.isActive) {
    fundamentalSyncState.isActive = false;
    stopSyncAnimation();
    renderTUI();
    process.stdout.write(
      "\n  🛑 Mengirim sinyal jeda, mohon tunggu emiten terakhir selesai...\n",
    );
    return;
  }

  // --- TOGGLE ON ---
  fundamentalSyncState.isActive = true;
  renderTUI();
  process.stdout.write(
    "  ⏳ Memulai sinkronisasi antrean, jalankan 'sync' kembali untuk menjeda...\n",
  );
  readlineHead.prompt(true);

  syncSpinnerIndex = 0;
  syncStartTime = Date.now();
  syncLastState = { sudah: 0, total: 0, code: "-" };

  // Satu-satunya mesin pencetak visual ke terminal luar
  syncAnimationTimer = setInterval(() => {
    syncSpinnerIndex = (syncSpinnerIndex + 1) % spinnerFrames.length;
    drawProgress();
  }, 100);

  try {
    await runSyncDataAll((sudah, total, code) => {
      if (!fundamentalSyncState.isActive) return;

      // 🛡️ FIX KUNCI: Amankan state data terbaru di memori.
      // JANGAN panggil drawProgress() di sini untuk menghindari tabrakan kursor TTY.
      syncLastState = { sudah, total, code };
    });

    if (!fundamentalSyncState.isActive) return;

    // Jika selesai secara natural tanpa dipause user
    stopSyncAnimation();
    process.stdout.write(
      "  ✅ Data sudah up-to-date. Tidak ada emiten yang perlu diperbarui (3 bulan terakhir).\n",
    );
    await new Promise((r) => setTimeout(r, 1500));
  } catch (err) {
    // Tangkap jika ada error tak terduga dari level orkestrator
    stopSyncAnimation();
  } finally {
    stopSyncAnimation();
    fundamentalSyncState.isActive = false;
    renderTUI();
  }
}
