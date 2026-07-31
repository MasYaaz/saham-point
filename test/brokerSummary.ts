import { getBrokerSummary } from "../src/services/brokerSummaryService";
import { getWeekdaysInRange } from "../src/utils/mcp/getWeeksDay";

export async function runTest() {
  console.log(
    "🚀 Memulai pengujian Broker Summary Service (Native Fetch)...\n",
  );

  // Ambil tanggal hari kerja dan bersihkan dari format "YYYY-MM-DD" menjadi "YYYYMMDD"
  const rawDates = getWeekdaysInRange("2026-02-01", "2026-02-26");
  const formattedDates = rawDates.map((d) => d.replace(/-/g, ""));

  const testInput = {
    ticker: "AMRT",
    dates: formattedDates,
  };

  const startTime = Date.now();

  try {
    console.log(`📡 Menarik data broker summary untuk ${testInput.ticker}...`);
    const result = await getBrokerSummary(testInput);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Berhasil menarik data dalam ${duration} detik!\n`);

    // 1. Tampilkan Info Ringkasan
    console.log("==================================================");
    console.log(` TIKKER          : ${result.ticker}`);
    console.log(
      ` PERIODE         : ${result.periodDays} Hari (${result.dates.join(", ")})`,
    );
    console.log(
      ` TOTAL VOLUME    : ${result.grandTotalVolume.toLocaleString("id-ID")} lembar`,
    );
    console.log(
      ` TOTAL VALUE     : Rp ${result.grandTotalValue.toLocaleString("id-ID")}`,
    );
    console.log(
      ` TOTAL FREKUENSI : ${result.grandTotalFrequency.toLocaleString("id-ID")} x`,
    );
    console.log("==================================================\n");

    // 2. Tampilkan Top 10 Broker dalam bentuk Tabel Rapi
    console.log("=== TOP 10 BROKER PALING AKTIF BY VALUE ===");
    console.table(
      result.topBrokersByValue.map((b) => ({
        Kode: b.code,
        "Nama Sekuritas":
          b.name.length > 25 ? b.name.substring(0, 22) + "..." : b.name,
        "Total Value (Rp)": b.totalValue.toLocaleString("id-ID"),
        "Total Volume": b.totalVolume.toLocaleString("id-ID"),
        "Avg Price (Rp)": b.avgPrice.toLocaleString("id-ID"),
        Frekuensi: b.totalFrequency.toLocaleString("id-ID"),
      })),
    );

    console.log(
      `\nℹ️ Total seluruh broker yang bertransaksi: ${result.allBrokers.length} broker.`,
    );
  } catch (error) {
    console.error("❌ Pengujian Gagal dengan Error:", error);
  } finally {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n⏱️ Total Waktu Eksekusi: ${duration} detik`);
    console.log("✨ Pengujian selesai.");
  }
}

// Support eksekusi langsung via CLI
if (import.meta.main || process.argv[1]?.includes("testBrokerSummary")) {
  runTest();
}
