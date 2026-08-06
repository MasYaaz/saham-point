import { analyzeEmitenDividend } from "../src/services/analyzerService/DividendAnalyzer"; // Sesuaikan path file kamu

async function testDividendAnalyzer() {
  const testTickers = ["ADRO", "BBCA", "PTBA", "AMRT"];

  console.log("==================================================");
  console.log("🚀 MEMULAI TESTER DIVIDEND ANALYZER");
  console.log("==================================================\n");

  for (const ticker of testTickers) {
    console.log(`⏳ Menganalisis dividen untuk emiten: ${ticker}...`);
    const startTime = performance.now();

    try {
      const result = analyzeEmitenDividend(ticker);
      const duration = (performance.now() - startTime).toFixed(0);

      console.log(`\n==================================================`);
      console.log(`📊 PERFORMA DIVIDEN: ${result.code} - ${result.name}`);
      console.log(`==================================================`);
      console.log(
        `Harga Terakhir : Rp ${result.last_price.toLocaleString("id-ID")}`,
      );
      console.log(`TTM DPS        : Rp ${result.ttm_dps}`);
      console.log(`Dividend Yield : ${result.current_yield}%`);
      console.log(
        `CAGR 3 Tahun   : ${result.cagr_3y !== null ? `${result.cagr_3y}%` : "N/A"}`,
      );
      console.log(
        `CAGR 5 Tahun   : ${result.cagr_5y !== null ? `${result.cagr_5y}%` : "N/A"}`,
      );
      console.log(
        `Streak Dividen : ${result.consecutive_years_paid} tahun berturut-turut`,
      );
      console.log(`Safety Rating  : [ ${result.safety_rating} ]`);

      console.log("\n📌 Catatan Keamanan Dividen:");
      for (const note of result.safety_notes) {
        console.log(`   - ${note}`);
      }

      if (result.latest_event) {
        console.log("\n🗓️ Event Dividen Terbaru:");
        console.log(`   Tipe    : ${result.latest_event.type}`);
        console.log(`   Nominal : Rp ${result.latest_event.cash_dividend}`);
        console.log(`   Ex-Date : ${result.latest_event.ex_date}`);
        console.log(`   Pay-Date: ${result.latest_event.payment_date}`);
      }

      if (result.annual_breakdown.length > 0) {
        console.log("\n📈 Break-down Dividen Tahunan:");
        console.table(
          result.annual_breakdown.map((item) => ({
            Tahun: item.year,
            TotalDPS: `Rp ${item.total_dps}`,
            Interim: `Rp ${item.interim_dps}`,
            Final: `Rp ${item.final_dps}`,
            Special: `Rp ${item.special_dps}`,
            PayoutCount: item.payout_count,
            EPS: item.eps !== null ? `Rp ${item.eps}` : "N/A",
            DPR: item.dpr !== null ? `${item.dpr}%` : "N/A",
          })),
        );
      }

      console.log(`⚡ Selesai dalam ${duration}ms\n`);
    } catch (error: any) {
      console.error(
        `❌ [ERROR] Gagal menganalisis dividen '${ticker}':`,
        error.message,
      );
    }

    console.log("--------------------------------------------------\n");
  }

  console.log("🎉 Test Analyzer Selesai!");
  process.exit(0);
}

// Jalankan skrip tester
testDividendAnalyzer();
