import { stockbitBroxsumService } from "../src/services/stockbitServices/fetchBroxSum";

async function testBroxsum() {
  try {
    const data = await stockbitBroxsumService.getBroxsum({
      ticker: "PTBA",
      fromDate: "2026-05-24",
      toDate: "2026-07-24",
    });

    console.log("\n📦 Return JSON Lengkap:");
    console.log(JSON.stringify(data, null, 2));
  } catch (error: any) {
    console.error("Gagal mendapatkan broxsum:", error.message);
  }
}

testBroxsum();
