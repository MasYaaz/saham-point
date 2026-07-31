import {
  getMarketOverview,
  type MarketOverviewResponse,
  type IndexPerformance,
  type StockMoverItem,
} from "../src/services/marketOverviewService";
import { getWeekdaysInRange } from "../src/utils/mcp/getWeeksDay";

/**
 * Helper untuk mencetak SELURUH kategori data Market Overview tanpa truncation
 */
function printFullMarketOverview(overview: MarketOverviewResponse) {
  console.log(`\n==================================================`);
  console.log(`📅 TANGGAL DATA : ${overview.date}`);
  console.log(`==================================================`);

  // 1. Semua Indeks Utama
  console.log(`\n📊 Performa Indeks Utama (Total ${overview.indices.length}):`);
  console.table(
    overview.indices.map((idx: IndexPerformance) => ({
      Kode: idx.code,
      "Nama Indeks": idx.name,
      Close: idx.close.toLocaleString("id-ID"),
      Change: idx.change,
      "Change (%)": `${idx.changePercent}%`,
    })),
  );

  // 2. Semua Top Gainers
  console.log(`\n🚀 Top Gainers (Total ${overview.topGainers.length}):`);
  console.table(
    overview.topGainers.map((g: StockMoverItem) => ({
      Kode: g.code,
      Nama: g.name,
      "Harga Close": g.closePrice.toLocaleString("id-ID"),
      "Change (%)": `${g.changePercent}%`,
      "Total Value": `Rp ${g.value.toLocaleString("id-ID")}`,
      "Total Volume": g.volume.toLocaleString("id-ID"),
    })),
  );

  // 3. Semua Top Losers
  console.log(`\n🔻 Top Losers (Total ${overview.topLosers.length}):`);
  console.table(
    overview.topLosers.map((l: StockMoverItem) => ({
      Kode: l.code,
      Nama: l.name,
      "Harga Close": l.closePrice.toLocaleString("id-ID"),
      "Change (%)": `${l.changePercent}%`,
      "Total Value": `Rp ${l.value.toLocaleString("id-ID")}`,
      "Total Volume": l.volume.toLocaleString("id-ID"),
    })),
  );

  // 4. Semua Top Active Value
  console.log(`\n💰 Top Active Value (Total ${overview.topValue.length}):`);
  console.table(
    overview.topValue.map((v: StockMoverItem) => ({
      Kode: v.code,
      Nama: v.name,
      "Harga Close": v.closePrice.toLocaleString("id-ID"),
      "Change (%)": `${v.changePercent}%`,
      "Total Value": `Rp ${v.value.toLocaleString("id-ID")}`,
      "Volume (Lbr)": v.volume.toLocaleString("id-ID"),
    })),
  );

  // 5. Semua Top Active Volume
  console.log(`\n📦 Top Active Volume (Total ${overview.topVolume.length}):`);
  console.table(
    overview.topVolume.map((vol: StockMoverItem) => ({
      Kode: vol.code,
      Nama: vol.name,
      "Harga Close": vol.closePrice.toLocaleString("id-ID"),
      "Change (%)": `${vol.changePercent}%`,
      "Volume (Lbr)": vol.volume.toLocaleString("id-ID"),
      "Total Value": `Rp ${vol.value.toLocaleString("id-ID")}`,
    })),
  );
}

export async function testMarketOverview(dateInput?: string | string[]) {
  console.log("--------------------------------------------------");
  console.log("1️⃣ Testing: Market Overview Service (Full Data Output)");
  console.log("--------------------------------------------------");
  const startTime = Date.now();

  // Sampel Default: 1 Minggu Hari Kerja (20 - 24 Juli 2026)
  const defaultDates = getWeekdaysInRange("2026-07-20", "2026-07-24").map(
    (d: string) => d.replace(/-/g, ""),
  );

  const targetInput = dateInput || defaultDates;

  try {
    const result = await getMarketOverview(targetInput as any);

    if (Array.isArray(result)) {
      console.log(
        `📡 Berhasil menarik data ringkasan pasar untuk ${result.length} hari bursa!\n`,
      );

      // 1. Tampilkan Ringkasan Komparasi Per Hari
      console.log("📊 Summary Ringkasan Harian:");
      console.table(
        result.map((day: MarketOverviewResponse) => {
          const ihsg =
            day.indices.find(
              (i: IndexPerformance) =>
                i.code === "COMPOSITE" || i.code === "IHSG",
            ) || day.indices[0];
          const topGainer = day.topGainers[0];
          const topVal = day.topValue[0];

          return {
            Tanggal: day.date,
            "IHSG Close": ihsg ? ihsg.close.toLocaleString("id-ID") : "-",
            "IHSG Change (%)": ihsg ? `${ihsg.changePercent}%` : "-",
            "Top Gainer": topGainer
              ? `${topGainer.code} (+${topGainer.changePercent}%)`
              : "-",
            "Top Value": topVal
              ? `${topVal.code} (Rp ${(topVal.value / 1e9).toFixed(2)}B)`
              : "-",
          };
        }),
      );

      // 2. Tampilkan SELURUH detail data untuk setiap harinya
      for (const day of result) {
        printFullMarketOverview(day);
      }
    } else {
      // Single Date
      printFullMarketOverview(result);
    }
  } catch (err) {
    console.error("❌ Market Overview Error:", err);
  } finally {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n--------------------------------------------------");
    console.log(`⏱️ Total Waktu Pengujian: ${duration} detik`);
    console.log("✨ Pengujian Market Overview Selesai.");
  }
}

if (import.meta.main || process.argv[1]?.includes("testMarketOverview")) {
  testMarketOverview();
}
