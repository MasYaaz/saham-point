import fs from "node:fs";
import path from "node:path";
import { CYAN, YELLOW, GREEN, RED, RESET, GRAY } from "../component/TUITheme";

const getLogDir = () =>
  process.env.LOG_DIR
    ? path.resolve(process.env.LOG_DIR)
    : path.join(process.cwd(), "logs");

/**
 * 1. Membaca & Menampilkan Log (Hari Ini, Seluruh File, atau File Tertentu)
 */
export function handleShowLogs(
  targetInput: string = "today",
  linesCount: number = 20,
): void {
  const logDir = getLogDir();

  if (!fs.existsSync(logDir)) {
    console.log(`\n  ${YELLOW}⚠️ Folder logs belum ada.${RESET}\n`);
    return;
  }

  // Ambil semua file log diurutkan dari tertua ke terbaru
  const allFiles = fs
    .readdirSync(logDir)
    .filter((f) => f.startsWith("sync-") && f.endsWith(".log"))
    .sort();

  if (allFiles.length === 0) {
    console.log(`\n  ${YELLOW}⚠️ Tidak ada file log tersimpan.${RESET}\n`);
    return;
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
    // Mode: Seluruh Log Gabungan
    selectedFiles = allFiles;
    headerTitle = `Seluruh File Log (${allFiles.length} file)`;
  } else if (target === "today") {
    // Mode: Log Hari Ini
    if (!allFiles.includes(todayFile)) {
      console.log(
        `\n  ${YELLOW}⚠️ Belum ada file log untuk hari ini (${todayFile})${RESET}\n`,
      );
      return;
    }
    selectedFiles = [todayFile];
    headerTitle = `Hari Ini (${todayFile})`;
  } else {
    // Mode: Tanggal/File Spesifik (misal: '2026-07-24' atau 'sync-2026-07-24.log')
    let matchedFile = targetInput;
    if (!matchedFile.startsWith("sync-")) matchedFile = `sync-${matchedFile}`;
    if (!matchedFile.endsWith(".log")) matchedFile = `${matchedFile}.log`;

    if (!allFiles.includes(matchedFile)) {
      console.log(
        `\n  ${RED}❌ File log '${matchedFile}' tidak ditemukan.${RESET}`,
      );
      console.log(
        `  💡 Ketik ${CYAN}logs list${RESET} untuk melihat daftar file log yang tersedia.\n`,
      );
      return;
    }
    selectedFiles = [matchedFile];
    headerTitle = matchedFile;
  }

  // Gabungkan baris log dari file-file terpilih
  let combinedLines: string[] = [];
  for (const file of selectedFiles) {
    const filePath = path.join(logDir, file);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      combinedLines.push(...lines);
    } catch {
      // Abaikan file jika gagal dibaca
    }
  }

  if (combinedLines.length === 0) {
    console.log(`\n  ${YELLOW}⚠️ Isi log masih kosong.${RESET}\n`);
    return;
  }

  const recentLines = combinedLines.slice(-linesCount);

  console.log(
    `\n  📌 ${CYAN}Log Terakhir (${recentLines.length}/${combinedLines.length} baris) - ${headerTitle}:${RESET}`,
  );
  console.log(`  ${GRAY}${"─".repeat(70)}${RESET}`);

  for (const line of recentLines) {
    let formattedLine = line;
    if (line.includes("[ERROR]")) {
      formattedLine = `\x1b[31m${line}\x1b[0m`;
    } else if (line.includes("[WARN]")) {
      formattedLine = `\x1b[33m${line}\x1b[0m`;
    } else if (line.includes("[LOG]")) {
      formattedLine = `\x1b[36m${line}\x1b[0m`;
    }
    console.log(`  ${formattedLine}`);
  }

  console.log(`  ${GRAY}${"─".repeat(70)}${RESET}\n`);
}

/**
 * 2. Tampilkan Daftar Seluruh File Log Harian
 */
export function handleListLogs(): void {
  const logDir = getLogDir();

  if (!fs.existsSync(logDir)) {
    console.log(`\n  ${YELLOW}⚠️ Folder logs belum dibuat.${RESET}\n`);
    return;
  }

  const files = fs
    .readdirSync(logDir)
    .filter((f) => f.startsWith("sync-") && f.endsWith(".log"))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log(`\n  ${YELLOW}⚠️ Tidak ada file log tersimpan.${RESET}\n`);
    return;
  }

  console.log(
    `\n  📂 ${CYAN}Daftar File Log Harian (${files.length} file):${RESET}`,
  );
  console.log(`  ${GRAY}${"─".repeat(60)}${RESET}`);

  for (const file of files) {
    const filePath = path.join(logDir, file);
    const stats = fs.statSync(filePath);
    const sizeKb = (stats.size / 1024).toFixed(1);
    const lines = fs.readFileSync(filePath, "utf-8").split("\n").length - 1;

    console.log(
      `  📄 ${GREEN}${file.padEnd(20)}${RESET} | 💾 ${sizeKb.padStart(6)} KB | 📝 ${lines} baris`,
    );
  }
  console.log(`  ${GRAY}${"─".repeat(60)}${RESET}\n`);
}

/**
 * 3. Hapus Log yang Lebih Tua dari N Hari atau Hapus Semua ('all')
 */
export function handleCleanLogs(target: string = "7"): void {
  const logDir = getLogDir();

  if (!fs.existsSync(logDir)) {
    console.log(`\n  ${YELLOW}⚠️ Folder logs belum ada.${RESET}\n`);
    return;
  }

  const files = fs
    .readdirSync(logDir)
    .filter((f) => f.startsWith("sync-") && f.endsWith(".log"));

  if (files.length === 0) {
    console.log(
      `\n  ${YELLOW}⚠️ Tidak ada file log untuk dibersihkan.${RESET}\n`,
    );
    return;
  }

  if (target.toLowerCase() === "all") {
    let deletedCount = 0;
    for (const file of files) {
      fs.unlinkSync(path.join(logDir, file));
      deletedCount++;
    }
    console.log(
      `\n  🗑️ ${GREEN}Berhasil menghapus SEMUA file log (${deletedCount} file).${RESET}\n`,
    );
    return;
  }

  const daysThreshold = parseInt(target, 10);
  if (isNaN(daysThreshold) || daysThreshold < 0) {
    console.log(
      `\n  ❌ Parameter tidak valid. Gunakan angka hari (contoh: 'logs clean 7') atau 'logs clean all'.\n`,
    );
    return;
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

  if (deletedCount > 0) {
    console.log(
      `\n  🗑️ ${GREEN}Berhasil menghapus ${deletedCount} file log yang lebih tua dari ${daysThreshold} hari.${RESET}\n`,
    );
  } else {
    console.log(
      `\n  ✨ ${CYAN}Tidak ada file log yang lebih tua dari ${daysThreshold} hari.${RESET}\n`,
    );
  }
}
