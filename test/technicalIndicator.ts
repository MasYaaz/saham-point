import { getTechnicalIndicators } from "../src/services/technicalService";
import { safeLog } from "../src/utils/safeLog";

async function runTechnicalIndicatorTester() {
  console.log("\n==================================================");
  console.log("🚀 TESTING TECHNICAL INDICATORS SERVICE (GROUNDING)");
  console.log("==================================================\n");

  const testTickers = ["AMRT"];

  for (const ticker of testTickers) {
    try {
      safeLog(
        "info",
        `--- [TEST] Mengambil Indikator Teknikal untuk: ${ticker} ---`,
      );

      const startTime = performance.now();
      const result = await getTechnicalIndicators(ticker, "1y");
      const duration = (performance.now() - startTime).toFixed(2);

      if (!result || !result.indicators) {
        safeLog(
          "warn",
          `❌ Gagal mengambil data teknikal untuk ${ticker} (Data Kosong/Null).\n`,
        );
        continue;
      }

      const { meta, indicators } = result;
      const { summary_signals, oscillators, trend_and_volatility } = indicators;

      safeLog(
        "info",
        `✅ Berhasil diproses dalam ${duration}ms! (${meta.total_bars_analyzed} bars analyzed)\n`,
      );

      // 1. Cetak Grounding Sinyal Utama
      console.log("📊 --- SUMMARY SIGNALS (GROUNDED RESULT) ---");
      console.log({
        ticker: meta.symbol,
        overall_condition: summary_signals.overall_condition.toUpperCase(),
        oversold_indicators: summary_signals.oversold_indicators,
        overbought_indicators: summary_signals.overbought_indicators,
      });

      // 2. Snapshot Indikator Oscillators & Status
      console.log("\n📈 --- OSCILLATORS DETAIL & STATUS ---");
      console.table([
        {
          Indicator: "RSI (14)",
          Value: oscillators.rsi_14.value,
          Status: oscillators.rsi_14.status,
        },
        {
          Indicator: "Stochastic %K",
          Value: oscillators.stochastic?.k ?? "N/A",
          Status: oscillators.stochastic?.status ?? "N/A",
        },
        {
          Indicator: "Williams %R (14)",
          Value: oscillators.williams_r_14.value,
          Status: oscillators.williams_r_14.status,
        },
        {
          Indicator: "CCI (20)",
          Value: oscillators.cci_20.value,
          Status: oscillators.cci_20.status,
        },
        {
          Indicator: "MFI (14)",
          Value: indicators.volume.mfi_14.value,
          Status: indicators.volume.mfi_14.status,
        },
      ]);

      // 3. Snapshot Trend & Signal Cross
      console.log("\n🌊 --- TREND & VOLATILITY ---");
      console.log({
        MACD_Histogram: trend_and_volatility.macd?.histogram,
        MACD_Signal_Type: trend_and_volatility.macd?.signal_type,
        ADX_Strength: trend_and_volatility.adx_14?.trend_strength,
      });

      console.log("\n--------------------------------------------------\n");
    } catch (error: any) {
      safeLog("error", `❌ Error saat menguji ${ticker}: ${error.message}\n`);
    }
  }

  console.log("==================================================");
  console.log("🏁 PENGUJIAN TEKNIKAL SELESAI");
  console.log("==================================================\n");
}

runTechnicalIndicatorTester();
