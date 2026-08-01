// ============================================================================
// TYPES & INTERFACES
// ============================================================================

import IdxClient from "../../client/idxClient";

export interface DailyForeignFlow {
  date: string; // YYYY-MM-DD
  foreignBuyValue: number;
  foreignSellValue: number;
  netForeignValue: number; // Positive = Net Buy, Negative = Net Sell
  foreignBuyVolume: number;
  foreignSellVolume: number;
  netForeignVolume: number;
  closePrice: number;
}

export interface GetForeignFlowInput {
  code: string;
  dates: string[]; // Format: ["YYYYMMDD", ...]
}

export interface ForeignFlowResponse {
  code: string;
  stockName: string;
  periodDays: number;
  dates: string[];
  cumulativeNetForeignValue: number;
  cumulativeNetForeignVolume: number;
  dailyFlows: DailyForeignFlow[];
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

export class ForeignFlowService extends IdxClient {
  /**
   * Mengambil dan mengkalkulasi data Foreign Flow (Net Buy/Sell Asing) saham harian dari BEI.
   */
  async getForeignFlow(
    input: GetForeignFlowInput,
  ): Promise<ForeignFlowResponse> {
    const code = input.code.trim().toUpperCase();
    const dates = Array.from(new Set(input.dates)).filter((d) =>
      /^\d{8}$/.test(d),
    );

    if (!code) throw new Error("Kode ticker saham tidak boleh kosong.");
    if (dates.length === 0) {
      throw new Error("Daftar tanggal harus diisi dengan format YYYYMMDD.");
    }

    // Fetch paralel untuk seluruh tanggal via BaseClient (Native fetch)
    const fetchPromises = dates.map(async (date) => {
      const url = `https://www.idx.co.id/primary/TradingSummary/GetStockSummary?length=9999&date=${date}`;
      const json = await this.fetchJson<{ data?: any[] }>(url);
      const stockList = json?.data || [];

      // Filter manual di client-side karena API BEI mengembalikan bulk stock summary
      const stockItem = stockList.find(
        (item: any) => (item.StockCode || "").toUpperCase() === code,
      );

      return {
        date,
        data: stockItem || null,
      };
    });

    const rawDataList = await Promise.all(fetchPromises);

    const dailyFlows: DailyForeignFlow[] = [];
    let cumulativeNetValue = 0;
    let cumulativeNetVolume = 0;
    let stockName = "";

    for (const entry of rawDataList) {
      const item = entry.data;
      if (!item) continue;

      if (!stockName && item.StockName) {
        stockName = item.StockName;
      }

      const closePrice = item.Close || 0;
      const totalVolume = item.Volume || 0;
      const totalValue = item.Value || 0;

      // Hitung harga rata-rata transaksi harian (Average Price = Value / Volume)
      const avgPrice = totalVolume > 0 ? totalValue / totalVolume : closePrice;

      // Extract Foreign Buy & Sell Volume (Field 'ForeignBuy' & 'ForeignSell' pada API BEI adalah lembar saham)
      const fBuyVol = item.ForeignBuy || 0;
      const fSellVol = item.ForeignSell || 0;
      const netVol = fBuyVol - fSellVol;

      // Estimasi Value dalam Rupiah (Volume * Average Price)
      const fBuyVal = Math.round(fBuyVol * avgPrice);
      const fSellVal = Math.round(fSellVol * avgPrice);
      const netVal = fBuyVal - fSellVal;

      // Format Tanggal YYYYMMDD -> YYYY-MM-DD
      const formattedDate = `${entry.date.slice(0, 4)}-${entry.date.slice(4, 6)}-${entry.date.slice(6, 8)}`;

      dailyFlows.push({
        date: formattedDate,
        foreignBuyValue: fBuyVal,
        foreignSellValue: fSellVal,
        netForeignValue: netVal,
        foreignBuyVolume: fBuyVol,
        foreignSellVolume: fSellVol,
        netForeignVolume: netVol,
        closePrice,
      });

      cumulativeNetValue += netVal;
      cumulativeNetVolume += netVol;
    }

    return {
      code,
      stockName,
      periodDays: dailyFlows.length,
      dates,
      cumulativeNetForeignValue: cumulativeNetValue,
      cumulativeNetForeignVolume: cumulativeNetVolume,
      dailyFlows,
    };
  }
}

// Export singleton instance & helper function
const foreignFlowService = new ForeignFlowService();

export async function getForeignFlow(
  input: GetForeignFlowInput,
): Promise<ForeignFlowResponse> {
  return foreignFlowService.getForeignFlow(input);
}
