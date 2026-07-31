import BaseClient from "./baseClient";

export interface TradingViewScanRequest {
  tickers: string[];
  columns: string[];
}

export class TradingViewClient extends BaseClient {
  /**
   * Fetch data scanner dari TradingView Indonesia
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
}

export const tradingViewClient = new TradingViewClient();
