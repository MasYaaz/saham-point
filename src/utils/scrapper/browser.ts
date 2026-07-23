import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { execSync } from "child_process";
import { TRADINGVIEW_HEADERS } from "../../config";

let globalBrowser: Browser | null = null;

const LAUNCH_TIMEOUT = 30000;
const CONTEXT_TIMEOUT = 15000;

/**
 * Helper Timeout yang AMAN dari Zombie Resource Leak.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  onLateResolve?: (resource: T) => void | Promise<void>,
): Promise<T> {
  let isTimedOut = false;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      isTimedOut = true;
      reject(
        new Error(
          `${label} melebihi batas waktu ${ms}ms — kemungkinan proses browser hang atau resource OS habis.`,
        ),
      );
    }, ms);

    promise
      .then(async (value) => {
        if (isTimedOut) {
          if (onLateResolve) {
            try {
              await onLateResolve(value);
            } catch {
              // Ignore cleanup error
            }
          }
          return;
        }
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        if (!isTimedOut) {
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

/**
 * 🗡️ FUNGSI KHUSUS FORCE KILL BROWSER (Fallback Cleanup)
 */
export async function closeBrowserForcefully(
  browser: Browser | null | undefined,
  timeoutMs: number = 10000,
): Promise<void> {
  if (!browser) return;

  try {
    await withTimeout(browser.close(), timeoutMs, "browser.close()");
  } catch (err) {
    try {
      if (process.platform === "linux") {
        execSync("pkill -9 -f 'type=renderer' || true");
      }
    } catch {
      // Abaikan jika tidak ada proses tersisa
    }
  }
}

/**
 * 🌐 SINGLETON BROWSER MANAGER
 * Mengambil atau menginisialisasi biner Chromium tunggal yang hidup sepanjang siklus sync.
 */
export async function getOrInitBrowser(): Promise<Browser> {
  if (!globalBrowser || !globalBrowser.isConnected()) {
    globalBrowser = await withTimeout(
      chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-blink-features=AutomationControlled",
          "--js-flags=--max-old-space-size=512",
        ],
      }),
      LAUNCH_TIMEOUT,
      "chromium.launch()",
      async (b) => await closeBrowserForcefully(b, 5000),
    );
  }
  return globalBrowser;
}

/**
 * ⚡ BATCH CONTEXT FACTORY
 * Membuat BrowserContext baru yang super ringan (<10ms) untuk 1 batch scraping.
 */
export async function createBatchContext(
  browser: Browser,
): Promise<BrowserContext> {
  const context = await withTimeout(
    browser.newContext({
      userAgent: TRADINGVIEW_HEADERS["User-Agent"],
      locale: "en-US",
      viewport: { width: 1280, height: 800 },
    }),
    CONTEXT_TIMEOUT,
    "browser.newContext()",
    async (ctx) => await ctx.close().catch(() => {}),
  );

  // Interceptor Asset & Telemetry
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
      route.abort().catch(() => {});
    } else {
      route.continue().catch(() => {});
    }
  });

  return context;
}

/**
 * 🧹 SHUTDOWN CLEANUP
 * Menutup browser global secara bersih saat seluruh proses sync selesai total.
 */
export async function closeGlobalBrowser(): Promise<void> {
  if (globalBrowser) {
    await closeBrowserForcefully(globalBrowser, 5000);
    globalBrowser = null;
  }
}

/**
 * 🛡️ FUNGSI KHUSUS PENDETEKSI CLOUDFLARE / CAPTCHA (Native Playwright Locator)
 */
export async function checkIfBlockedByCaptcha(
  page: Page,
  responseStatus?: number | null,
): Promise<{ isBlocked: boolean; reason?: string }> {
  try {
    // 1. Cek Status Code
    if (
      responseStatus === 403 ||
      responseStatus === 503 ||
      responseStatus === 429
    ) {
      return {
        isBlocked: true,
        reason: `HTTP Status Code terdeteksi antibot: ${responseStatus}`,
      };
    }

    // 2. Cek Judul Halaman
    const title = await page.title().catch(() => "");
    const titleLower = title.toLowerCase();

    if (
      titleLower.includes("just a moment") ||
      titleLower.includes("attention required") ||
      titleLower.includes("cloudflare") ||
      titleLower.includes("access denied") ||
      titleLower.includes("security check")
    ) {
      return {
        isBlocked: true,
        reason: `Judul halaman terdeteksi challenge: "${title}"`,
      };
    }

    // 3. Cek Elemen DOM via Locator Native Playwright
    const hasIframe =
      (await page
        .locator('iframe[src*="challenges.cloudflare.com"]')
        .count()
        .catch(() => 0)) > 0;

    const hasCfIds =
      (await page
        .locator(
          "#challenge-running, #challenge-form, .cf-turnstile, #cf-wrapper",
        )
        .count()
        .catch(() => 0)) > 0;

    const bodyText = (
      await page
        .locator("body")
        .innerText()
        .catch(() => "")
    ).toLowerCase();

    const hasText =
      bodyText.includes("verify you are human") ||
      bodyText.includes("checking your browser") ||
      bodyText.includes("enable javascript and cookies");

    if (hasIframe || hasCfIds || hasText) {
      return {
        isBlocked: true,
        reason: "Elemen DOM Cloudflare CAPTCHA / Turnstile terdeteksi.",
      };
    }

    return { isBlocked: false };
  } catch (err) {
    return { isBlocked: false };
  }
}
