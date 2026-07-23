import db from "../../db";
import { BOLD, GREEN, RESET } from "../component/TUITheme";
import type { EmitenItem } from "../../types";
import { formatAbbr } from "../../utils/scrapper/formatMoney";
import { TUI } from "../component/TUIDesignFormater";

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

export async function handleDetailEmiten(code: string) {
  const emiten = db
    .query("SELECT * FROM emiten WHERE UPPER(code) = ?")
    .get(code) as EmitenItem;
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
