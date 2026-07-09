import readline from "readline";
import { fundamentalSyncState, runSyncDataAll } from "../helper/runSyncDataAll";
import { readlineHead } from "../component/readlineInterface";
import { renderGhostSuggestion } from "../helper/autoCompletion";

// sebelumnya cabang OFF tidak bisa clearInterval milik cabang ON.
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
  readline.moveCursor(process.stdout, 0, -1);
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  readline.moveCursor(process.stdout, 0, 1);
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
}

// Dipanggil dari KEDUA cabang (ON saat mau distop di tengah jalan,
// maupun OFF) supaya animasi benar-benar berhenti seketika, bukan
// nunggu batch berikutnya kelar dulu.
function stopSyncAnimation() {
  if (syncAnimationTimer) {
    clearInterval(syncAnimationTimer);
    syncAnimationTimer = null;
  }
  // Reset semua state supaya kalau sync dinyalakan lagi nanti,
  // dia mulai fresh (bar 0%, timer 00:00) — bukan lanjut dari sisa lama.
  syncSpinnerIndex = 0;
  syncStartTime = 0;
  syncLastState = { sudah: 0, total: 0, code: "-" };
  clearProgressLine();
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

  readline.moveCursor(process.stdout, 0, -1);
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  process.stdout.write(barText);

  readline.moveCursor(process.stdout, 0, 1);
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);

  (readlineHead as any)._refreshLine();
  renderGhostSuggestion();
}

// Logika Sinkronisasi dipisah
export async function handleSync(renderTUI: () => void) {
  // --- TOGGLE OFF (pause) ---
  if (fundamentalSyncState.isActive) {
    fundamentalSyncState.isActive = false;

    // 🔑 Stop & reset animasi SEKARANG JUGA, jangan tunggu batch
    // terakhir selesai — ini yang bikin stutter sebelumnya.
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

  // Mulai fresh setiap kali dinyalakan
  syncSpinnerIndex = 0;
  syncStartTime = Date.now();
  syncLastState = { sudah: 0, total: 0, code: "-" };

  syncAnimationTimer = setInterval(() => {
    syncSpinnerIndex = (syncSpinnerIndex + 1) % spinnerFrames.length;
    drawProgress();
  }, 100);

  try {
    const result = await runSyncDataAll((sudah, total, code) => {
      if (!fundamentalSyncState.isActive) return;
      syncLastState = { sudah, total, code };
      drawProgress();
    });

    if (!result.updated) {
      stopSyncAnimation();
      process.stdout.write(
        "  ✅ Data sudah up-to-date. Tidak ada emiten yang perlu diperbarui (3 bulan terakhir).\n",
      );
      await new Promise((r) => setTimeout(r, 1500));
    }
  } finally {
    // Jaga-jaga: kalau belum di-stop lewat cabang OFF (misal proses
    // selesai natural tanpa user pause), pastikan tetap dibersihkan.
    stopSyncAnimation();
    fundamentalSyncState.isActive = false;
    renderTUI();
  }
}
