// test-profile.ts

import { scrapeYahooProfile } from "../src/scrapper";

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "max-age=0",
  Connection: "keep-alive",
};

async function runProfileTest() {
  // Menggunakan AMRT (Alfamart) sebagai sampel uji coba sesuai catatanmu
  const ticker = "CASH";
  const symbol = `${ticker.toUpperCase()}.JK`;

  console.log(
    `\n🔍 Memulai Pengujian Mandiri Scraper Profil Yahoo untuk: ${symbol}...`,
  );
  const startTime = performance.now();

  try {
    const url = `https://finance.yahoo.com/quote/${symbol}`;
    console.log(`📡 Fetching data dari ${url}...`);

    const response = await fetch(url, { headers: YAHOO_HEADERS });

    if (!response.ok) {
      throw new Error(`HTTP Error! Status: ${response.status}`);
    }

    const htmlText = await response.text();
    console.log("📥 HTML berhasil diunduh. Memulai parsing struktur data...");

    // Jalankan fungsi scraper profil kamu
    const profileData = scrapeYahooProfile(htmlText);
    const endTime = performance.now();

    console.log(`⏱️ Selesai dalam ${(endTime - startTime).toFixed(2)} ms\n`);
    console.log("======================================================");
    console.log("📊 HASIL EKSTRAKSI INTEGRITAS PROFIL & STATISTIK:");
    console.log("======================================================");
    console.dir(profileData, { colors: true, depth: null });
    console.log("======================================================");

    // Evaluasi integritas data untuk mendeteksi selektor yang jebol
    if (!profileData.description) {
      console.warn(
        "⚠️  Peringatan: 'description' bernilai null. Kemungkinan class 'yf-z5w6qk' sudah kedaluwarsa.",
      );
    }
    if (profileData.market_cap === 0) {
      console.warn(
        "⚠️  Peringatan: 'market_cap' bernilai 0. Periksa tabel 'quote-statistics-container'.",
      );
    }
  } catch (error: any) {
    console.error("\n❌ Pengujian Profil Gagal Akibat System Crash:");
    console.error(error?.message || error);
  }
}

runProfileTest();
