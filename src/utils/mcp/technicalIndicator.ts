import {
  RSI,
  SMA,
  EMA,
  MACD,
  BollingerBands,
  ATR,
  Stochastic,
  ADX,
  OBV,
  CCI,
  WilliamsR,
  MFI,
  PSAR,
  StochasticRSI,
  IchimokuCloud,
  VWAP,
} from "technicalindicators";
import type { CandleHistory } from "../../types";

// ==========================================
// HELPER EVALUASI STATUS INDIKATOR (GROUNDING)
// ==========================================
function getRsiStatus(v: number | null) {
  if (v === null) return null;
  if (v <= 30) return "oversold";
  if (v >= 70) return "overbought";
  return "neutral";
}

function getStochStatus(k: number | null) {
  if (k === null) return null;
  if (k <= 20) return "oversold";
  if (k >= 80) return "overbought";
  return "neutral";
}

function getWilliamsRStatus(wR: number | null) {
  if (wR === null) return null;
  if (wR <= -80) return "oversold";
  if (wR >= -20) return "overbought";
  return "neutral";
}

function getCciStatus(cci: number | null) {
  if (cci === null) return null;
  if (cci <= -100) return "oversold";
  if (cci >= 100) return "overbought";
  return "neutral";
}

function getMfiStatus(mfi: number | null) {
  if (mfi === null) return null;
  if (mfi <= 20) return "oversold";
  if (mfi >= 80) return "overbought";
  return "neutral";
}

/**
 * Helper: Memproses kalkulasi seluruh indikator teknikal dari array data OHLCV
 */
export function computeTechnicalIndicators(history: CandleHistory[]) {
  if (history.length === 0) return null;

  const closePrices = history.map((h) => h.close);
  const highPrices = history.map((h) => h.high);
  const lowPrices = history.map((h) => h.low);
  const volumes = history.map((h) => h.volume);
  const len = history.length;

  const getLast = <T>(arr: T[]): T | null => arr.at(-1) ?? null;

  // 1. Moving Averages (SMA & EMA)
  const sma20 =
    len >= 20
      ? getLast(SMA.calculate({ values: closePrices, period: 20 }))
      : null;
  const sma50 =
    len >= 50
      ? getLast(SMA.calculate({ values: closePrices, period: 50 }))
      : null;
  const sma200 =
    len >= 200
      ? getLast(SMA.calculate({ values: closePrices, period: 200 }))
      : null;

  const ema12 =
    len >= 12
      ? getLast(EMA.calculate({ values: closePrices, period: 12 }))
      : null;
  const ema26 =
    len >= 26
      ? getLast(EMA.calculate({ values: closePrices, period: 26 }))
      : null;
  const ema50 =
    len >= 50
      ? getLast(EMA.calculate({ values: closePrices, period: 50 }))
      : null;
  const ema200 =
    len >= 200
      ? getLast(EMA.calculate({ values: closePrices, period: 200 }))
      : null;

  // 2. Oscillators & Momentum
  const rsi14 =
    len >= 14
      ? getLast(RSI.calculate({ values: closePrices, period: 14 }))
      : null;
  const stochObj =
    len >= 14
      ? getLast(
          Stochastic.calculate({
            high: highPrices,
            low: lowPrices,
            close: closePrices,
            period: 14,
            signalPeriod: 3,
          }),
        )
      : null;
  const stochRsiObj =
    len >= 14
      ? getLast(
          StochasticRSI.calculate({
            values: closePrices,
            rsiPeriod: 14,
            stochasticPeriod: 14,
            kPeriod: 3,
            dPeriod: 3,
          }),
        )
      : null;
  const cci20 =
    len >= 20
      ? getLast(
          CCI.calculate({
            high: highPrices,
            low: lowPrices,
            close: closePrices,
            period: 20,
          }),
        )
      : null;
  const williamsR14 =
    len >= 14
      ? getLast(
          WilliamsR.calculate({
            high: highPrices,
            low: lowPrices,
            close: closePrices,
            period: 14,
          }),
        )
      : null;

  // 3. Trend & Volatility
  const macdObj =
    len >= 26
      ? getLast(
          MACD.calculate({
            values: closePrices,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false,
          }),
        )
      : null;
  const bbObj =
    len >= 20
      ? getLast(
          BollingerBands.calculate({
            values: closePrices,
            period: 20,
            stdDev: 2,
          }),
        )
      : null;
  const atr14 =
    len >= 14
      ? getLast(
          ATR.calculate({
            high: highPrices,
            low: lowPrices,
            close: closePrices,
            period: 14,
          }),
        )
      : null;
  const adxObj =
    len >= 14
      ? getLast(
          ADX.calculate({
            high: highPrices,
            low: lowPrices,
            close: closePrices,
            period: 14,
          }),
        )
      : null;
  const psarVal =
    len >= 2
      ? getLast(
          PSAR.calculate({
            high: highPrices,
            low: lowPrices,
            step: 0.02,
            max: 0.2,
          }),
        )
      : null;
  const ichimokuObj =
    len >= 52
      ? getLast(
          IchimokuCloud.calculate({
            high: highPrices,
            low: lowPrices,
            conversionPeriod: 9,
            basePeriod: 26,
            spanPeriod: 52,
            displacement: 26,
          }),
        )
      : null;

  // 4. Volume-based Indicators
  const obvVal =
    len >= 2
      ? getLast(OBV.calculate({ close: closePrices, volume: volumes }))
      : null;
  const mfi14 =
    len >= 14
      ? getLast(
          MFI.calculate({
            high: highPrices,
            low: lowPrices,
            close: closePrices,
            volume: volumes,
            period: 14,
          }),
        )
      : null;
  const vwapVal =
    len >= 1
      ? getLast(
          VWAP.calculate({
            high: highPrices,
            low: lowPrices,
            close: closePrices,
            volume: volumes,
          }),
        )
      : null;

  // Formatting Nilai
  const rsiVal = rsi14 ? parseFloat(rsi14.toFixed(2)) : null;
  const stochK = stochObj ? parseFloat((stochObj.k ?? 0).toFixed(2)) : null;
  const stochD = stochObj ? parseFloat((stochObj.d ?? 0).toFixed(2)) : null;
  const williamsVal = williamsR14 ? parseFloat(williamsR14.toFixed(2)) : null;
  const cciVal = cci20 ? parseFloat(cci20.toFixed(2)) : null;
  const mfiVal = mfi14 ? parseFloat(mfi14.toFixed(2)) : null;

  // Evaluasi Status
  const rsiStatus = getRsiStatus(rsiVal);
  const stochStatus = getStochStatus(stochK);
  const williamsStatus = getWilliamsRStatus(williamsVal);
  const cciStatus = getCciStatus(cciVal);
  const mfiStatus = getMfiStatus(mfiVal);

  // Kumpulkan Indikator Oversold & Overbought untuk Ringkasan
  const oversoldIndicators: string[] = [];
  const overboughtIndicators: string[] = [];

  if (rsiStatus === "oversold") oversoldIndicators.push(`RSI (${rsiVal})`);
  if (rsiStatus === "overbought") overboughtIndicators.push(`RSI (${rsiVal})`);

  if (stochStatus === "oversold")
    oversoldIndicators.push(`Stochastic K (${stochK})`);
  if (stochStatus === "overbought")
    overboughtIndicators.push(`Stochastic K (${stochK})`);

  if (williamsStatus === "oversold")
    oversoldIndicators.push(`Williams %R (${williamsVal})`);
  if (williamsStatus === "overbought")
    overboughtIndicators.push(`Williams %R (${williamsVal})`);

  if (cciStatus === "oversold") oversoldIndicators.push(`CCI (${cciVal})`);
  if (cciStatus === "overbought") overboughtIndicators.push(`CCI (${cciVal})`);

  if (mfiStatus === "oversold") oversoldIndicators.push(`MFI (${mfiVal})`);
  if (mfiStatus === "overbought") overboughtIndicators.push(`MFI (${mfiVal})`);

  let overallCondition: "oversold" | "overbought" | "neutral" = "neutral";
  if (oversoldIndicators.length >= 2) overallCondition = "oversold";
  else if (overboughtIndicators.length >= 2) overallCondition = "overbought";

  return {
    summary_signals: {
      overall_condition: overallCondition,
      oversold_indicators: oversoldIndicators,
      overbought_indicators: overboughtIndicators,
    },
    moving_averages: {
      sma_20: sma20 ? parseFloat(sma20.toFixed(2)) : null,
      sma_50: sma50 ? parseFloat(sma50.toFixed(2)) : null,
      sma_200: sma200 ? parseFloat(sma200.toFixed(2)) : null,
      ema_12: ema12 ? parseFloat(ema12.toFixed(2)) : null,
      ema_26: ema26 ? parseFloat(ema26.toFixed(2)) : null,
      ema_50: ema50 ? parseFloat(ema50.toFixed(2)) : null,
      ema_200: ema200 ? parseFloat(ema200.toFixed(2)) : null,
    },
    oscillators: {
      rsi_14: {
        value: rsiVal,
        status: rsiStatus, // "oversold" | "overbought" | "neutral"
      },
      stochastic: stochObj
        ? {
            k: stochK,
            d: stochD,
            status: stochStatus, // "oversold" | "overbought" | "neutral"
          }
        : null,
      stochastic_rsi: stochRsiObj
        ? {
            stoch_rsi: parseFloat((stochRsiObj.stochRSI ?? 0).toFixed(2)),
            k: parseFloat((stochRsiObj.k ?? 0).toFixed(2)),
            d: parseFloat((stochRsiObj.d ?? 0).toFixed(2)),
            status: getStochStatus(parseFloat((stochRsiObj.k ?? 0).toFixed(2))),
          }
        : null,
      cci_20: {
        value: cciVal,
        status: cciStatus,
      },
      williams_r_14: {
        value: williamsVal,
        status: williamsStatus,
      },
    },
    trend_and_volatility: {
      macd: macdObj
        ? {
            macd: parseFloat((macdObj.MACD ?? 0).toFixed(2)),
            signal: parseFloat((macdObj.signal ?? 0).toFixed(2)),
            histogram: parseFloat((macdObj.histogram ?? 0).toFixed(2)),
            signal_type:
              (macdObj.histogram ?? 0) > 0
                ? "bullish_crossover"
                : (macdObj.histogram ?? 0) < 0
                  ? "bearish_crossover"
                  : "neutral",
          }
        : null,
      bollinger_bands: bbObj
        ? {
            upper: parseFloat(bbObj.upper.toFixed(2)),
            middle: parseFloat(bbObj.middle.toFixed(2)),
            lower: parseFloat(bbObj.lower.toFixed(2)),
          }
        : null,
      atr_14: atr14 ? parseFloat(atr14.toFixed(2)) : null,
      adx_14: adxObj
        ? {
            adx: parseFloat((adxObj.adx ?? 0).toFixed(2)),
            pdi: parseFloat((adxObj.pdi ?? 0).toFixed(2)),
            mdi: parseFloat((adxObj.mdi ?? 0).toFixed(2)),
            trend_strength:
              (adxObj.adx ?? 0) >= 25 ? "strong_trend" : "weak_or_no_trend",
          }
        : null,
      parabolic_sar: psarVal ? parseFloat(psarVal.toFixed(2)) : null,
      ichimoku_cloud: ichimokuObj
        ? {
            conversion: parseFloat((ichimokuObj.conversion ?? 0).toFixed(2)),
            base: parseFloat((ichimokuObj.base ?? 0).toFixed(2)),
            span_a: parseFloat((ichimokuObj.spanA ?? 0).toFixed(2)),
            span_b: parseFloat((ichimokuObj.spanB ?? 0).toFixed(2)),
          }
        : null,
    },
    volume: {
      obv: obvVal !== null ? Math.round(obvVal) : null,
      mfi_14: {
        value: mfiVal,
        status: mfiStatus,
      },
      vwap: vwapVal ? parseFloat(vwapVal.toFixed(2)) : null,
    },
  };
}
