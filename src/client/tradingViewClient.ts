import BaseClient from "./baseClient";

export interface TradingViewScanRequest {
  tickers: string[];
  columns: string[];
}

export interface RawStockData {
  code: string;
  name: string;
  sector: string;
  notation: string;
  last_price: number;
}

interface TradingViewScanResponse {
  data: Array<{
    s: string;
    d: [string, string, string | null, number | null];
  }>;
}

export class TradingViewClient extends BaseClient {
  /**
   * Fetch data scanner dari TradingView Indonesia berdasarkan list ticker
   */
  async scanIndonesia(tickers: string[], columns: string[]) {
    const url = "https://scanner.tradingview.com/indonesia/scan";

    return this.fetchJson<any>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbols: { tickers },
        columns,
      }),
    });
  }

  /**
   * Fetch seluruh emiten IHSG dari TradingView Screener API
   */
  async fetchAllStocks(): Promise<RawStockData[]> {
    const url = "https://scanner.tradingview.com/indonesia/scan";
    const payload = {
      filter: [
        {
          left: "type",
          operation: "in_range",
          right: ["stock", "dr", "fund"],
        },
      ],
      options: { lang: "en" },
      markets: ["indonesia"],
      columns: ["name", "description", "sector", "close"],
      sort: { sortBy: "name", sortOrder: "asc" },
    };

    const result = await this.fetchJson<TradingViewScanResponse>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!result?.data || !Array.isArray(result.data)) {
      return [];
    }

    return result.data.map((item) => {
      const code = item.d[0] || item.s.replace("IDX:", "");
      return {
        code,
        name: item.d[1] || code,
        sector: item.d[2] || "Unknown",
        notation: "",
        last_price: item.d[3] ?? 0,
      };
    });
  }
}

export const tradingViewClient = new TradingViewClient();
