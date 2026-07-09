import { VERSION } from "../../config";
import { BG_GREEN, BG_RED, BOLD, CYAN, GREEN, RESET } from "./TUITheme";
import { getMarketStatus } from "../../utils/marketStatus";
import { fundamentalSyncState } from "../helper/runSyncDataAll";
import { TUI } from "./TUIDesignFormater";

const market = getMarketStatus();

export function TUIHead() {
  process.stdout.write("\x1b[2J\x1b[0;0H");
  const BOX_WIDTH = 118;

  console.log(TUI.spacer());
  console.log(
    ` ${GREEN}███████╗ █████╗ ██╗  ██╗ █████╗ ███╗   ███╗    ██████╗  ██████╗ ██╗███╗   ██╗████████╗${RESET}`,
  );
  console.log(
    ` ${GREEN}██╔════╝██╔══██╗██║  ██║██╔══██╗████╗ ████║    ██╔══██╗██╔═══██╗██║████╗  ██║╚══██╔══╝${RESET}`,
  );
  console.log(
    ` ${GREEN}███████╗███████║███████║███████║██╔████╔██║    ██████╔╝██║   ██║██║██╔██╗ ██║   ██║   ${RESET}`,
  );
  console.log(
    ` ${GREEN}╚════██║██╔══██║██╔══██║██╔══██║██║╚██╔╝██║    ██╔═══╝ ██║   ██║██║██║╚██╗██║   ██║   ${RESET}`,
  );
  console.log(
    ` ${GREEN}███████║██║  ██║██║  ██║██║  ██║██║ ╚═╝ ██║    ██║     ╚██████╔╝██║██║ ╚████║   ██║   ${RESET}`,
  );
  console.log(
    ` ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝    ╚═╝      ╚═════╝ ╚═╝╚═╝  ╚═══╝   ╚═╝   `,
  );
  console.log(TUI.spacer());
  console.log(TUI.divider("top"));

  // 1. Header Bar
  console.log(
    TUI.row(
      ` ${BOLD}Core Status Indicators${RESET}`,
      ` ${BOLD}Engine Terminal Control Hub${RESET}`,
      54,
      63,
    ),
  );

  // 2. Data Rows (Tinggal kopas pola ini)
  const fundStatus = fundamentalSyncState.isActive
    ? `${BG_GREEN}${BOLD} ACTIVE ⚡ ${RESET}`
    : `${BG_RED}${BOLD} STANDBY 💤 ${RESET}`;

  console.log(
    TUI.row(
      ` ➜ Engine Server : ${BG_GREEN}${BOLD}   ONLINE   ${RESET}`,
      ` sync           ➜ Menyalakan / Menjeda Siklus Antrean`,
      54,
      63,
    ),
  );

  console.log(
    TUI.row(
      ` ➜ Sync Status   : ${fundStatus}`,
      ` show emiten    ➜ Lihat Semua Emiten Terdaftar di DB`,
      54,
      63,
    ),
  );

  console.log(
    TUI.row(
      ` ➜ Market Status : ${market.label}${RESET}`,
      ` show endpoints ➜ Lihat Semua Endpoints Terdaftar sistem`,
      55,
      63,
    ),
  );

  console.log(
    TUI.row(
      ` ➜ Version       : Bedah Saham ${VERSION}`,
      ` detail <cmd>   ➜ Contoh: 'detail BBRI' untuk bedah emiten`,
      54,
      63,
    ),
  );

  console.log(
    TUI.row(
      ``,
      ` clear | exit   ➜ Bersihkan konsol | Matikan total core`,
      54,
      63,
    ),
  );

  console.log(TUI.emptyRow(54, 63));

  // 3. Footer/Links
  console.log(TUI.divider("middle"));
  console.log(
    TUI.fullRow(` ${BOLD}Live Network Endpoint Links${RESET}`, BOX_WIDTH),
  );
  console.log(
    TUI.fullRow(` ➜ Local API Gateway URL : ${CYAN}${URL}${RESET}`, BOX_WIDTH),
  );
  console.log(
    TUI.fullRow(
      ` ➜ Core Health Check     : ${CYAN}${URL}/api/health${RESET}`,
      BOX_WIDTH,
    ),
  );

  console.log(TUI.divider("bottom"));
  console.log(TUI.spacer());
}
