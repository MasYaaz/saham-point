import db from "../db";
import { runFundamentalCli, fundamentalSyncState } from "./sync-data";
import readline from "readline";
import app from "../server";
import { PORT } from "../config";
import { formatAbbr } from "../utils/formatMoney";
import {
  BG_GREEN,
  BG_RED,
  BOLD,
  CYAN,
  GRAY,
  GREEN,
  RED,
  RESET,
  YELLOW,
} from "../theme";
import { rl } from "..";
import { TUI } from "./tui-engine";
import { padColumn } from "./text-utils";

interface EmitenData {
  id: number;
  code: string;
  name: string;
  sector: string;
  description: string;
  last_price: number;
  beta: number;
  pbv: number;
  per: number;
  roe: number;
  der: number;
  price_updated_at: string;
  fundamental_updated_at: string;
}

interface StockHistoryData {
  year: number;
  period: string;
  revenue: string;
  net_profit: string;
  eps: number;
  roe: number;
  der: number;
  per: number;
  pbv: number;
}

export async function handleCommand(
  line: string,
  renderTUI: () => void,
): Promise<void> {
  if (!line || !line.trim()) {
    rl.prompt();
    return;
  }

  const parts = line.trim().split(/\s+/);
  // Pastikan parts[0] ada sebelum mengakses .toLowerCase()
  let command = (parts[0] || "").toLowerCase();

  // Gunakan Optional Chaining (?.) untuk mengecek parts[1] dengan aman
  if (command === "show" && parts[1]) {
    command = `show ${parts[1].toLowerCase()}`;
  }

  // Logika argumen yang lebih aman
  const isShowCommand = command.startsWith("show");
  const arg = !isShowCommand && parts[1] ? parts[1].toUpperCase() : "";

  switch (command) {
    case "sync":
      await handleSync(renderTUI);
      break;

    case "show emiten":
      await handleShowEmiten();
      break;

    case "detail":
      if (!arg) {
        console.log(
          `\n   ❌ Mohon masukkan kode saham. Contoh: ${CYAN}detail AMRT${RESET}\n`,
        );
        break;
      }
      await handleDetailEmiten(arg);
      break;

    case "show endpoints":
      try {
        // 1. Ambil data routes secara dinamis dari registrasi Hono app
        const liveRoutes = app.routes;

        console.log(
          `\n ${BOLD}🌐 DAFTAR LIVE NETWORK ENDPOINT GATEWAY (API) - DYNAMICALLY DETECTED:${RESET}`,
        );

        // Atur lebar kolom box tabel
        const wMethod = 10,
          wUrl = 58;

        // Border Atas Box
        console.log(
          ` ${GRAY}┌${"─".repeat(wMethod)}┬${"─".repeat(wUrl)}┐${RESET}`,
        );
        console.log(
          ` ${GRAY}│${RESET}${padColumn(` ${BOLD}METHOD${RESET}`, wMethod)}${GRAY}│${RESET}${padColumn(` ${BOLD}LIVE ENDPOINT URL LINKS${RESET}`, wUrl)}${GRAY}│${RESET}`,
        );
        console.log(
          ` ${GRAY}├${"─".repeat(wMethod)}┼${"─".repeat(wUrl)}┤${RESET}`,
        );

        // 2. Loop rute yang terdata di Hono
        for (const route of liveRoutes) {
          // Skip rute internal pencocokan massal jika ada (khas framework)
          if (route.path === "*") continue;

          // Pewarnaan Method (Hijau untuk GET, Kuning untuk POST, dll)
          const methodColor = route.method === "GET" ? GREEN : YELLOW;
          const formattedMethod = ` ${methodColor}${route.method}${RESET}`;

          // Gabungkan URL lokal dengan port aktif secara dinamis
          const fullUrl = ` http://localhost:${PORT}${route.path}`;
          const formattedUrl = `${CYAN}${fullUrl}${RESET}`;

          const cMethod = padColumn(formattedMethod, wMethod);
          const cUrl = padColumn(formattedUrl, wUrl);

          console.log(
            ` ${GRAY}│${RESET}${cMethod}${GRAY}│${RESET}${cUrl}${GRAY}│${RESET}`,
          );
        }

        // Border Bawah Box
        console.log(
          ` ${GRAY}╰${"─".repeat(wMethod)}┴${"─".repeat(wUrl)}┘${RESET}\n`,
        );
      } catch (err: any) {
        console.log(`❌ Gagal membaca endpoint data: ${err.message}\n`);
      }
      break;

    case "clear":
      renderTUI();
      break;

    case "exit":
      console.log("\n👋 Mematikan core engine Saham Point...");
      process.exit(0);

    default:
      console.log(
        `❌ Perintah tidak dikenal: '${line.trim()}'. Ketik 'sync', 'show endpoints', 'show emiten', 'detail <KODE>', 'clear', atau 'exit'.\n`,
      );
      break;
  }

  // Setelah blok perintah selesai di-print, lempar kembali prompt ke baris paling bawah
  rl.prompt();
}

// Logika Sinkronisasi dipisah
async function handleSync(renderTUI: () => void) {
  if (fundamentalSyncState.isActive) {
    fundamentalSyncState.isActive = false;
    renderTUI();
    return;
  }

  fundamentalSyncState.isActive = true;

  // Baris 1: reserved untuk progress bar
  // Baris 2: prompt rl dicetak di bawahnya
  process.stdout.write(
    "  ⏳ Memulai sinkronisasi antrean, jalankan 'sync' kembali untuk menjeda...\n",
  );
  rl.prompt(true); // true = preserve cursor / jangan reset buffer input

  try {
    const result = await runFundamentalCli((sudah, total, code) => {
      if (!fundamentalSyncState.isActive) return;

      const pct = total > 0 ? sudah / total : 0;
      const prog = "█".repeat(Math.round(pct * 30));
      const barText = `  ⏳ [${prog.padEnd(30, "░")}] ${Math.round(pct * 100)}% | Emiten: ${code}`;

      // Kursor sekarang ada di baris prompt (baris 2).
      // 1) Naik 1 baris -> ke baris progress bar
      readline.moveCursor(process.stdout, 0, -1);
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      process.stdout.write(barText);

      // 2) Turun lagi 1 baris -> balik ke baris prompt
      readline.moveCursor(process.stdout, 0, 1);
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);

      // Redraw prompt + isi input yang sedang diketik user
      (rl as any)._refreshLine();
    });
    if (!result.updated) {
      process.stdout.write(
        "  ✅ Data sudah up-to-date. Tidak ada emiten yang perlu diperbarui (3 bulan terakhir).\n",
      );
      // tambahkan delay agar user sempat membaca
      await new Promise((r) => setTimeout(r, 1500));
    }
  } finally {
    const wasCancelled = !fundamentalSyncState.isActive;
    fundamentalSyncState.isActive = false;

    if (!wasCancelled) {
      // Bersihkan baris progress (naik dulu ke baris 1)
      readline.moveCursor(process.stdout, 0, -1);
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);

      // Turun lagi, bersihkan baris prompt lama, biarkan renderTUI yang gambar ulang
      readline.moveCursor(process.stdout, 0, 1);
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);

      renderTUI();
    }
  }
}

// Logika List Emiten
async function handleShowEmiten() {
  const rows = db
    .query(
      `
          SELECT e.code, e.name, e.last_price, e.fundamental_updated_at, COUNT(h.id) as history_count
          FROM emiten e
          LEFT JOIN stock_histories h ON e.id = h.emiten_id AND h.period = 'FY'
          GROUP BY e.id
          ORDER BY e.code ASC
        `,
    )
    .all() as any[];
  const widths = [8, 32, 12, 22, 30];

  console.log(`\n ${BOLD}📋 DAFTAR EMITEN${RESET}`);
  console.log(TUI.border("top", widths));
  console.log(
    TUI.tableRow(
      [" KODE", " NAMA", " HARGA", " FUNDAMENTAL", " HISTORI"],
      widths,
    ),
  );
  console.log(TUI.border("mid", widths));

  for (const row of rows) {
    console.log(
      TUI.tableRow(
        [
          ` ${GREEN}${row.code}${RESET}`,
          ` ${row.name.substring(0, 30)}`,
          ` Rp ${row.last_price?.toLocaleString()}`,
          ` ${row.fundamental_updated_at}`,
          ` ${BOLD}${row.history_count > 0 ? `${BG_GREEN}      Data Ada      ${RESET}` : `${BG_RED}     Data Kosong    ${RESET}`}`,
        ],
        widths,
      ),
    );
  }
  console.log(TUI.border("bot", widths));
}

async function handleDetailEmiten(code: string) {
  const emiten = db
    .query("SELECT * FROM emiten WHERE UPPER(code) = ?")
    .get(code) as EmitenData;
  if (!emiten) {
    console.log(`\n❌ Saham "${code}" tidak ditemukan.\n`);
    return;
  }

  const histories = db
    .query(
      `SELECT * FROM stock_histories WHERE emiten_id = ? AND period = 'FY' ORDER BY year DESC`,
    )
    .all(emiten.id) as StockHistoryData[];

  // RENDER HEADER KARTU
  console.log(`\n ${GREEN}${BOLD}📊 BEDAH DATA EMITEN: ${emiten.code}${RESET}`);
  const wL = 50,
    wR = 38;
  console.log(TUI.border("top", [wL, wR]));
  console.log(
    TUI.tableRow([" Profil & Entitas", " Metrik Finansial"], [wL, wR]),
  );
  console.log(TUI.border("mid", [wL, wR]));

  // Data Rows
  const rows = [
    [
      ` ➜ Nama : ${emiten.name}`,
      ` ➜ Last Price : Rp ${emiten.last_price?.toLocaleString()}`,
    ],
    [` ➜ Kode : ${emiten.code}`, ` ➜ Beta : ${emiten.beta}`],
    [` ➜ Sektor : ${emiten.sector}`, ` ➜ P/E Ratio : ${emiten.per}x`],
    [``, ` ➜ PBV Ratio : ${emiten.pbv}x`],
    [` ${BOLD}Jadwal Sync${RESET}`, ` ➜ ROE : ${emiten.roe}%`],
    [` ➜ Harga : ${emiten.price_updated_at}`, ` ➜ DER : ${emiten.der}%`],
    [` ➜ Fund : ${emiten.fundamental_updated_at}`, ``],
  ];

  rows.forEach((r) => console.log(TUI.tableRow(r, [wL, wR])));
  console.log(TUI.border("bot", [wL, wR]));

  // RENDER TABEL HISTORI
  if (histories.length > 0) renderHistoriTable(histories);
}

function renderHistoriTable(histories: StockHistoryData[]) {
  const widths = [8, 8, 18, 18, 11, 11, 11, 11, 11];
  console.log(`\n ${BOLD}📈 RIWAYAT FUNDAMENTAL:${RESET}`);
  console.log(TUI.border("top", widths));
  console.log(
    TUI.tableRow(
      [
        " TAHUN",
        " PER",
        " REVENUE",
        " NET PROFIT",
        " EPS",
        " ROE",
        " DER",
        " PER",
        " PBV",
      ],
      widths,
    ),
  );
  console.log(TUI.border("mid", widths));

  for (const h of histories) {
    console.log(
      TUI.tableRow(
        [
          ` ${h.year}`,
          ` ${h.period}`,
          `${formatAbbr(h.revenue)} `,
          `${formatAbbr(h.net_profit)} `,
          `${h.eps} `,
          `${h.roe}% `,
          `${h.der}x `,
          `${h.per}x `,
          `${h.pbv}x `,
        ],
        widths,
      ),
    );
  }
  console.log(TUI.border("bot", widths));
}
