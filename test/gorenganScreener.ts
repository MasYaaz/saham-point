import { getGorenganStocks } from "../src/services/screenerService";

async function runGorenganScreenerTester() {
  try {
    const startTime = performance.now();
    const limit = 10;

    const result = await getGorenganStocks(limit);
    const durationMs = parseFloat((performance.now() - startTime).toFixed(2));

    const output = {
      status: "success",
      execution_time_ms: durationMs,
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

runGorenganScreenerTester();
