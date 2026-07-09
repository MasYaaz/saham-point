import db from "../../db";
import { BG_GREEN, BG_RED, BOLD, GREEN, RESET } from "../component/TUITheme";
import { TUI } from "../component/TUIDesignFormater";

// Logika List Emiten
export async function handleShowEmiten() {
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
