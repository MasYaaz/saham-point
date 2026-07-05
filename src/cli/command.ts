import db from "../db";
import { runFundamentalCli, fundamentalSyncState } from "./sync-data";
import { rl } from "../index";
import app from "../server";
import { PORT } from "../config";
import { formatAbbr } from "../utils/formatMoney";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BG_RED = "\x1b[41m\x1b[37m";

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

// Fungsi pembantu menghitung panjang teks tanpa kode warna ANSI
function stripANSI(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// Fungsi pembuat kolom presisi
function padColumn(
  text: string,
  width: number,
  align: "left" | "right" = "left",
): string {
  const visibleLength = stripANSI(text).length;
  const padding = Math.max(0, width - visibleLength);
  if (align === "right") {
    return " ".repeat(padding) + text;
  }
  return text + " ".repeat(padding);
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
  const command = parts[0] ? parts[0].toLowerCase() : "";
  const arg = parts[1] ? parts[1].toUpperCase() : "";

  switch (command) {
    case "sync":
      if (!fundamentalSyncState.isActive) {
        fundamentalSyncState.isActive = true;
        renderTUI();
        console.log(
          `⏳ Memulai sinkronisasi antrean, jalankan 'sync' kembali untuk menjeda...\n`,
        );

        await runFundamentalCli(
          (
            sudahTerprosesGlobal,
            totalEmitenGlobal,
            code,
            status,
            sisaTerkini,
            batchProcessed,
            currentLimit,
          ) => {
            if (!fundamentalSyncState.isActive) return;

            const percentage = Math.round(
              (sudahTerprosesGlobal / totalEmitenGlobal) * 100,
            );
            const barLength = 30;
            const completedBars = Math.round(
              (sudahTerprosesGlobal / totalEmitenGlobal) * barLength,
            );
            const remainingBars = Math.max(0, barLength - completedBars);
            const progressBar =
              "█".repeat(completedBars) + "░".repeat(remainingBars);

            const paddedCode = code.padEnd(4, " ");
            const statusIndicator =
              status === "OK" ? `🟢 ${paddedCode}` : `🔴 ${paddedCode}`;
            const progressText =
              `${sudahTerprosesGlobal}/${totalEmitenGlobal}`.padStart(9, " ");
            const batchText = `${batchProcessed}/${currentLimit}`.padStart(
              5,
              " ",
            );

            const progressLine = `⏳ [${progressBar}] ${percentage}% DB (${progressText}) │ Batch: ${batchText} │ Sisa: ${String(sisaTerkini).padStart(3, " ")} │ Emiten: ${statusIndicator}`;

            // ──────────────────────────────────────────────────────────────
            // TRIK READLINE: PISAH PROGRESS BAR DENGAN PROMPT INPUT
            // ──────────────────────────────────────────────────────────────

            // 1. Matikan sementara output readline agar prompt tidak mental-mental
            rl.pause();

            // 2. Hapus baris progress (baris atas) dan baris prompt (baris bawah) saat ini
            process.stdout.write("\u001b[1K\r"); // Hapus baris progress (Kursor di baris atas)
            process.stdout.write("\u001b[1B\u001b[1K\r"); // Turun 1 baris, hapus baris prompt
            process.stdout.write("\u001b[1A\r"); // Kembali ke baris progress atas

            // 3. Tulis teks progress bar terbaru di baris atas
            process.stdout.write(progressLine);

            // 4. Hidupkan kembali output readline agar prompt muncul di baris bawahnya
            rl.resume();
          },
        );

        fundamentalSyncState.isActive = false;
        renderTUI();
      } else {
        fundamentalSyncState.isActive = false;
        renderTUI();
        console.log(`\n🛑 [Sinyal OFF] Sinkronisasi fundamental dijeda.\n`);
      }
      break;

    case "list":
      try {
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

        if (rows.length === 0) {
          console.log(
            `\n ${YELLOW}⚠️  Database emiten masih kosong.${RESET}\n`,
          );
        } else {
          console.log(
            `\n ${BOLD}📋 DAFTAR SINKRONISASI EMITEN (${rows.length} Saham):${RESET}`,
          );

          // Definisikan lebar kolom tabel list
          const wCode = 8,
            wName = 32,
            wPrice = 12,
            wFund = 22,
            wHist = 30;

          // Border Atas
          console.log(
            ` ${GRAY}┌${"─".repeat(wCode)}┬${"─".repeat(wName)}┬${"─".repeat(wPrice)}┬${"─".repeat(wFund)}┬${"─".repeat(wHist)}┐${RESET}`,
          );

          // Header Teks
          const hCode = padColumn(` ${BOLD}KODE${RESET}`, wCode);
          const hName = padColumn(` ${BOLD}NAMA PERUSAHAAN${RESET}`, wName);
          const hPrice = padColumn(` ${BOLD}HARGA${RESET}`, wPrice, "right");
          const hFund = padColumn(` ${BOLD}LAST FUNDAMENTAL${RESET}`, wFund);
          const hHist = padColumn(` ${BOLD}STOCK HISTORIES${RESET}`, wHist);
          console.log(
            ` ${GRAY}│${RESET}${hCode}${GRAY}│${RESET}${hName}${GRAY}│${RESET}${hPrice}${GRAY}│${RESET}${hFund}${GRAY}│${RESET}${hHist}${GRAY}│${RESET}`,
          );

          // Border Tengah
          console.log(
            ` ${GRAY}├${"─".repeat(wCode)}┼${"─".repeat(wName)}┼${"─".repeat(wPrice)}┼${"─".repeat(wFund)}┼${"─".repeat(wHist)}┤${RESET}`,
          );

          // Isi data loop
          for (let row of rows) {
            const priceText = row.last_price
              ? `Rp ${row.last_price.toLocaleString("id-ID")} `
              : "Rp 0 ";
            const dateText =
              row.fundamental_updated_at === "2000-01-01 00:00:00" ||
              !row.fundamental_updated_at
                ? `${BG_RED} BELUM SYNC ${RESET}`
                : `${CYAN}${row.fundamental_updated_at}${RESET}`;

            const historyText =
              row.history_count > 0
                ? `${GREEN}Ada (${row.history_count} Tahun) 🟢${RESET}`
                : `${RED}Stock histories tidak ada ❌${RESET}`;

            const cCode = padColumn(` ${GREEN}${row.code}${RESET}`, wCode);
            const cName = padColumn(` ${row.name.substring(0, 30)}`, wName);
            const cPrice = padColumn(priceText, wPrice, "right");
            const cFund = padColumn(` ${dateText}`, wFund);
            const cHist = padColumn(` ${historyText}`, wHist);

            console.log(
              ` ${GRAY}│${RESET}${cCode}${GRAY}│${RESET}${cName}${GRAY}│${RESET}${cPrice}${GRAY}│${RESET}${cFund}${GRAY}│${RESET}${cHist}${GRAY}│${RESET}`,
            );
          }

          // Border Bawah
          console.log(
            ` ${GRAY}└${"─".repeat(wCode)}┴${"─".repeat(wName)}┴${"─".repeat(wPrice)}┴${"─".repeat(wFund)}┴${"─".repeat(wHist)}┘${RESET}`,
          );
          console.log(
            ` ${BOLD}💡 NAVIGASI DATA :${RESET} Ketik ${CYAN}detail <KODE>${RESET} (Contoh: ${CYAN}detail AMRT${RESET}) untuk membedah histori tahunan.\n`,
          );
        }
      } catch (err: any) {
        console.log(`❌ Gagal mengambil data list: ${err.message}\n`);
      }
      break;

    case "detail":
      if (!arg) {
        console.log(
          `\n❌ Mohon masukkan kode saham. Contoh: ${CYAN}detail AMRT${RESET}\n`,
        );
        break;
      }

      try {
        const emiten = db
          .query("SELECT * FROM emiten WHERE UPPER(code) = ?")
          .get(arg) as EmitenData | undefined;

        if (!emiten) {
          console.log(
            `\n❌ Saham dengan kode ${YELLOW}"${arg}"${RESET} tidak ditemukan di database.\n`,
          );
          break;
        }

        const histories = db
          .query(
            `
          SELECT revenue, net_profit, eps ,year, period, pbv, roe, der 
          FROM stock_histories 
          WHERE emiten_id = ? AND period = 'FY'
          ORDER BY year DESC
        `,
          )
          .all(emiten.id) as StockHistoryData[];

        // 1. RENDER KARTU UTUH INFORMASI DATA EMITEN (Membuka seluruh isi properti tabel)
        console.log(
          `\n ${GREEN}${BOLD}📊 BEDAH DATA EMITEN SELEKTIF: [ID: ${emiten.id}] ${emiten.code}${RESET}`,
        );

        // Kita patok lebar bersih isi kolom kiri = 46, kolom kanan = 36. Total lebar isi = 82 (tidak termasuk border)
        const wLeftCol = 50;
        const wRightCol = 38;

        console.log(
          ` ${GRAY}╭──────────────────────────────────────────────────┬──────────────────────────────────────╮${RESET}`,
        );

        // Header Row
        const lHead = padColumn(
          ` ${BOLD}Profil & Entitas Perusahaan${RESET}`,
          wLeftCol,
        );
        const rHead = padColumn(
          ` ${BOLD}Metrik Finansial & Valuasi Saham${RESET}`,
          wRightCol,
        );
        console.log(
          ` ${GRAY}│${RESET}${lHead}${GRAY}│${RESET}${rHead}${GRAY}│${RESET}`,
        );

        console.log(
          ` ${GRAY}├──────────────────────────────────────────────────┼──────────────────────────────────────┤${RESET}`,
        );

        // Row 1: Nama Emiten & Last Price
        const lRow1 = padColumn(
          ` ➜ Nama Emiten : ${CYAN}${emiten.name || "-"}${RESET}`,
          wLeftCol,
        );
        const rRow1 = padColumn(
          ` ➜ Last Price : ${YELLOW}Rp ${(emiten.last_price || 0).toLocaleString("id-ID")}${RESET}`,
          wRightCol,
        );
        console.log(
          ` ${GRAY}│${RESET}${lRow1}${GRAY}│${RESET}${rRow1}${GRAY}│${RESET}`,
        );

        // Row 2: Kode Saham & Beta Saham
        const lRow2 = padColumn(
          ` ➜ Kode Saham  : ${GREEN}${emiten.code}${RESET}`,
          wLeftCol,
        );
        const rRow2 = padColumn(
          ` ➜ Beta Saham : ${emiten.beta ?? 0}`,
          wRightCol,
        );
        console.log(
          ` ${GRAY}│${RESET}${lRow2}${GRAY}│${RESET}${rRow2}${GRAY}│${RESET}`,
        );

        // Row 3: Sektor & P/E Ratio
        const lRow3 = padColumn(` ➜ Sektor      : ${emiten.sector}`, wLeftCol);
        const rRow3 = padColumn(
          ` ➜ P/E Ratio  : ${emiten.per ?? 0}x`,
          wRightCol,
        );
        console.log(
          ` ${GRAY}│${RESET}${lRow3}${GRAY}│${RESET}${rRow3}${GRAY}│${RESET}`,
        );

        // Row 4: Empty space kiri & PBV Ratio
        const lRow4 = padColumn(``, wLeftCol);
        const rRow4 = padColumn(
          ` ➜ PBV Ratio  : ${emiten.pbv >= 0 && emiten.pbv <= 1 ? GREEN : RESET}${emiten.pbv ?? 0}x${RESET}`,
          wRightCol,
        );
        console.log(
          ` ${GRAY}│${RESET}${lRow4}${GRAY}│${RESET}${rRow4}${GRAY}│${RESET}`,
        );

        // Row 5: Jadwal Sinkronisasi Header & ROE Target
        const lRow5 = padColumn(
          ` ${BOLD}Jadwal Sinkronisasi Core Engine${RESET}`,
          wLeftCol,
        );
        const rRow5 = padColumn(
          ` ➜ ROE Target : ${emiten.roe >= 15 ? GREEN : RESET}${emiten.roe ?? 0}%${RESET}`,
          wRightCol,
        );
        console.log(
          ` ${GRAY}│${RESET}${lRow5}${GRAY}│${RESET}${rRow5}${GRAY}│${RESET}`,
        );

        // Row 6: Sync Harga & DER Rasio
        const lRow6 = padColumn(
          ` ➜ Sync Harga  : ${emiten.price_updated_at || "-"}`,
          wLeftCol,
        );
        const rRow6 = padColumn(
          ` ➜ DER Rasio  : ${emiten.der <= 100 ? GREEN : RESET}${emiten.der ?? 0}%${RESET}`,
          wRightCol,
        );
        console.log(
          ` ${GRAY}│${RESET}${lRow6}${GRAY}│${RESET}${rRow6}${GRAY}│${RESET}`,
        );

        // Row 7: Sync Fund & Empty space kanan
        const lRow7 = padColumn(
          ` ➜ Sync Fund   : ${emiten.fundamental_updated_at || "-"}`,
          wLeftCol,
        );
        const rRow7 = padColumn(``, wRightCol);
        console.log(
          ` ${GRAY}│${RESET}${lRow7}${GRAY}│${RESET}${rRow7}${GRAY}│${RESET}`,
        );

        // Lebar bawah menyesuaikan pembatas tengah '┴' secara simetris (46 baris '─' + '┴' + 36 baris '─')
        console.log(
          ` ${GRAY}╰──────────────────────────────────────────────────┴──────────────────────────────────────╯${RESET}`,
        );

        // 2. RENDER TABEL HISTORI TAHUNAN (STOCK HISTORIES)
        // 2. RENDER TABEL HISTORI TAHUNAN (STOCK HISTORIES)
        console.log(`\n ${BOLD}📈 TABEL RIWAYAT FUNDAMENTAL HISTORIS:${RESET}`);

        if (histories.length === 0) {
          console.log(
            ` ${BG_RED}${BOLD} Data fundamental kosong atau belum pernah di-sync ❌ ${RESET}\n`,
          );
        } else {
          // Total lebar kolom + pembatas internal = 113 karakter (Sangat fit di bawah BOX_WIDTH 117)
          const wYr = 8,
            wPer = 8,
            wRev = 18,
            wNet = 18,
            wEps = 11,
            wRoe = 11,
            wDer = 11,
            wPerRatio = 11,
            wPbv = 11;

          // Header Border Atas
          console.log(
            ` ${GRAY}┌${"─".repeat(wYr)}┬${"─".repeat(wPer)}┬${"─".repeat(wRev)}┬${"─".repeat(wNet)}┬${"─".repeat(wEps)}┬${"─".repeat(wRoe)}┬${"─".repeat(wDer)}┬${"─".repeat(wPerRatio)}┬${"─".repeat(wPbv)}┐${RESET}`,
          );

          // Judul Kolom (Header Text)
          console.log(
            ` ${GRAY}│${RESET}${padColumn(" TAHUN", wYr)}${GRAY}│${RESET}${padColumn(" PERIOD", wPer)}${GRAY}│${RESET}${padColumn(" REVENUE", wRev, "right")}${GRAY}│${RESET}${padColumn(" NET PROFIT", wNet, "right")}${GRAY}│${RESET}${padColumn(" EPS", wEps, "right")}${GRAY}│${RESET}${padColumn(" ROE", wRoe, "right")}${GRAY}│${RESET}${padColumn(" DER", wDer, "right")}${GRAY}│${RESET}${padColumn(" PER", wPerRatio, "right")}${GRAY}│${RESET}${padColumn(" PBV", wPbv, "right")}${GRAY}│${RESET}`,
          );

          // Pembatas Header ke Data
          console.log(
            ` ${GRAY}├${"─".repeat(wYr)}┼${"─".repeat(wPer)}┼${"─".repeat(wRev)}┼${"─".repeat(wNet)}┼${"─".repeat(wEps)}┼${"─".repeat(wRoe)}┼${"─".repeat(wDer)}┼${"─".repeat(wPerRatio)}┼${"─".repeat(wPbv)}┤${RESET}`,
          );

          for (let hist of histories) {
            // Format text untuk nominal besar agar tidak terlalu panjang jika ada string bawaan dari scraper
            const displayRev = hist.revenue ? formatAbbr(hist.revenue) : "-";
            const displayNet = hist.net_profit
              ? formatAbbr(hist.net_profit)
              : "-";

            const cYr = padColumn(` ${hist.year}`, wYr);
            const cPer = padColumn(` ${hist.period}`, wPer);
            const cRev = padColumn(`${displayRev} `, wRev, "right");
            const cNet = padColumn(`${displayNet} `, wNet, "right");
            const cEps = padColumn(`${hist.eps ?? 0} `, wEps, "right");
            const cRoe = padColumn(`${hist.roe ?? 0}% `, wRoe, "right");
            const cDer = padColumn(`${hist.der ?? 0}x `, wDer, "right");
            const cPerRatio = padColumn(
              `${hist.per ?? 0}x `,
              wPerRatio,
              "right",
            );
            const cPbv = padColumn(`${hist.pbv ?? 0}x `, wPbv, "right");

            console.log(
              ` ${GRAY}│${RESET}${cYr}${GRAY}│${RESET}${cPer}${GRAY}│${RESET}${cRev}${GRAY}│${RESET}${cNet}${GRAY}│${RESET}${cEps}${GRAY}│${RESET}${cRoe}${GRAY}│${RESET}${cDer}${GRAY}│${RESET}${cPerRatio}${GRAY}│${RESET}${cPbv}${GRAY}│${RESET}`,
            );
          }

          // Border Bawah Tabel
          console.log(
            ` ${GRAY}└${"─".repeat(wYr)}┴${"─".repeat(wPer)}┴${"─".repeat(wRev)}┴${"─".repeat(wNet)}┴${"─".repeat(wEps)}┴${"─".repeat(wRoe)}┴${"─".repeat(wDer)}┴${"─".repeat(wPerRatio)}┴${"─".repeat(wPbv)}┘${RESET}\n`,
          );
        }
      } catch (err: any) {
        console.log(`❌ Gagal mengambil data detail emiten: ${err.message}\n`);
      }
      break;

    case "api":
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
        `❌ Perintah tidak dikenal: '${line.trim()}'. Ketik 'sync', 'list', 'detail <KODE>', 'clear', atau 'exit'.\n`,
      );
      break;
  }

  // Setelah blok perintah selesai di-print, lempar kembali prompt ke baris paling bawah
  rl.prompt();
}
