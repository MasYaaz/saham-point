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
 * Mengambil waktu saat ini yang disesuaikan dengan zona waktu Asia/Jakarta (WIB).
 *
 * @returns Objek `Date` terkalibrasi ke zona waktu WIB.
 */
function getJakartaNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  );
}

/**
 * Menghasilkan path file log harian berbasis tanggal WIB (Daily Log Rotation).
 * Contoh format file: `logs/sync-2026-07-31.log`
 *
 * @returns Path absolut menuju file log harian aktif.
 */
function getLogFilePath(): string {
  const now = getJakartaNow();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return path.join(LOG_DIR, `sync-${y}-${m}-${d}.log`);
}

/**
 * Menuliskan satu baris log terformat langsung ke file sistem (append mode).
 * Otomatis menghapus simbol warna ANSI dan menyertakan timestamp WIB.
 *
 * @param type - Kategori level log (`info`, `log`, `warn`, `error`).
 * @param line - Pesan teks log yang akan ditambahkan.
 */
function appendToLogFile(type: LogLevel, line: string): void {
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
 * safeLog("info", "Worker berhasil menyinkronkan 800 emiten.");
 * safeLog("error", "Koneksi HTTP timeout saat fetching data.");
 * ```
 */
export function safeLog(type: LogLevel, message: string): void {
  const rawLines = message.split("\n");

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;
    appendToLogFile(type, line);
  }
}
