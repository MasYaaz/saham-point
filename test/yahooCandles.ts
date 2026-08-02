import { fetchYahooCandles } from "../src/services/yahooServices/fetchCandle"; // Sesuaikan path file service-mu
import { safeLog } from "../src/utils/safeLog";

async function runYahooCandlesTester() {
  console.log("\n==================================================");
  console.log("🚀 TESTING YAHOO CANDLES FETCHING SERVICE");
  console.log("==================================================\n");

  const testCases = [{ code: "AMRT", range: "3y" }];

  for (const { code, range } of testCases) {
    try {
      safeLog(
        "info",
        `--- [TEST] Fetching Candle Data: ${code} (Range: ${range}) ---`,
      );

      const startTime = performance.now();
      const result = await fetchYahooCandles(code, range);
      const duration = (performance.now() - startTime).toFixed(2);

      // Guard jika result null atau history kosong
      if (!result || !result.history || result.history.length === 0) {
        safeLog(
          "warn",
          `❌ Gagal mengambil data candle untuk ${code} (Data Kosong/Null).\n`,
        );
        continue;
      }

      const { meta, ticker, interval, history } = result;
      const totalCandles = history.length;

      // Aman dari undefined menggunakan optional chaining & fallback
      const firstCandle = history[0];
      const lastCandle = history[totalCandles - 1];

      if (!firstCandle || !lastCandle) {
        safeLog("warn", `❌ Structure Candle invalid untuk ${code}.\n`);
        continue;
      }

      safeLog(
        "info",
        `✅ Berhasil diproses dalam ${duration}ms! (Total: ${totalCandles} candle bars)`,
      );

      // 1. Metadata Info
      console.log("\n📌 --- METADATA INFO ---");
      console.log({
        symbol: code,
        yahoo_ticker: ticker,
        interval,
        currency: meta?.currency ?? "N/A",
        date_range: `${firstCandle.date} s/d ${lastCandle.date}`,
      });

      // 2. Verifikasi Urutan Tanggal (Ascending)
      const isAscending =
        new Date(firstCandle.date).getTime() <=
        new Date(lastCandle.date).getTime();

      // 3. Verifikasi Keunikan Tanggal (No Duplicates)
      const dateSet = new Set(history.map((c) => c.date));
      const hasNoDuplicates = dateSet.size === totalCandles;

      console.log("\n🔍 --- DATA INTEGRITY CHECKS ---");
      console.table([
        {
          Check: "Urutan Tanggal Kronologis (Oldest -> Newest)",
          Status: isAscending ? "PASSED ✅" : "FAILED ❌",
        },
        {
          Check: "Bebas Tanggal Duplikat",
          Status: hasNoDuplicates ? "PASSED ✅" : "FAILED ❌",
        },
        {
          Check: "Format Tanggal WIB (YYYY-MM-DD)",
          Status: /^\d{4}-\d{2}-\d{2}$/.test(lastCandle.date)
            ? "PASSED ✅"
            : "FAILED ❌",
        },
      ]);

      // 4. Sample Snapshot Candle Terakhir (Most Recent)
      console.log("\n🕯️ --- LAST CANDLE SNAPSHOT ---");
      console.table([lastCandle]);

      console.log("\n--------------------------------------------------\n");
    } catch (error: any) {
      safeLog("error", `❌ Error saat menguji ${code}: ${error.message}\n`);
    }
  }

  console.log("==================================================");
  console.log("🏁 PENGUJIAN CANDLE SELESAI");
  console.log("==================================================\n");
}

runYahooCandlesTester();
