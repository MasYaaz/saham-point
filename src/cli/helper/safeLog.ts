import { fundamentalSyncState } from "../helper/runSyncDataAll";
import fs from "node:fs";
import path from "node:path";

// ==========================================================================
// 📦 STATE MANAGEMENT UTAMA UNTUK TUI LOG
// ==========================================================================
export const tuiLogState = {
  activeLogs: [] as string[],
  lastLogLinesCount: 0,
};

const MAX_VISIBLE_LOGS = 3;
const LOG_DURATION = 5000;

// ==========================================================================
// 📝 FILE LOGGING (Auto-Detect Directory)
// ==========================================================================

/**
 * Mendapatkan folder 'logs' persis di samping file script/binary yang dieksekusi
 */
function resolveLogDir(): string {
  if (process.env.LOG_DIR) {
    return path.resolve(process.env.LOG_DIR);
  }

  const entryPath = process.argv[1] || process.execPath;

  let baseDir = process.cwd();
  try {
    const realPath = fs.realpathSync(entryPath);
    baseDir = path.dirname(realPath);

    if (path.basename(baseDir) === "src") {
      baseDir = path.resolve(baseDir, "..");
    }
  } catch {
    baseDir = process.cwd();
  }

  return path.join(baseDir, "logs");
}

const LOG_DIR = resolveLogDir();
let logDirReady = false;

function ensureLogDir() {
  if (logDirReady) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    logDirReady = true;
  } catch (err: any) {
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

/** Rotasi harian: satu file per tanggal (WIB), mis. sync-2026-07-25.log */
function getLogFilePath(): string {
  const now = getJakartaNow();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return path.join(LOG_DIR, `sync-${y}-${m}-${d}.log`);
}

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function appendToLogFile(type: "log" | "warn" | "error", line: string) {
  ensureLogDir();
  if (!logDirReady) return;

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
// 🚀 IMPLEMENTASI SAFELOG
// ==========================================================================
export function safeLog(type: "log" | "warn" | "error", message: string) {
  const colors = { log: "\x1b[37m", warn: "\x1b[33m", error: "\x1b[31m" };
  const RESET = "\x1b[0m";

  const rawLines = message.split("\n");

  if (fundamentalSyncState.isActive) {
    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (!line) continue;

      appendToLogFile(type, line);

      const formattedMsg = `${colors[type]}[${type.toUpperCase()}] ${line}${RESET}`;

      if (
        tuiLogState.activeLogs[tuiLogState.activeLogs.length - 1] ===
        formattedMsg
      )
        continue;

      if (tuiLogState.activeLogs.length >= MAX_VISIBLE_LOGS) {
        tuiLogState.activeLogs.shift();
      }

      tuiLogState.activeLogs.push(formattedMsg);

      setTimeout(() => {
        const index = tuiLogState.activeLogs.indexOf(formattedMsg);
        if (index !== -1) {
          tuiLogState.activeLogs.splice(index, 1);
        }
      }, LOG_DURATION);
    }
  } else {
    console[type](message);

    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (!line) continue;
      appendToLogFile(type, line);
    }
  }
}
