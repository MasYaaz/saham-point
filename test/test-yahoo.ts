// test-yahoo.ts

import { scrapeFundamentalYahoo } from "../src/scrapper/helper/scrapeFundamentalYahoo";

async function runYahooTest() {
  const ticker = "CARE"; // Sumber uji coba saham Alfamart
  console.log(
    `\n🔍 Memulai pengujian gabungan scraper Yahoo Finance untuk emiten: ${ticker}...`,
  );

  const startTime = performance.now();
  const result = await scrapeFundamentalYahoo(ticker);
  const endTime = performance.now();

  console.log(`⏱️ Selesai dalam ${(endTime - startTime).toFixed(2)} ms\n`);

  if (!result) {
    console.error("❌ Gagal! Scraper Yahoo mengembalikan nilai null.");
    console.error(
      "Kemungkinan penyebab: Terblokir bot protection (Cloudflare/Access Denied) atau emiten tidak ditemukan.",
    );
    return;
  }

  console.log(
    "✅ BERHASIL! Berikut adalah data tahunan (FY) murni + Rasio Mandiri yang berhasil diekstrak:\n",
  );
  console.dir(result, { depth: null, colors: true });
}

runYahooTest();
