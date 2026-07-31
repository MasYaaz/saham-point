import { getForeignFlow } from "../src/services/foreignFlowService";
import { getWeekdaysInRange } from "../src/utils/mcp/getWeeksDay";

export async function testForeignFlow(ticker = "BBCA") {
  console.log("--------------------------------------------------");
  console.log(`2️⃣ Testing: Foreign Flow Service (${ticker})`);
  console.log("--------------------------------------------------");
  const startTime = Date.now();

  try {
    // Ambil tanggal hari kerja dan bersihkan dari format "YYYY-MM-DD" menjadi "YYYYMMDD"
    const rawDates = getWeekdaysInRange("2026-07-20", "2026-07-24");
    const formattedDates = rawDates.map((d) => d.replace(/-/g, ""));

    const foreignFlow = await getForeignFlow({
      code: ticker,
      dates: formattedDates,
    });

    console.log(
      `📌 Ticker                 : ${foreignFlow.code} (${foreignFlow.stockName || "N/A"})`,
    );
    console.log(
      `📅 Periode                : ${foreignFlow.periodDays} Hari Bursa`,
    );
    console.log(
      `💰 Cum Net Foreign Value  : Rp ${foreignFlow.cumulativeNetForeignValue.toLocaleString("id-ID")}`,
    );
    console.log(
      `📦 Cum Net Foreign Volume : ${foreignFlow.cumulativeNetForeignVolume.toLocaleString("id-ID")} lembar\n`,
    );

    console.log("📈 Histori Transaksi Harian Asing:");
    console.table(
      foreignFlow.dailyFlows.map((df) => ({
        Tanggal: df.date,
        "Close Price": df.closePrice.toLocaleString("id-ID"),
        "Net Value (Rp)": df.netForeignValue.toLocaleString("id-ID"),
        "Net Vol (Lbr)": df.netForeignVolume.toLocaleString("id-ID"),
        Status: df.netForeignValue >= 0 ? "🟢 Net BUY" : "🔴 Net SELL",
      })),
    );
  } catch (err) {
    console.error("❌ Foreign Flow Error:", err);
  } finally {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("--------------------------------------------------");
    console.log(`⏱️ Waktu Pengujian: ${duration} detik`);
    console.log("✨ Pengujian Foreign Flow Selesai.");
  }
}

if (import.meta.main || process.argv[1]?.includes("testForeignFlow")) {
  testForeignFlow();
}
