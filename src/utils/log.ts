import fs from "node:fs";
import path from "node:path";

/** Pattern untuk membersihkan kode warna ANSI terminal dari teks log file */
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

/**
 * Tingkat keparahan (severity level) pencatatan log.
 */
export type LogLevel = "info" | "log" | "warn" | "error";

// ==========================================================================
// FILE LOGGING (Auto-Detect Directory & Daily Rotation)
// ==========================================================================

/**
 * Menentukan lokasi absolut folder `logs`.
 * Secara otomatis mendeteksi lokasi relatif berdasarkan skrip/binary yang dieksekusi,
 * atau menggunakan environment variable `LOG_DIR` jika tersedia.
 *
 * @returns Path absolut ke direktori penampung file log.
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

/**
 * Memastikan direktori target log telah dibuat di sistem berkas.
 * Hanya mengeksekusi operasi `mkdirSync` satu kali demi efisiensi I/O.
 */
function ensureLogDir(): void {
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

/**
 * Mengambil komponen tanggal dan waktu lokal dari sistem PC saat ini.
 */
function getLocalTimestamp(): { dateStr: string; dateTimeStr: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  return {
    dateStr: `${y}-${m}-${d}`,
    dateTimeStr: `${y}-${m}-${d} ${hh}:${mm}:${ss}`,
  };
}

/**
 * Menghasilkan path file log harian berbasis tanggal lokal PC (Daily Log Rotation).
 * Contoh format file: `logs/sync-2026-08-03.log`
 *
 * @param dateStr - String tanggal dalam format YYYY-MM-DD.
 * @returns Path absolut menuju file log harian aktif.
 */
function getLogFilePath(dateStr: string): string {
  return path.join(LOG_DIR, `sync-${dateStr}.log`);
}

/**
 * Menuliskan satu baris log terformat langsung ke file sistem (append mode).
 * Otomatis menghapus simbol warna ANSI dan menyertakan timestamp waktu lokal PC.
 *
 * @param type - Kategori level log (`info`, `log`, `warn`, `error`).
 * @param line - Pesan teks log yang akan ditambahkan.
 */
function appendToLogFile(type: LogLevel, line: string): void {
  ensureLogDir();
  if (!logDirReady) return;

  try {
    const { dateStr, dateTimeStr } = getLocalTimestamp();
    const cleanLine = line.replace(ANSI_PATTERN, "");
    const entry = `[${dateTimeStr}] [${type.toUpperCase()}] ${cleanLine}\n`;
    fs.appendFileSync(getLogFilePath(dateStr), entry, "utf-8");
  } catch (err: any) {
    process.stderr.write(
      `[safeLog] Gagal menulis log ke file: ${err?.message || err}\n`,
    );
  }
}

// ==========================================================================
// MAIN LOGGING UTILITY
// ==========================================================================

/**
 * Pencatat log aman untuk lingkungan Server MCP (Model Context Protocol).
 *
 * Menulis log secara eksklusif ke file berkas harian (`logs/sync-YYYY-MM-DD.log`)
 * tanpa pernah mencetak ke `stdout`. Hal ini mencegah tercemarnya JSON-RPC stream
 * yang dapat memutus koneksi Server MCP.
 *
 * @param type - Tingkat keparahan log (`"info"` | `"log"` | `"warn"` | `"error"`).
 * @param message - Pesan log yang ingin dicatat (mendukung teks multi-baris).
 *
 * @example
 * ```ts
 * log("info", "Worker berhasil menyinkronkan 800 emiten.");
 * log("error", "Koneksi HTTP timeout saat fetching data.");
 * ```
 */
export function log(type: LogLevel, message: string): void {
  const rawLines = message.split("\n");

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;
    appendToLogFile(type, line);
  }
}
