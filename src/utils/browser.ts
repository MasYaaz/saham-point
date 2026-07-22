import { chromium, type Browser, type BrowserContext } from "playwright";
import { TRADINGVIEW_HEADERS } from "../config";

interface PersistentBrowser {
  browser: Browser;
  context: BrowserContext;
}

/**
 * FIX (kandidat kuat penyebab stuck setelah ~menit ke-10 / putaran kedua
 * syncDataAll): chromium.launch() dan browser.newContext() sebelumnya TIDAK
 * dibungkus timeout sama sekali — satu-satunya titik di seluruh alur browser
 * yang tidak dijaga. Kalau proses Chrome sebelumnya (dari batch sebelumnya)
 * menjadi zombie/tidak sepenuhnya mati (mis. karena browser.close() gagal
 * bersih di batch itu) dan menggerus resource container (RAM/CPU/handle),
 * chromium.launch() batch berikutnya bisa HANG menunggu OS alih-alih reject
 * dengan error. `.catch()` di sisi pemanggil (syncDataAll.ts) hanya menangkap
 * promise yang REJECT, bukan yang hang, sehingga seluruh proses sync bisa
 * membeku permanen persis di awal panggilan initPersistentBrowser().
 *
 * withTimeout mengubah kemungkinan "hang selamanya" menjadi "reject setelah
 * batas waktu wajar", yang SUDAH ditangani rapi oleh syncDataAll.ts lewat
 * mekanisme CRITICAL_BROWSER_FAILURE (menghentikan loop secara terhormat,
 * bukan freeze).
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${label} melebihi batas waktu ${ms}ms — kemungkinan proses browser hang atau resource OS habis.`,
        ),
      );
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

const LAUNCH_TIMEOUT = 30000; // Waktu wajar untuk spawn proses Chrome baru
const CONTEXT_TIMEOUT = 15000; // Waktu wajar untuk membuat browser context baru

/**
 * Menginisialisasi headless browser dan context terproteksi.
 * Sudah dilengkapi dengan global interceptor untuk memblokir asset berat.
 *
 * Catatan: meski namanya "Persistent", fungsi ini SELALU melakukan
 * chromium.launch() baru di setiap panggilan (tidak memakai
 * launchPersistentContext/user-data-dir, dan tidak menyimpan singleton
 * module-level). Nama ini agak menyesatkan — pertimbangkan mengganti nama
 * jadi initBrowser()/initScrapingBrowser() supaya tidak dikira reuse browser
 * antar panggilan.
 */
export async function initPersistentBrowser(): Promise<PersistentBrowser> {
  const browser = await withTimeout(
    chromium.launch({
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
        "--js-flags=--max-old-space-size=512",
      ],
    }),
    LAUNCH_TIMEOUT,
    "chromium.launch()",
  );

  try {
    const context = await withTimeout(
      browser.newContext({
        userAgent: TRADINGVIEW_HEADERS["User-Agent"],
        locale: "en-US",
        viewport: { width: 1280, height: 800 },
      }),
      CONTEXT_TIMEOUT,
      "browser.newContext()",
    );

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
  } catch (err) {
    // FIX: kalau newContext() gagal/timeout, browser yang sudah terlanjur
    // launch harus ditutup paksa di sini juga — sebelumnya kalau exception
    // terjadi di titik ini, browser yang sudah hidup tidak pernah di-close
    // oleh siapa pun (pemanggil di syncDataAll.ts hanya punya `browser` dan
    // `context` setelah initPersistentBrowser() RESOLVE, jadi kalau reject di
    // tengah jalan, referensi browser yang sudah terlanjur launch itu hilang
    // dari jangkauan pemanggil -> proses Chrome jadi zombie permanen).
    await browser.close().catch(() => {});
    throw err;
  }
}
