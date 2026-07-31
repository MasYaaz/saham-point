// ============================================================================
// TYPES & INTERFACES (Sesuai JSON Asli IDX)
// ============================================================================

import BaseClient from "../client/idxClient";

/** Raw JSON item dari endpoint https://www.idx.co.id/primary/TradingSummary/GetBrokerSummary */
export interface IDXBrokerRawItem {
  No: number;
  IDBrokerSummary: number;
  Date: string;
  IDFirm: string; // Kode Broker (contoh: "AD", "BK", "ZP")
  FirmName: string; // Nama Sekuritas
  Volume: number; // Total Volume Transaksi (lembar saham)
  Value: number; // Total Nilai Transaksi (Rp)
  Frequency: number; // Total Frekuensi Transaksi
}

/** Output agregasi transaksi broker */
export interface BrokerSummaryAggregate {
  code: string;
  name: string;
  totalVolume: number;
  totalValue: number;
  totalFrequency: number;
  avgPrice: number; // Harga rata-rata transaksi per lembar (Rp)
}

export interface GetBrokerSummaryInput {
  ticker: string;
  dates: string[]; // Format: ["YYYYMMDD", ...] Contoh: ["20260720"]
}

export interface BrokerSummaryResponse {
  ticker: string;
  periodDays: number;
  dates: string[];
  grandTotalVolume: number;
  grandTotalValue: number;
  grandTotalFrequency: number;
  topBrokersByValue: BrokerSummaryAggregate[];
  allBrokers: BrokerSummaryAggregate[];
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

export class BrokerSummaryService extends BaseClient {
  /**
   * Mengambil dan mengagregasi data Broker Summary BEI secara In-Memory (RAM).
   */
  async getBrokerSummary(
    input: GetBrokerSummaryInput,
  ): Promise<BrokerSummaryResponse> {
    const ticker = input.ticker.trim().toUpperCase();
    const dates = Array.from(new Set(input.dates)).filter((d) =>
      /^\d{8}$/.test(d),
    );

    if (!ticker) {
      throw new Error("Kode ticker saham tidak boleh kosong.");
    }
    if (dates.length === 0) {
      throw new Error("Daftar tanggal harus diisi dengan format YYYYMMDD.");
    }

    // 1. Fetch Paralel untuk semua tanggal menggunakan fetchJson dari BaseClient
    const fetchPromises = dates.map(async (date) => {
      const url = `https://www.idx.co.id/primary/TradingSummary/GetBrokerSummary?length=9999&date=${date}&code=${ticker}`;
      const json = await this.fetchJson<{ data?: IDXBrokerRawItem[] }>(url);
      return {
        date,
        data: json?.data || [],
      };
    });

    const rawDataList = await Promise.all(fetchPromises);

    // 2. In-Memory Aggregation
    const summaryMap: Record<string, BrokerSummaryAggregate> = {};
    let grandTotalValue = 0;
    let grandTotalVolume = 0;
    let grandTotalFrequency = 0;

    for (const dayEntry of rawDataList) {
      for (const item of dayEntry.data) {
        const code = item.IDFirm;
        if (!code) continue;

        if (!summaryMap[code]) {
          summaryMap[code] = {
            code,
            name: item.FirmName || code,
            totalVolume: 0,
            totalValue: 0,
            totalFrequency: 0,
            avgPrice: 0,
          };
        }

        const vol = item.Volume || 0;
        const val = item.Value || 0;
        const freq = item.Frequency || 0;

        summaryMap[code].totalVolume += vol;
        summaryMap[code].totalValue += val;
        summaryMap[code].totalFrequency += freq;

        grandTotalVolume += vol;
        grandTotalValue += val;
        grandTotalFrequency += freq;
      }
    }

    // 3. Hitung Harga Rata-rata per Lembar & Urutkan berdasarkan Transaksi Terbesar
    const allBrokers = Object.values(summaryMap).map((b) => ({
      ...b,
      avgPrice:
        b.totalVolume > 0 ? Math.round(b.totalValue / b.totalVolume) : 0,
    }));

    // Urutkan berdasarkan Total Nilai Transaksi (Value) terbesar
    allBrokers.sort((a, b) => b.totalValue - a.totalValue);

    return {
      ticker,
      periodDays: dates.length,
      dates,
      grandTotalVolume,
      grandTotalValue,
      grandTotalFrequency,
      topBrokersByValue: allBrokers.slice(0, 10), // Top 10 Broker Paling Aktif
      allBrokers,
    };
  }
}

// Export singleton instance / function helper agar mudah dipanggil di MCP tool handler
const brokerSummaryService = new BrokerSummaryService();

export async function getBrokerSummary(
  input: GetBrokerSummaryInput,
): Promise<BrokerSummaryResponse> {
  return brokerSummaryService.getBrokerSummary(input);
}
