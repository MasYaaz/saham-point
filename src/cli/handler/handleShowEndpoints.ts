import app from "../../endpoint";
import { BOLD, CYAN, GRAY, GREEN, RESET, YELLOW } from "../component/TUITheme";
import { padColumn } from "../component/TUITextFormat";

export function handleShowEndpoints() {
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
    console.log(` ${GRAY}┌${"─".repeat(wMethod)}┬${"─".repeat(wUrl)}┐${RESET}`);
    console.log(
      ` ${GRAY}│${RESET}${padColumn(` ${BOLD}METHOD${RESET}`, wMethod)}${GRAY}│${RESET}${padColumn(` ${BOLD}LIVE ENDPOINT URL LINKS${RESET}`, wUrl)}${GRAY}│${RESET}`,
    );
    console.log(` ${GRAY}├${"─".repeat(wMethod)}┼${"─".repeat(wUrl)}┤${RESET}`);

    // 2. Loop rute yang terdata di Hono
    for (const route of liveRoutes) {
      // Skip rute internal pencocokan massal jika ada (khas framework)
      if (route.path === "*") continue;

      // Pewarnaan Method (Hijau untuk GET, Kuning untuk POST, dll)
      const methodColor = route.method === "GET" ? GREEN : YELLOW;
      const formattedMethod = ` ${methodColor}${route.method}${RESET}`;

      // Gabungkan URL lokal dengan port aktif secara dinamis
      const fullUrl = ` ${URL}${route.path}`;
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
}
