import readline from "readline";
import { fundamentalSyncState, runSyncDataAll } from "./helper/runSyncDataAll";
import { readlineHead } from "../component/readlineInterface";
import { renderGhostSuggestion } from "./helper/autoCompletion";

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
  // Naik 1 baris ke posisi progress bar, bersihkan baris, lalu kembali ke baris prompt
  readline.moveCursor(process.stdout, 0, -1);
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  readline.moveCursor(process.stdout, 0, 1);
  readline.cursorTo(process.stdout, 0);

  (readlineHead as any)._refreshLine();
  renderGhostSuggestion();
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

  // 1. Posisikan kursor 1 baris tepat di atas prompt
  readline.moveCursor(process.stdout, 0, -1);
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);

  // 2. Cetak loading bar
  process.stdout.write(barText);

  // 3. Turun kembali ke baris prompt input user
  readline.moveCursor(process.stdout, 0, 1);
  readline.cursorTo(process.stdout, 0);

  // Refresh visual prompt bawaan readlineHead
  (readlineHead as any)._refreshLine();
  renderGhostSuggestion();
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

  // Timer animasi visual progress bar
  syncAnimationTimer = setInterval(() => {
    syncSpinnerIndex = (syncSpinnerIndex + 1) % spinnerFrames.length;
    drawProgress();
  }, 100);

  try {
    await runSyncDataAll((sudah, total, code) => {
      if (!fundamentalSyncState.isActive) return;

      // Amankan state data terbaru di memori tanpa memicu bentrokan kursor TTY
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
    stopSyncAnimation();
  } finally {
    stopSyncAnimation();
    fundamentalSyncState.isActive = false;
    renderTUI();
  }
}
