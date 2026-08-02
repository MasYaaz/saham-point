import { fetchStockHistories } from "../src/services/tradingviewServices/fetchWebSocket";

async function testSymbol(symbol: string) {
  console.log(`\n[TEST] Fetching full quarterly history for ${symbol}...`);

  try {
    const data = await fetchStockHistories(symbol);

    const quarters = Object.keys(data.by_quarter);
    const years = Object.keys(data.by_fy);

    console.log(" Output Received Successfully!");
    console.log("Symbol:", data.symbol);
    console.log("Total Quarters Fetched:", quarters.length);
    console.log("Total Years Fetched:", years.length);

    // Pastikan array tidak kosong sebelum diakses
    if (quarters.length > 0 && years.length > 0) {
      const latestQuarter = quarters[0]!; // Tambahkan tanda '!' (non-null assertion)
      const latestYear = years[0]!;
      console.log(`Sample Data Terbaru (${latestQuarter}):`);
      console.log(JSON.stringify(data.by_quarter[latestQuarter], null, 2));
      console.log(`Sample Data Terbaru (${latestYear}):`);
      console.log(JSON.stringify(data.by_fy[latestYear], null, 2));
    } else {
      console.log("⚠️ Tidak ada data kuartal yang ditemukan.");
    }
  } catch (error: any) {
    console.error(" Failed to fetch data:", error.message);
  }
}

// Jalankan test
await testSymbol("IDX:ADRO");
await testSymbol("IDX:SIDO");
await testSymbol("IDX:ADMR");
