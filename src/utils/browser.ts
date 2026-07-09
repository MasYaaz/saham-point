import { chromium, type Browser, type BrowserContext } from "playwright";
import { TRADINGVIEW_HEADERS } from "../config";

interface PersistentBrowser {
  browser: Browser;
  context: BrowserContext;
}

/**
 * Menginisialisasi headless browser dan context terproteksi (Persistent).
 * Sudah dilengkapi dengan global interceptor untuk memblokir asset berat.
 */
export async function initPersistentBrowser(): Promise<PersistentBrowser> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox", // Wajib di Docker agar proses Chrome tidak ditolak OS Container
      "--disable-setuid-sandbox", // Mematikan layer sandbox tambahan yang bikin gantung
      "--disable-dev-shm-usage", // Memaksa Chrome pakai /tmp jika shared memory container bermasalah
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-blink-features=AutomationControlled", // Menyembunyikan flag "bot/automation" dari deteksi TradingView
      "--js-flags=--max-old-space-size=256",
    ],
  });

  const context = await browser.newContext({
    userAgent: TRADINGVIEW_HEADERS["User-Agent"],
    locale: "en-US",
    viewport: { width: 1280, height: 800 },
  });

  // Pasang pemblokir gambar, font, dan pelacak telemetry secara global pada context
  await context.route("**/*", (route) => {
    const request = route.request();
    const type = request.resourceType();
    const url = request.url();

    if (
      ["image", "font", "media"].includes(type) ||
      url.includes("google-analytics") ||
      url.includes("snowplow") ||
      url.includes("telemetry")
    ) {
      route.abort();
    } else {
      route.continue();
    }
  });

  return { browser, context };
}
