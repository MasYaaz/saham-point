import fs from "node:fs";
import path from "node:path";

export interface LogFileInfo {
  filename: string;
  sizeKb: number;
  linesCount: number;
  modifiedAt: Date;
}

export interface ShowLogsResult {
  success: boolean;
  message?: string;
  headerTitle?: string;
  totalLines?: number;
  fetchedLines?: number;
  lines?: string[];
}

export interface CleanLogsResult {
  success: boolean;
  deletedCount: number;
  message: string;
}

const getLogDir = (): string =>
  process.env.LOG_DIR
    ? path.resolve(process.env.LOG_DIR)
    : path.join(process.cwd(), "logs");

/**
 * 1. Membaca baris log berdasarkan kriteria target (today, all, atau tanggal spesifik)
 */
export function getLogs(
  targetInput: string = "today",
  linesCount: number = 20,
): ShowLogsResult {
  const logDir = getLogDir();

  if (!fs.existsSync(logDir)) {
    return {
      success: false,
      message: "Folder logs tidak ditemukan.",
      lines: [],
    };
  }

  const allFiles = fs
    .readdirSync(logDir)
    .filter((f) => f.startsWith("sync-") && f.endsWith(".log"))
    .sort();

  if (allFiles.length === 0) {
    return {
      success: false,
      message: "Tidak ada file log yang tersimpan.",
      lines: [],
    };
  }

  let selectedFiles: string[] = [];
  let headerTitle = "";

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const todayFile = `sync-${y}-${m}-${d}.log`;

  const target = targetInput.toLowerCase();

  if (target === "all") {
    selectedFiles = allFiles;
    headerTitle = `Seluruh File Log (${allFiles.length} file)`;
  } else if (target === "today") {
    if (!allFiles.includes(todayFile)) {
      return {
        success: false,
        message: `Belum ada file log untuk hari ini (${todayFile}).`,
        lines: [],
      };
    }
    selectedFiles = [todayFile];
    headerTitle = `Hari Ini (${todayFile})`;
  } else {
    let matchedFile = targetInput;
    if (!matchedFile.startsWith("sync-")) matchedFile = `sync-${matchedFile}`;
    if (!matchedFile.endsWith(".log")) matchedFile = `${matchedFile}.log`;

    if (!allFiles.includes(matchedFile)) {
      return {
        success: false,
        message: `File log '${matchedFile}' tidak ditemukan.`,
        lines: [],
      };
    }
    selectedFiles = [matchedFile];
    headerTitle = matchedFile;
  }

  const combinedLines: string[] = [];
  for (const file of selectedFiles) {
    const filePath = path.join(logDir, file);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      combinedLines.push(...lines);
    } catch {
      // Abaikan jika file tidak dapat dibaca
    }
  }

  if (combinedLines.length === 0) {
    return {
      success: true,
      message: "Isi file log kosong.",
      headerTitle,
      totalLines: 0,
      fetchedLines: 0,
      lines: [],
    };
  }

  const recentLines = combinedLines.slice(-linesCount);

  return {
    success: true,
    headerTitle,
    totalLines: combinedLines.length,
    fetchedLines: recentLines.length,
    lines: recentLines,
  };
}

/**
 * 2. Mengambil daftar informasi seluruh file log harian
 */
export function listLogFiles(): LogFileInfo[] {
  const logDir = getLogDir();

  if (!fs.existsSync(logDir)) {
    return [];
  }

  const files = fs
    .readdirSync(logDir)
    .filter((f) => f.startsWith("sync-") && f.endsWith(".log"))
    .sort()
    .reverse();

  return files.map((file) => {
    const filePath = path.join(logDir, file);
    const stats = fs.statSync(filePath);
    const sizeKb = Number((stats.size / 1024).toFixed(1));
    const content = fs.readFileSync(filePath, "utf-8");
    const linesCount = content.trim() ? content.trim().split("\n").length : 0;

    return {
      filename: file,
      sizeKb,
      linesCount,
      modifiedAt: stats.mtime,
    };
  });
}

/**
 * 3. Membersihkan log yang lebih tua dari N hari atau seluruhnya ('all')
 */
export function cleanLogs(target: string = "7"): CleanLogsResult {
  const logDir = getLogDir();

  if (!fs.existsSync(logDir)) {
    return {
      success: false,
      deletedCount: 0,
      message: "Folder logs tidak ditemukan.",
    };
  }

  const files = fs
    .readdirSync(logDir)
    .filter((f) => f.startsWith("sync-") && f.endsWith(".log"));

  if (files.length === 0) {
    return {
      success: true,
      deletedCount: 0,
      message: "Tidak ada file log untuk dibersihkan.",
    };
  }

  if (target.toLowerCase() === "all") {
    let deletedCount = 0;
    for (const file of files) {
      fs.unlinkSync(path.join(logDir, file));
      deletedCount++;
    }
    return {
      success: true,
      deletedCount,
      message: `Berhasil menghapus seluruh file log (${deletedCount} file).`,
    };
  }

  const daysThreshold = parseInt(target, 10);
  if (isNaN(daysThreshold) || daysThreshold < 0) {
    return {
      success: false,
      deletedCount: 0,
      message:
        "Parameter tidak valid. Gunakan angka hari (misal: '7') atau 'all'.",
    };
  }

  const now = Date.now();
  const msThreshold = daysThreshold * 24 * 60 * 60 * 1000;
  let deletedCount = 0;

  for (const file of files) {
    const filePath = path.join(logDir, file);
    const stats = fs.statSync(filePath);
    const ageMs = now - stats.mtimeMs;

    if (ageMs > msThreshold) {
      fs.unlinkSync(filePath);
      deletedCount++;
    }
  }

  return {
    success: true,
    deletedCount,
    message:
      deletedCount > 0
        ? `Berhasil menghapus ${deletedCount} file log yang lebih tua dari ${daysThreshold} hari.`
        : `Tidak ada file log yang lebih tua dari ${daysThreshold} hari.`,
  };
}
