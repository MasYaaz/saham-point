import { getActiveUmaStocks } from "../src/services/idxServices/getUMAService";

async function runUmaServiceTester() {
  try {
    const startTime = performance.now();
    const daysBack = 90;

    // Mengambil daftar emiten UMA aktif yang sudah diformat & dideduplikasi
    const result = await getActiveUmaStocks(daysBack);
    const durationMs = parseFloat((performance.now() - startTime).toFixed(2));

    const output = {
      status: "success",
      execution_time_ms: durationMs,
      filter_days_back: daysBack,
      total_count: result.length,
      data: result,
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error: any) {
    const errorOutput = {
      status: "error",
      message: error?.message || String(error),
    };

    console.error(JSON.stringify(errorOutput, null, 2));
  }
}

runUmaServiceTester();
