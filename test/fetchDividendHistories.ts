import { fetchDividendHistories } from "../src/services/tradingviewServices/fetchDividendHistories";

async function testDividendFetcher() {
  const testSymbols = ["IDX:BBCA", "IDX:ADRO", "IDX:AMRT"];

  console.log("==================================================");
  console.log("🚀 MEMULAI TESTER WEBSOCKET DIVIDEND TRADINGVIEW");
  console.log("==================================================\n");

  for (const symbol of testSymbols) {
    console.log(`⏳ Fetching data dividen untuk ${symbol}...`);
    const startTime = performance.now();

    try {
      const result = await fetchDividendHistories(symbol);
      const duration = (performance.now() - startTime).toFixed(0);

      console.log(
        `✅ [SUCCESS] ${symbol} | Total Event: ${result.total_events} | Durasi: ${duration}ms\n`,
      );

      if (result.data.length > 0) {
        // Tampilkan 5 record dividen terbaru dalam format tabel terminal
        console.table(
          result.data.slice(0, 5).map((item) => ({
            Symbol: item.symbol,
            Tahun: item.year,
            DPS: `Rp ${item.cash_dividend}`,
            Type: item.type,
            ExDate: item.ex_date,
            RecordDate: item.record_date,
            PayDate: item.payment_date,
          })),
        );
      } else {
        console.log(
          `⚠️ Emiten ${symbol} tidak memiliki histori pembagian dividen.\n`,
        );
      }
    } catch (error: any) {
      console.error(`❌ [ERROR] Gagal fetch dividen ${symbol}:`, error.message);
    }

    console.log("--------------------------------------------------\n");
  }

  console.log("🎉 Test Selesai!");
  process.exit(0);
}

// Jalankan fungsi tester
testDividendFetcher();
