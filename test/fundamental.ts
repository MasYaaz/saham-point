import fs from "node:fs/promises";
import path from "node:path";
import { scrapeFundamentalTradingView } from "../src/services/scraperService/helper/scrapeStockHistories";
import {
  createBatchContext,
  getOrInitBrowser,
} from "../src/utils/scrapper/browserManager";

async function runTradingViewTest() {
  const ticker = "ADRO";
  console.log(
    `\n🔍 Memulai pengujian scraper TradingView untuk emiten: ${ticker}...`,
  );

  // Siapkan persistent browser & context terproteksi
  const browser = await getOrInitBrowser().catch((e) => {
    throw new Error(`CRITICAL_BROWSER_FAILURE: ${e.message}`);
  });

  const context = await createBatchContext(browser).catch((e) => {
    throw new Error(`CRITICAL_CONTEXT_FAILURE: ${e.message}`);
  });

  const startTime = performance.now();

  try {
    const result = await scrapeFundamentalTradingView(ticker, context);
    const endTime = performance.now();

    console.log(`⏱️ Selesai dalam ${(endTime - startTime).toFixed(2)} ms\n`);

    if (!result) {
      console.error(
        "❌ Gagal! Scraper TradingView mengembalikan nilai false/kosong.\n",
      );

      // ======================================================================
      // AUTOMATIC DIAGNOSTIC & DEBUG CAPTURE
      // ======================================================================
      console.log(
        "📸 Menjalankan diagnostik halaman & mengambil screenshot...",
      );

      const symbol =
        ticker.toUpperCase() === "IHSG"
          ? "IDX-COMPOSITE"
          : `IDX-${ticker.toUpperCase()}`;
      const debugUrl = `https://www.tradingview.com/symbols/${symbol}/financials-income-statement/?statements-period=FY`;

      const debugPage = await context.newPage();

      try {
        const response = await debugPage.goto(debugUrl, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });

        const status = response?.status();
        const pageTitle = await debugPage.title();
        const finalUrl = debugPage.url();

        console.log(`\n--- RESULT INSPECTION ---`);
        console.log(`[Debug] Target URL    : ${debugUrl}`);
        console.log(`[Debug] Final URL     : ${finalUrl}`);
        console.log(`[Debug] HTTP Status   : ${status}`);
        console.log(`[Debug] Page Title    : "${pageTitle}"`);

        // Tunggu 3 detik untuk hidrasi JS React/Next.js
        await debugPage.waitForTimeout(3000);

        // 1. Simpan Screenshot Full Page
        const screenshotPath = path.resolve(
          process.cwd(),
          "debug_tradingview.png",
        );
        await debugPage.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Screenshot tersimpan di : ${screenshotPath}`);

        // 2. Simpan File HTML Mentah
        const html = await debugPage.content();
        const htmlPath = path.resolve(process.cwd(), "debug_tradingview.html");
        await fs.writeFile(htmlPath, html, "utf-8");
        console.log(`📄 HTML Dump tersimpan di  : ${htmlPath}`);

        // 3. Inspeksi Elemen Tabel Utama
        const dataNameCount = await debugPage.locator("[data-name]").count();
        console.log(`📊 Elemen [data-name] ditemukan: ${dataNameCount}`);

        console.log(`\n--- DIAGNOSA SEMENTARA ---`);
        if (
          status === 403 ||
          pageTitle.includes("Just a moment") ||
          pageTitle.includes("Cloudflare")
        ) {
          console.error(
            "⛔ TERBLOKIR CAPTCHA / CLOUDFLARE: Browser terdeteksi sebagai bot oleh TradingView.",
          );
        } else if (finalUrl !== debugUrl && !finalUrl.includes(symbol)) {
          console.error(
            "⛔ REDIRECT ERROR: Ticker mungkin tidak ditemukan di TradingView (404/Redirect).",
          );
        } else if (dataNameCount === 0) {
          console.error(
            "⛔ HYDRATION TIMEOUT: Elemen [data-name] belum ter-render saat scraping berjalan.",
          );
        } else {
          console.warn(
            "⚠️ ELEMEN ADA: DOM berhasil dimuat, tetapi fungsi parser Cheerio perlu penyesuaian.",
          );
        }
      } catch (debugErr) {
        console.error("❌ Gagal saat menjalankan inspeksi debug:", debugErr);
      } finally {
        await debugPage.close().catch(() => {});
      }

      return;
    }

    console.log(
      "✅ BERHASIL! Berikut adalah data statistik & rasio tahunan (FY) per periode " +
        "yang berhasil diekstrak:\n",
    );
    console.dir(result, { depth: null, colors: true });
  } catch (error) {
    console.error(
      "❌ Terjadi kesalahan tak terduga saat menjalankan test:",
      error,
    );
  } finally {
    // Selalu tutup browser di stage finally agar tidak meninggalkan zombie process di RAM
    await browser.close();
  }
}

runTradingViewTest();
