import { scrapeTradingViewProfile } from "../src/cli/scraper/helper/scrapeProfileTradingView";
import {
  createBatchContext,
  getOrInitBrowser,
} from "../src/utils/scrapper/browserManager";

async function runProfileTest() {
  const ticker = "AYLS";
  const symbol = `IDX-${ticker.toUpperCase()}`;

  console.log(
    `\n🔍 Memulai Pengujian Mandiri Scraper Profil TradingView untuk: ${symbol}...`,
  );

  // Siapkan persistent browser & context terproteksi
  // Ambil instance Browser global (tidak akan relaunch jika sudah ada)
  const browser = await getOrInitBrowser().catch((e) => {
    throw new Error(`CRITICAL_BROWSER_FAILURE: ${e.message}`);
  });

  // Buat BrowserContext baru yang super ringan khusus untuk batch ini
  const context = await createBatchContext(browser).catch((e) => {
    throw new Error(`CRITICAL_CONTEXT_FAILURE: ${e.message}`);
  });

  const startTime = performance.now();

  try {
    console.log(
      `📡 Membuka halaman https://www.tradingview.com/symbols/${symbol}/ via Playwright...`,
    );

    // scrapeTradingViewProfile sudah mencakup render Playwright + parsing cheerio
    const profileData = await scrapeTradingViewProfile(symbol, context);
    const endTime = performance.now();

    console.log(`⏱️ Selesai dalam ${(endTime - startTime).toFixed(2)} ms\n`);

    console.log("======================================================");
    console.log("📊 HASIL EKSTRAKSI INTEGRITAS PROFIL & STATISTIK:");
    console.log("======================================================");
    console.dir(profileData, { colors: true, depth: null });
    console.log("======================================================");

    // // Evaluasi integritas data berdasarkan ScrapedProfile yang baru
    // if (!profileData.description) {
    //   console.warn(
    //     "⚠️  Peringatan: 'description' bernilai null. Periksa selector 'p[class*=\"description-\"]'.",
    //   );
    // }

    // if (profileData.market_cap === 0) {
    //   console.warn(
    //     "⚠️  Peringatan: 'market_cap' bernilai 0. Periksa label 'Market capitalization' atau 'Market cap'.",
    //   );
    // }

    // if (profileData.per === 0) {
    //   console.warn(
    //     "⚠️  Peringatan: 'per' (P/E Ratio) bernilai 0. Periksa label 'Price to earnings Ratio (TTM)' atau 'P/E'.",
    //   );
    // }

    // if (profileData.eps === 0) {
    //   console.warn(
    //     "⚠️  Peringatan: 'eps' bernilai 0. Periksa label 'Basic EPS (TTM)'.",
    //   );
    // }

    // if (profileData.beta === 0) {
    //   console.warn(
    //     "⚠️  Peringatan: 'beta' bernilai 0. Jika data lain keluar tapi beta tetap 0, pertimbangkan ganti target URL ke ringkasan utama.",
    //   );
    // }

    // if (profileData.last_dividend === 0) {
    //   console.info(
    //     "ℹ️  Info: 'last_dividend' bernilai 0. (Wajar jika emiten memang sedang tidak membagikan dividen, atau periksa label 'Last payment').",
    //   );
    // }
  } catch (error: any) {
    console.error("\n❌ Pengujian Profil Gagal Akibat System Crash:");
    console.error(error?.message || error);
  } finally {
    // 4. WAJIB: Selalu tutup browser di stage finally agar tidak meninggalkan zombie process di RAM
    await browser.close();
  }
}

runProfileTest();
