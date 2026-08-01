import IdxClient from "../../client/idxClient";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface IndexPerformance {
  code: string;
  name: string;
  close: number;
  change: number;
  changePercent: number;
}

export interface StockMoverItem {
  code: string;
  name: string;
  closePrice: number;
  change: number;
  changePercent: number;
  volume: number;
  value: number;
}

export interface MarketOverviewResponse {
  date: string;
  indices: IndexPerformance[];
  topGainers: StockMoverItem[];
  topLosers: StockMoverItem[];
  topValue: StockMoverItem[];
  topVolume: StockMoverItem[];
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

export class MarketOverviewService extends IdxClient {
  /**
   * Internal helper untuk mengambil ringkasan pasar 1 tanggal spesifik.
   */
  private async fetchSingleOverview(
    dateStr?: string,
  ): Promise<MarketOverviewResponse> {
    const [isoDate = ""] = new Date().toISOString().split("T");
    const targetDate = dateStr
      ? dateStr.replace(/-/g, "")
      : isoDate.replace(/-/g, "");

    // Fetch paralel dari 2 endpoint resmi BEI menggunakan BaseClient
    const [rawIndices, rawStocksJson] = await Promise.all([
      this.fetchJson<any[]>("https://www.idx.co.id/primary/home/GetIndexList"),
      this.fetchJson<{ data?: any[] }>(
        `https://www.idx.co.id/primary/TradingSummary/GetStockSummary?length=9999&date=${targetDate}`,
      ),
    ]);

    const rawIndicesList = rawIndices || [];
    const rawStocksList = rawStocksJson?.data || [];

    // 1. Parsing Indeks Utama
    const indices: IndexPerformance[] = rawIndicesList.map((item: any) => {
      const close = parseFloat(item.Closing || item.Current || "0");
      const change = parseFloat(item.Change || "0");
      const changePercent = parseFloat(item.Percent || item.Percentage || "0");

      return {
        code: item.IndexCode || "",
        name: item.Name || item.IndexCode || "",
        close,
        change,
        changePercent,
      };
    });

    // 2. Mapping & Filter Saham Aktif Ditransaksikan
    const validStocks: StockMoverItem[] = rawStocksList
      .filter((item: any) => item.Volume > 0 && item.Previous > 0)
      .map((item: any) => {
        const prev = item.Previous || item.Close || 1;
        const change = item.Change || 0;
        const changePercent = Number(((change / prev) * 100).toFixed(2));

        return {
          code: item.StockCode || "",
          name: item.StockName || "",
          closePrice: item.Close || 0,
          change,
          changePercent,
          volume: item.Volume || 0,
          value: item.Value || 0,
        };
      });

    // 3. Sorting In-Memory untuk Kategori Top Movers
    const topGainers = [...validStocks]
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 10);

    const topLosers = [...validStocks]
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 10);

    const topValue = [...validStocks]
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const topVolume = [...validStocks]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);

    const formattedDate = `${targetDate.slice(0, 4)}-${targetDate.slice(4, 6)}-${targetDate.slice(6, 8)}`;

    return {
      date: formattedDate,
      indices: indices.slice(0, 10),
      topGainers,
      topLosers,
      topValue,
      topVolume,
    };
  }

  /**
   * Mengambil ringkasan pasar (Market Overview) untuk satu atau banyak tanggal sekaligus.
   */
  async getMarketOverview(dateStr?: string): Promise<MarketOverviewResponse>;
  async getMarketOverview(dates: string[]): Promise<MarketOverviewResponse[]>;
  async getMarketOverview(
    dateInput?: string | string[],
  ): Promise<MarketOverviewResponse | MarketOverviewResponse[]> {
    if (Array.isArray(dateInput)) {
      const uniqueDates = Array.from(new Set(dateInput)).filter(Boolean);

      if (uniqueDates.length === 0) {
        return [await this.fetchSingleOverview()];
      }

      // Fetch paralel untuk seluruh tanggal dalam array
      return await Promise.all(
        uniqueDates.map((d) => this.fetchSingleOverview(d)),
      );
    }

    return await this.fetchSingleOverview(dateInput);
  }
}

// Export singleton instance & helper functions
const marketOverviewService = new MarketOverviewService();

export async function getMarketOverview(
  dateStr?: string,
): Promise<MarketOverviewResponse>;
export async function getMarketOverview(
  dates: string[],
): Promise<MarketOverviewResponse[]>;
export async function getMarketOverview(
  dateInput?: string | string[],
): Promise<MarketOverviewResponse | MarketOverviewResponse[]> {
  return marketOverviewService.getMarketOverview(dateInput as any);
}
