import { fetchEmitenNews } from "../src/services/newsService"; // Sesuaikan path jika berbeda (misal: "../services/newsService")

async function testNewsScraper() {
  console.log("🚀 Starting News Scraper Test...\n");

  const testCases = [
    { symbol: "RANS", name: "PT Rans Entertainment Indonesia Tbk" },
  ];

  for (const emiten of testCases) {
    console.log(`==================================================`);
    console.log(`🔍 Testing Ticker: [${emiten.symbol}] - ${emiten.name}`);
    console.log(`==================================================`);

    const startTime = Date.now();
    try {
      // Memanggil fetcher berita RSS murni (2 minggu terakhir)
      const news = await fetchEmitenNews(
        emiten.symbol,
        emiten.name,
        "id",
        14, // maxDays
      );
      const duration = Date.now() - startTime;

      console.log(`⏱️ Total Execution Time : ${duration} ms`);
      console.log(`📰 Total News Found      : ${news.length} items\n`);

      if (news.length === 0) {
        console.log("⚠️ Tidak ada berita dalam 2 minggu terakhir.\n");
        continue;
      }

      console.log(`📌 Hasil Fetching Berita (${news.length} Item):`);
      news.forEach((item, index) => {
        console.log(`\n  ${index + 1}. [${item.source}] ${item.title}`);
        console.log(`     📅 Published : ${item.published}`);
        console.log(`     🔗 Link      : ${item.url}`);
        console.log(`     📝 Summary   : ${item.summary || "-"}`);
      });

      // Validasi Tanggal Terlama (Harus <= 14 hari)
      const oldestNews = news[news.length - 1];
      if (oldestNews) {
        const oldestDate = new Date(oldestNews.published);
        const daysDiff = Math.floor(
          (Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        console.log(
          `\n⏳ Berita Paling Lama: ${daysDiff} hari yang lalu (${oldestNews.published})`,
        );
      }
    } catch (error) {
      console.error(`❌ Error fetching news for ${emiten.symbol}:`, error);
    }

    console.log("\n");
  }
}

// Jalankan Test
testNewsScraper();
