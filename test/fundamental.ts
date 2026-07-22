import { scrapeFundamentalTradingView } from "../src/scrapper/helper/scrapeFundamentalTradingView";
// 1. Import utilitas browser baru (sesuaikan path foldermu jika berbeda)
import { initPersistentBrowser } from "../src/utils/browser";

async function runTradingViewTest() {
  const ticker = "AYLS";
  console.log(
    `\n🔍 Memulai pengujian scraper TradingView untuk emiten: ${ticker}...`,
  );

  // 2. Siapkan persistent browser & context terproteksi
  const { browser, context } = await initPersistentBrowser();
  const startTime = performance.now();

  try {
    // 3. Oper context sebagai parameter kedua ke scraper fundamental
    const result = await scrapeFundamentalTradingView(ticker, context);
    const endTime = performance.now();

    console.log(`⏱️ Selesai dalam ${(endTime - startTime).toFixed(2)} ms\n`);

    if (!result) {
      console.error(
        "❌ Gagal! Scraper TradingView mengembalikan nilai false/kosong.",
      );
      console.error(
        "Kemungkinan penyebab: (1) Halaman 404 karena ticker salah; " +
          "(2) Terkena block proteksi bot Cloudflare; atau " +
          "(3) Selector utama 'waitSelector' mengalami timeout saat hidrasi.",
      );
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
    // 4. WAJIB: Selalu tutup browser di stage finally agar tidak meninggalkan zombie process di RAM
    await browser.close();
  }
}

runTradingViewTest();
