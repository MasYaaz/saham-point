import { searchNews } from "../src/services/newsServices/searchNews";

async function testNewsScraper() {
  console.log("🚀 Starting News Scraper Test...\n");

  // Satu contoh test case
  const testCase = {
    label: "Emiten Specific (RANS)",
    query: "prospek RANS Entertainment",
    time: 30,
    limit: 10,
    lang: "id" as const,
  };

  console.log(`==================================================`);
  console.log(`🔍 Test Case: ${testCase.label}`);
  console.log(`==================================================`);

  const startTime = Date.now();
  try {
    // Memanggil fetchNewsByQuery(query, time, limit, lang)
    const news = await searchNews(
      testCase.query,
      testCase.time,
      testCase.limit,
      testCase.lang,
    );

    const duration = Date.now() - startTime;

    console.log(`⏱️ Execution Time : ${duration} ms`);
    console.log(`📰 Total News Found : ${news.length} items\n`);

    if (news.length === 0) {
      console.log("⚠️ Tidak ada berita ditemukan.\n");
      return;
    }

    news.forEach((item, index) => {
      console.log(`📌 Item #${index + 1} [${item.source}]`);
      console.log(`   Title     : ${item.title}`);
      console.log(`   Published : ${item.published}`);
      console.log(`   Link      : ${item.url}`);
      console.log(`   content   : ${item.content}`);
      console.log(`--------------------------------------------------`);
    });
  } catch (error) {
    console.error(`❌ Error executing test '${testCase.label}':`, error);
  }

  console.log("\n");
}

// Jalankan Tes
testNewsScraper();
