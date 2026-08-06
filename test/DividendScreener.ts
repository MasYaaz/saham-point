import { screenDividends } from "../src/services/screenerServices/Dividend";

async function testDividendScreener() {
  console.log("==================================================");
  console.log("🚀 MEMULAI TESTER DIVIDEND SCREENER");
  console.log("==================================================\n");

  const scenarios = [
    {
      name: "1. Default High Yield (Yield >= 5%, DER <= 1.5, Streak >= 3Y)",
      options: {
        minYield: 5.0,
        maxDpr: 100,
        minStreak: 3,
        maxDer: 1.5,
        limit: 10,
      },
    },
    {
      name: "2. Dividen Aristocrats / Konsisten (Yield >= 3%, Streak >= 5Y, DPR <= 80%)",
      options: {
        minYield: 3.0,
        maxDpr: 80,
        minStreak: 5,
        maxDer: 1.0,
        limit: 10,
      },
    },
    {
      name: "3. High Yield Tanpa Limit DPR (Deteksi Potensi Dividend Trap)",
      options: {
        minYield: 8.0,
        maxDpr: 300,
        minStreak: 1,
        maxDer: 2.0,
        limit: 10,
      },
    },
    {
      name: "4. Ultra-Konservatif (Yield >= 4%, DPR <= 60%, DER <= 0.5)",
      options: {
        minYield: 4.0,
        maxDpr: 60,
        minStreak: 3,
        maxDer: 0.5,
        limit: 10,
      },
    },
  ];

  for (const scenario of scenarios) {
    console.log(`📌 SKENARIO: ${scenario.name}`);
    const startTime = performance.now();

    try {
      const result = screenDividends(scenario.options);
      const duration = (performance.now() - startTime).toFixed(0);

      console.log(
        `   Filter Diterapkan : ${JSON.stringify(result.filter_applied)}`,
      );
      console.log(`   Total Lolos       : ${result.count} emiten`);
      console.log(`   Waktu Eksekusi    : ${duration}ms\n`);

      if (result.data.length > 0) {
        console.table(
          result.data.map((item) => ({
            Kode: item.code,
            Harga: `Rp ${item.last_price.toLocaleString("id-ID")}`,
            Sektor: item.sector || "-",
            "TTM DPS": `Rp ${item.ttm_dps}`,
            "Yield (%)": `${item.calculated_yield}%`,
            "DPR Terakhir":
              item.latest_dpr !== null
                ? `${item.latest_dpr}% (${item.latest_dpr_year})`
                : "N/A",
            Streak: `${item.consecutive_years} Thn`,
            DER: item.der !== null ? `${item.der}x` : "N/A",
            PBV: item.pbv !== null ? `${item.pbv}x` : "N/A",
          })),
        );
      } else {
        console.log(
          "   ⚠️ Tidak ada emiten yang memenuhi kriteria skenario ini.",
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ [ERROR] Gagal mengeksekusi screener: ${msg}`);
    }

    console.log("\n--------------------------------------------------\n");
  }

  console.log("🎉 Test Screener Selesai!");
  process.exit(0);
}

// Eksekusi skrip tester
testDividendScreener();
