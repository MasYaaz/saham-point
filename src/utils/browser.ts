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
  const browser = await chromium.launch({ headless: true });
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
